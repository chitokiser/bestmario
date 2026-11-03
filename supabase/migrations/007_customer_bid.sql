-- 007: 고객 희망가 제시 (역경매) — 급구·단순 작업에만 제한적으로 허용
--
-- 정책: 고객이 지나치게 낮은 가격을 부르면 검증된 기술자의 참여가 줄어 생태계가 무너진다.
--       그래서 (1) 단순 작업으로 표시된 상품에서만 쓸 수 있고 (2) 플랫폼 하한가(정찰가의 N%)
--       아래는 DB 가 접수를 거부한다. 클라이언트 검증은 안내용일 뿐 기준은 여기다.
--
-- 흐름: 고객이 희망가로 주문 → 해당 분야 승인 기술자에게 알림 → 먼저 수락한 기술자가 그 가격으로 배정
--       (기존 customer_bid 수락 경로 재사용). 결제 금액은 order_expected_amount 가 희망가를 돌려준다.

alter table service_orders
  add column if not exists offered_price int check (offered_price is null or offered_price > 0);

alter table service_products
  add column if not exists bid_allowed boolean not null default false;

-- 단순 작업만 허용 (임시 기준 — 관리자가 service_products.bid_allowed 로 조정한다)
update service_products set bid_allowed = true
 where id in ('hvac-clean-1', 'clean-home-4h', 'clean-sofa', 'pest-cockroach', 'pest-mosquito');

-- 하한가 비율(%). 임시 80 — 운영하면서 service_settings 에서 조정한다.
insert into service_settings (key, value) values ('bid_floor_percent', '80')
  on conflict (key) do nothing;

-- ── 하한가 계산 ─────────────────────────────────────────────────────────
create or replace function bid_floor_price(p_product_id text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select ceil(p.base_price * coalesce(
           (select nullif(value, '')::numeric from service_settings where key = 'bid_floor_percent'), 80
         ) / 100.0)::int
    from service_products p
   where p.id = p_product_id
$$;

grant execute on function bid_floor_price(text) to anon, authenticated;

-- ── 검증 트리거 ─────────────────────────────────────────────────────────
create or replace function guard_order_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
  v_floor   int;
  v_base    int;
begin
  if new.order_type <> 'customer_bid' then
    if new.offered_price is not null then
      raise exception '희망가는 가격 제시 주문에서만 쓸 수 있습니다';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.offered_price is not distinct from old.offered_price then
    return new;
  end if;

  if new.product_id is null then
    raise exception '가격 제시 주문은 서비스 항목을 선택해야 합니다';
  end if;
  select bid_allowed, base_price into v_allowed, v_base from service_products where id = new.product_id;
  if not coalesce(v_allowed, false) then
    raise exception '이 항목은 가격 제시를 지원하지 않습니다 (정찰가 또는 견적 요청을 이용해 주세요)';
  end if;
  if new.offered_price is null then
    raise exception '희망 금액을 입력해 주세요';
  end if;

  v_floor := bid_floor_price(new.product_id);
  if new.offered_price < v_floor then
    raise exception '희망가는 최소 % VND 이상이어야 합니다', v_floor;
  end if;
  if new.offered_price > v_base * 3 then
    raise exception '희망가가 정찰가의 3배를 넘을 수 없습니다';
  end if;

  if tg_op = 'UPDATE' and not guard_bypass() then
    -- 고객은 아직 아무도 수락하지 않은 대기 주문의 희망가만 올릴 수 있다 (내리기·사후 변경 금지)
    if old.status <> 'pending' or old.technician_uid is not null then
      raise exception '이미 수락된 주문의 희망가는 바꿀 수 없습니다';
    end if;
    if new.offered_price < old.offered_price then
      raise exception '희망가는 올리는 방향으로만 수정할 수 있습니다';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_order_bid_trg on service_orders;
create trigger guard_order_bid_trg
  before insert or update of offered_price, order_type, product_id on service_orders
  for each row execute function guard_order_bid();

-- ── 결제 금액의 단일 기준에 희망가 반영 ──────────────────────────────────
create or replace function order_expected_amount(p_order_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select q.price
       from quotations q
      where q.order_id = p_order_id and q.status = 'accepted'
      order by q.created_at
      limit 1),
    (select o.offered_price from service_orders o where o.id = p_order_id),
    (select p.base_price
       from service_orders o
       join service_products p on p.id = o.product_id
      where o.id = p_order_id),
    0
  )
$$;
