-- 012: 기술자 상품 모음 — 기술자가 상품명·단가(고정가)를 먼저 제안해 판매
--
-- 예) "2D CAD 인테리어 설계" 10,000 VND / ㎡.
-- 흐름: 기술자가 등록(save_tech_product) → 관리자 심사(decide_tech_product) → 공개(active)
--       → 고객이 수량을 정해 주문(order_tech_product) → 그 기술자에게 바로 배정.
-- 가격은 주문 시점 값(unit_price)을 주문에 복사해 둔다. 이후 상품을 고쳐도 기존 주문 금액은 변하지 않는다.
-- 상품을 고치면(이름·단가·단위 등) 다시 심사를 받아야 한다 — 승인 뒤 가격을 바꿔치기하는 것을 막는다.

create table if not exists technician_products (
  id             uuid primary key default gen_random_uuid(),
  technician_uid text not null references users (uid) on delete cascade,
  category_id    text not null references service_categories (id),
  name           text not null check (length(btrim(name)) between 2 and 80),
  description    text not null default '' check (length(description) <= 1000),
  unit_label     text not null check (length(btrim(unit_label)) between 1 and 10),
  unit_price     int  not null check (unit_price between 1000 and 100000000),
  min_qty        int  not null default 1 check (min_qty between 1 and 10000),
  status         text not null default 'pending'
                   check (status in ('pending', 'active', 'rejected', 'hidden')),
  reject_reason  text not null default '',
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists technician_products_tech_idx on technician_products (technician_uid);
create index if not exists technician_products_active_idx on technician_products (category_id) where status = 'active';

alter table technician_products enable row level security;

-- 본인 상품과 관리자만 직접 읽는다. 공개 노출은 아래 marketplace_* 함수로만 한다.
drop policy if exists tech_products_select on technician_products;
create policy tech_products_select on technician_products
  for select using (technician_uid = firebase_uid() or is_admin());
-- 쓰기 정책 없음: RPC 로만 쓴다.

-- ── 주문에 상품 정보 복사 ───────────────────────────────────────────────
alter table service_orders
  add column if not exists tech_product_id uuid references technician_products (id) on delete set null,
  add column if not exists quantity        int check (quantity is null or quantity between 1 and 10000),
  add column if not exists unit_price      int check (unit_price is null or unit_price > 0),
  add column if not exists product_name    text,
  add column if not exists unit_label      text;

-- 상품 주문 정보는 RPC(내부 플래그)로만 만들고, 만든 뒤에는 누구도 바꿀 수 없다.
create or replace function guard_order_tech_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if guard_bypass() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.tech_product_id is not null or new.quantity is not null or new.unit_price is not null
       or new.product_name is not null or new.unit_label is not null then
      raise exception '상품 주문은 상품 페이지에서만 만들 수 있습니다';
    end if;
  else
    if new.tech_product_id is distinct from old.tech_product_id
       or new.quantity is distinct from old.quantity
       or new.unit_price is distinct from old.unit_price
       or new.product_name is distinct from old.product_name
       or new.unit_label is distinct from old.unit_label then
      raise exception '상품 주문의 수량·단가는 변경할 수 없습니다';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_order_tech_product_trg on service_orders;
create trigger guard_order_tech_product_trg
  before insert or update on service_orders
  for each row execute function guard_order_tech_product();

-- 결제 금액의 단일 기준: 수락된 견적 → 상품 주문(단가×수량) → 희망가 → 정찰가
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
    (select (o.quantity::bigint * o.unit_price)::int
       from service_orders o
      where o.id = p_order_id and o.quantity is not null and o.unit_price is not null),
    (select o.offered_price from service_orders o where o.id = p_order_id),
    (select p.base_price
       from service_orders o
       join service_products p on p.id = o.product_id
      where o.id = p_order_id),
    0
  )
$$;

-- ── 등록·수정 (기술자) ──────────────────────────────────────────────────
create or replace function save_tech_product(
  p_id          uuid,
  p_category    text,
  p_name        text,
  p_description text,
  p_unit        text,
  p_unit_price  int,
  p_min_qty     int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := firebase_uid();
  v_status text;
  v_skills text[];
  v_id     uuid := p_id;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  select status, skills into v_status, v_skills from technician_profiles where uid = v_uid;
  if v_status is distinct from 'active' then
    raise exception '승인된 기술자만 상품을 등록할 수 있습니다';
  end if;
  if not (p_category = any (v_skills)) then
    raise exception '승인된 기술분야에서만 상품을 등록할 수 있습니다';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or length(btrim(p_name)) > 80 then
    raise exception '상품명은 2~80자로 입력해 주세요';
  end if;
  if length(coalesce(p_description, '')) > 1000 then
    raise exception '설명은 1000자 이내로 입력해 주세요';
  end if;
  if length(btrim(coalesce(p_unit, ''))) not between 1 and 10 then
    raise exception '단위는 1~10자로 입력해 주세요 (예: ㎡, 건, 대)';
  end if;
  if p_unit_price is null or p_unit_price < 1000 or p_unit_price > 100000000 then
    raise exception '단가는 1,000 ~ 100,000,000 VND 사이여야 합니다';
  end if;
  if p_min_qty is null or p_min_qty < 1 or p_min_qty > 10000 then
    raise exception '최소 수량은 1 ~ 10,000 사이여야 합니다';
  end if;

  if v_id is null then
    if (select count(*) from technician_products where technician_uid = v_uid) >= 30 then
      raise exception '상품은 최대 30개까지 등록할 수 있습니다';
    end if;
    insert into technician_products (technician_uid, category_id, name, description, unit_label, unit_price, min_qty)
    values (v_uid, p_category, btrim(p_name), btrim(coalesce(p_description, '')), btrim(p_unit), p_unit_price, p_min_qty)
    returning id into v_id;
  else
    -- 고치면 다시 심사를 받는다 (승인 뒤 가격 바꿔치기 방지)
    update technician_products
       set category_id = p_category, name = btrim(p_name), description = btrim(coalesce(p_description, '')),
           unit_label = btrim(p_unit), unit_price = p_unit_price, min_qty = p_min_qty,
           status = 'pending', reject_reason = '', approved_at = null, updated_at = now()
     where id = v_id and technician_uid = v_uid;
    if not found then
      raise exception '본인 상품만 수정할 수 있습니다';
    end if;
  end if;
  return v_id;
end;
$$;

-- 공개 중단/재개 (재개는 심사를 통과했고 이후 수정이 없는 상품만)
create or replace function set_tech_product_hidden(p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := firebase_uid();
  r technician_products%rowtype;
begin
  select * into r from technician_products where id = p_id and technician_uid = v_uid;
  if not found then
    raise exception '본인 상품만 변경할 수 있습니다';
  end if;
  if p_hidden then
    if r.status <> 'active' then
      raise exception '공개 중인 상품만 숨길 수 있습니다';
    end if;
    update technician_products set status = 'hidden', updated_at = now() where id = p_id;
  else
    if r.status <> 'hidden' or r.approved_at is null then
      raise exception '숨긴 상품만 다시 공개할 수 있습니다';
    end if;
    update technician_products set status = 'active', updated_at = now() where id = p_id;
  end if;
end;
$$;

-- ── 심사 (관리자) ───────────────────────────────────────────────────────
create or replace function decide_tech_product(p_id uuid, p_approve boolean, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r technician_products%rowtype;
begin
  if not is_admin() then
    raise exception '관리자만 처리할 수 있습니다';
  end if;
  select * into r from technician_products where id = p_id for update;
  if not found then
    raise exception '상품을 찾을 수 없습니다';
  end if;
  if r.status <> 'pending' then
    raise exception '심사 대기 중인 상품이 아닙니다';
  end if;
  if p_approve then
    update technician_products set status = 'active', approved_at = now(), reject_reason = '', updated_at = now() where id = p_id;
  else
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception '반려 사유를 입력해야 합니다';
    end if;
    update technician_products set status = 'rejected', reject_reason = btrim(p_reason), updated_at = now() where id = p_id;
  end if;
end;
$$;

-- ── 공개 조회 (이름 가림, 승인된 기술자의 공개 상품만) ───────────────────
create or replace function marketplace_products(p_category text default null, p_limit int default 30)
returns table (
  id            uuid,
  category_id   text,
  name          text,
  description   text,
  unit_label    text,
  unit_price    int,
  min_qty       int,
  tech_name     text,
  tech_rating   numeric,
  tech_reviews  int,
  tech_done     int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.category_id, p.name, p.description, p.unit_label, p.unit_price, p.min_qty,
         mask_name(u.name),
         tp.rating::numeric,
         tp.rating_count,
         (select count(*)::int from service_orders o where o.technician_uid = p.technician_uid and o.status = 'completed')
    from technician_products p
    join technician_profiles tp on tp.uid = p.technician_uid and tp.status = 'active'
    join users u on u.uid = p.technician_uid
   where p.status = 'active'
     and (p_category is null or p.category_id = p_category)
   order by p.approved_at desc nulls last
   limit greatest(least(coalesce(p_limit, 30), 100), 1)
$$;

create or replace function marketplace_product(p_id uuid)
returns table (
  id            uuid,
  category_id   text,
  name          text,
  description   text,
  unit_label    text,
  unit_price    int,
  min_qty       int,
  tech_name     text,
  tech_rating   numeric,
  tech_reviews  int,
  tech_done     int
)
language sql
stable
security definer
set search_path = public
as $$
  select * from marketplace_products(null, 100) m where m.id = p_id
$$;

grant execute on function marketplace_products(text, int), marketplace_product(uuid) to anon, authenticated;
grant execute on function save_tech_product(uuid, text, text, text, text, int, int) to authenticated;
grant execute on function set_tech_product_hidden(uuid, boolean) to authenticated;
grant execute on function decide_tech_product(uuid, boolean, text) to authenticated;

-- ── 주문 (고객) ─────────────────────────────────────────────────────────
-- 수량·금액은 서버가 계산한다. 주문은 그 기술자에게 바로 배정된다(상품을 올린 것이 곧 수락).
create or replace function order_tech_product(
  p_product_id   uuid,
  p_quantity     int,
  p_address      text,
  p_scheduled_at timestamptz,
  p_note         text,
  p_phone        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := firebase_uid();
  p     technician_products%rowtype;
  v_oid uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  if not exists (select 1 from users where uid = v_uid) then
    raise exception '계정 정보가 없습니다. 홈에서 다시 로그인해 주세요';
  end if;

  select * into p from technician_products where id = p_product_id;
  if not found or p.status <> 'active' then
    raise exception '판매 중인 상품이 아닙니다';
  end if;
  if p.technician_uid = v_uid then
    raise exception '본인 상품은 주문할 수 없습니다';
  end if;
  if not exists (select 1 from technician_profiles where uid = p.technician_uid and status = 'active') then
    raise exception '현재 주문을 받을 수 없는 기술자입니다';
  end if;
  if p_quantity is null or p_quantity < p.min_qty or p_quantity > 10000 then
    raise exception '수량은 % 이상 10,000 이하로 입력해 주세요', p.min_qty;
  end if;
  if (p_quantity::bigint * p.unit_price) > 1000000000 then
    raise exception '주문 금액이 너무 큽니다. 수량을 나눠 주문해 주세요';
  end if;
  if btrim(coalesce(p_address, '')) = '' then
    raise exception '주소를 입력해 주세요';
  end if;
  if p_scheduled_at is null then
    raise exception '희망 일시를 입력해 주세요';
  end if;
  if btrim(coalesce(p_phone, '')) = '' then
    raise exception '연락처를 입력해 주세요';
  end if;

  perform set_config('bestmario.internal', 'on', true);

  update users set phone = btrim(p_phone) where uid = v_uid;

  insert into service_orders
    (customer_uid, technician_uid, category_id, order_type, status, address, scheduled_at, note,
     tech_product_id, quantity, unit_price, product_name, unit_label)
  values
    (v_uid, p.technician_uid, p.category_id, 'fixed', 'assigned', btrim(p_address), p_scheduled_at,
     btrim(coalesce(p_note, '')), p.id, p_quantity, p.unit_price, p.name, p.unit_label)
  returning id into v_oid;

  perform set_config('bestmario.internal', 'off', true);

  -- 상품 주인에게 알림 (실패해도 주문은 유지)
  perform push_call(jsonb_build_object('kind', 'direct', 'order_id', v_oid));
  return v_oid;
end;
$$;

grant execute on function order_tech_product(uuid, int, text, timestamptz, text, text) to authenticated;
