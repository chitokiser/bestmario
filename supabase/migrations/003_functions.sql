-- BestMario — 003_functions.sql
-- 트리거·RPC. 002_rls.sql 적용 후 실행.
--
-- RLS 는 "어떤 행을" 만질 수 있는지만 정한다. "어떤 컬럼을 어떤 값으로" 는
-- 표현할 수 없으므로, 아래 guard_* 트리거가 상태 전이와 동결 컬럼을 담당한다.
-- 002 만 적용하고 003 을 건너뛰면 클라이언트가 자기 상태를 승인하거나
-- 견적 금액을 고쳐 쓸 수 있다.

-- ── 내부 작업 플래그 ────────────────────────────────────────────────────
-- accept_quotation 처럼 여러 테이블을 한 트랜잭션에서 정당하게 바꾸는
-- 함수만 이 플래그를 켠다. guard_* 트리거는 플래그가 켜져 있으면 통과시킨다.
-- set_config(..., true) 이므로 트랜잭션이 끝나면 자동으로 사라진다.
create or replace function is_internal_op()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('bestmario.internal', true), 'off') = 'on'
$$;

-- Supabase Dashboard / SQL Editor 경로에는 요청 JWT 가 아예 없다.
-- (anon 키로 들어오는 API 요청에도 JWT 는 있으므로 — role=anon, sub 없음 —
--  이 조건은 anon 호출자에게 열리지 않는다.)
-- guard_* 트리거는 RLS 와 달리 테이블 소유자에게도 발동하므로, 이 경로를
-- 열어 두지 않으면 최초 관리자 지정이나 운영 중 수동 교정이 불가능해진다.
create or replace function is_dashboard_op()
returns boolean
language sql
stable
as $$
  select auth.jwt() is null
$$;

-- guard_* 트리거의 공통 통과 조건
create or replace function guard_bypass()
returns boolean
language sql
stable
as $$
  select is_internal_op() or is_dashboard_op() or is_admin()
$$;

-- ── 결제 금액 서버 검증 ─────────────────────────────────────────────────
-- 스펙 §10 "결제·정산은 서버 측 검증 (클라이언트 금액 직접 수신 금지)".

-- 주문의 확정 금액: 선택된 견적가 > 고정가 상품가 > 0(미확정)
create or replace function order_expected_amount(p_order_id uuid)
returns int
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
    (select p.base_price
       from service_orders o
       join service_products p on p.id = o.product_id
      where o.id = p_order_id),
    0
  )
$$;

-- 주문에 대해 접수된(보관 중 + 확정) 결제 합계
create or replace function order_paid_amount(p_order_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::int
    from payments
   where order_id = p_order_id
     and status in ('held', 'completed')
$$;

create or replace function validate_payment_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected int;
  v_paid     int;
begin
  -- 동시 INSERT 두 건이 각각 한도를 통과하는 것을 막기 위해 주문 행을 잠근다
  perform 1 from service_orders where id = new.order_id for update;

  v_expected := order_expected_amount(new.order_id);

  if v_expected <= 0 then
    raise exception '주문 금액이 확정되지 않았습니다 (고정가 상품 또는 선택된 견적이 없음)';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from payments
   where order_id = new.order_id
     and status in ('held', 'completed');

  -- 혼합 결제(BM + VietQR 등)는 합계가 주문 금액을 넘지 않아야 한다
  if v_paid + new.amount > v_expected then
    raise exception '결제 금액이 주문 금액을 초과합니다 (주문 %, 기결제 %, 요청 %)',
      v_expected, v_paid, new.amount;
  end if;

  return new;
end;
$$;

drop trigger if exists on_payment_insert on payments;
create trigger on_payment_insert
  before insert on payments
  for each row execute function validate_payment_amount();

-- ── 주문 완료 승인 → 에스크로 해제 + 정산 + 워런티 ──────────────────────
-- 스펙 §6. 순서가 중요하다: 보관 중인 BM 결제를 먼저 확정한 뒤 합산해야
-- 정산 금액이 0 이 되지 않는다.
--
-- 정산 대상에서 제외하는 것:
--   cash  — 기술자가 현장에서 이미 현금을 받았다. 다시 지급하면 이중 지급이다.
--           (플랫폼 수수료는 관리자가 별도로 회수한다)
--   held  — 관리자가 입금을 확인하지 않은 이체·지갑 결제. 받지 않은 돈은 지급하지 않는다.
--           따라서 관리자는 고객 완료 승인 전에 입금 확인을 끝내야 한다.
create or replace function generate_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee_rate numeric(4,3);
  v_gross    int;
  v_bm       int;
  v_non_bm   int;
  v_net      int;
  v_raw      text;
begin
  if new.status = 'completed' and old.status = 'in_progress' then
    -- 1) BM 에스크로 해제 (Firebase releaseEscrow 와 짝을 이룬다)
    update payments
       set status = 'completed'
     where order_id = new.id
       and status = 'held'
       and method = 'bm';

    -- 2) 수수료율: 운영 설정값 우선, 파싱 실패·범위 외면 10%
    --    여기서 예외가 터지면 모든 주문 완료가 막히므로 반드시 감싼다.
    select value into v_raw from service_settings where key = 'platform_fee_rate';
    begin
      v_fee_rate := v_raw::numeric(4,3);
    exception when others then
      v_fee_rate := null;
    end;
    if v_fee_rate is null or v_fee_rate < 0 or v_fee_rate >= 1 then
      v_fee_rate := 0.100;
    end if;

    -- 3) 확정된 비현금 결제를 BM / 비BM 으로 나눠 합산 (혼합 결제는 여러 건)
    --    BM 분은 BestClub payServiceJobEscrow 가 이미 가맹점 수수료(feeBps,
    --    기본 10%)를 떼고 escrowVnd 로 보관한 금액이다. 여기서 또 떼면 이중 과금.
    select coalesce(sum(amount) filter (where method = 'bm'), 0),
           coalesce(sum(amount) filter (where method <> 'bm'), 0)
      into v_bm, v_non_bm
      from payments
     where order_id = new.id
       and status = 'completed'
       and method <> 'cash';

    v_gross := v_bm + v_non_bm;
    v_net   := v_bm + floor(v_non_bm * (1 - v_fee_rate))::int;

    if new.technician_uid is not null and v_gross > 0 then
      insert into settlements (order_id, technician_uid, gross_amount, bm_amount, fee_rate, net_amount)
      values (new.id, new.technician_uid, v_gross, v_bm, v_fee_rate, v_net)
      on conflict (order_id) do nothing;
    end if;

    -- 4) 30일 A/S 워런티
    insert into warranties (order_id, expires_at, status)
    values (new.id, now() + interval '30 days', 'active')
    on conflict (order_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_order_completed on service_orders;
create trigger on_order_completed
  after update on service_orders
  for each row execute function generate_settlement();

-- ── 주문 상태 전이 제한 ─────────────────────────────────────────────────
-- RLS 의 orders_update_* 정책은 "본인 주문인가" 만 본다. 그대로 두면
-- 배정된 기술자가 스스로 status='completed' 를 써서 고객 승인 없이
-- 정산을 발생시킬 수 있다.
create or replace function guard_order_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      text := nullif(auth.jwt() ->> 'sub', '');
  v_expected int;
  v_paid     int;
begin
  if guard_bypass() then
    return new;
  end if;

  -- 생성 정보는 누구도 바꿀 수 없다
  if new.customer_uid <> old.customer_uid
     or new.category_id <> old.category_id
     or new.order_type <> old.order_type
     or new.product_id is distinct from old.product_id
     or new.created_at <> old.created_at then
    raise exception '주문의 고객·분류·유형·상품은 변경할 수 없습니다';
  end if;

  -- (1) 기술자 직접 수락: 미배정 대기 주문을 본인에게 배정
  if old.technician_uid is null and new.technician_uid = v_uid then
    if old.order_type = 'quote_request' then
      raise exception '견적 요청 주문은 고객이 견적을 선택해 배정합니다';
    end if;
    if old.status <> 'pending' or new.status <> 'assigned' then
      raise exception '수락은 대기 중인 주문만 가능합니다 (% -> %)', old.status, new.status;
    end if;
    return new;
  end if;

  -- (2) 배정된 기술자
  if old.technician_uid is not null and old.technician_uid = v_uid then
    if new.technician_uid is distinct from old.technician_uid then
      raise exception '배정된 기술자는 변경할 수 없습니다';
    end if;

    -- 상태를 그대로 둔 수정(photos_after 등)은 허용
    if new.status = old.status then
      return new;
    end if;

    if old.status = 'assigned' and new.status = 'in_progress' then
      -- 돈이 들어오지 않은 주문으로 작업을 시작하면 정산할 재원이 없다
      v_expected := order_expected_amount(new.id);
      v_paid     := order_paid_amount(new.id);
      if v_expected > 0 and v_paid < v_expected then
        raise exception '결제가 완료되지 않은 주문입니다 (주문 %, 접수 %)', v_expected, v_paid;
      end if;
      return new;
    end if;

    raise exception '기술자는 주문 상태를 % → % 로 바꿀 수 없습니다', old.status, new.status;
  end if;

  -- (3) 고객
  if old.customer_uid = v_uid then
    if new.technician_uid is distinct from old.technician_uid then
      raise exception '고객은 기술자를 직접 배정할 수 없습니다';
    end if;
    if new.status = old.status then
      return new;
    end if;
    if old.status = 'in_progress' and new.status = 'completed' then
      return new;
    end if;
    if old.status in ('pending', 'assigned') and new.status = 'cancelled' then
      return new;
    end if;
    if old.status in ('assigned', 'in_progress') and new.status = 'disputed' then
      return new;
    end if;
    raise exception '고객은 주문 상태를 % → % 로 바꿀 수 없습니다', old.status, new.status;
  end if;

  raise exception '이 주문을 수정할 권한이 없습니다';
end;
$$;

drop trigger if exists on_order_update on service_orders;
create trigger on_order_update
  before update on service_orders
  for each row execute function guard_order_transition();

-- ── 기술자 프로필 동결 ─────────────────────────────────────────────────
-- status 를 막지 않으면 승인 대기 기술자가 스스로 active 로 바꿔
-- 관리자 승인을 건너뛸 수 있고, rating 도 임의로 올릴 수 있다.
create or replace function guard_technician_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if guard_bypass() then
    return new;
  end if;

  if new.uid <> old.uid then
    raise exception 'uid 는 변경할 수 없습니다';
  end if;
  if new.status <> old.status then
    raise exception '기술자 승인 상태는 관리자만 변경할 수 있습니다';
  end if;
  if new.rating <> old.rating or new.rating_count <> old.rating_count then
    raise exception '평점은 직접 변경할 수 없습니다';
  end if;

  return new;
end;
$$;

drop trigger if exists on_technician_profile_update on technician_profiles;
create trigger on_technician_profile_update
  before update on technician_profiles
  for each row execute function guard_technician_profile();

-- ── role 자가 변경 제한 ─────────────────────────────────────────────────
-- 자가 변경은 customer → technician 만 허용 (관리자 승인은 technician_profiles.status).
-- JWT 가 없는 경로(Supabase Dashboard, SQL Editor, service_role)는 통과시킨다 —
-- 최초 관리자는 그 경로로만 지정할 수 있고, 막으면 부트스트랩이 불가능해진다.
create or replace function guard_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = old.role then
    return new;
  end if;

  if guard_bypass() or nullif(auth.jwt() ->> 'sub', '') is null then
    return new;
  end if;

  if old.role = 'customer' and new.role = 'technician' then
    return new;
  end if;

  raise exception 'role 변경 권한이 없습니다 (% -> %)', old.role, new.role;
end;
$$;

drop trigger if exists on_user_role_change on users;
create trigger on_user_role_change
  before update of role on users
  for each row execute function guard_user_role();

-- ── 견적 동결 ───────────────────────────────────────────────────────────
-- quotations_update 정책은 주문의 고객에게 UPDATE 를 허용한다. 컬럼 제한이
-- 없으면 고객이 선택한 견적의 price 를 1,000 VND 로 고쳐 쓸 수 있다.
create or replace function guard_quotation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if guard_bypass() then
    return new;
  end if;

  if new.order_id <> old.order_id
     or new.technician_uid <> old.technician_uid
     or new.price <> old.price
     or new.duration_min <> old.duration_min then
    raise exception '제출된 견적의 주문·기술자·금액·소요시간은 변경할 수 없습니다';
  end if;

  if new.status <> old.status then
    raise exception '견적 선택은 accept_quotation() 으로만 가능합니다';
  end if;

  return new;
end;
$$;

drop trigger if exists on_quotation_update on quotations;
create trigger on_quotation_update
  before update on quotations
  for each row execute function guard_quotation_update();

-- ── 견적 5건 제한 ───────────────────────────────────────────────────────
-- 스펙 §5③ "기술자 최대 5명". 클라이언트 검사는 우회 가능하므로 DB 에서 막는다.
create or replace function enforce_quotation_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- 동시 제출로 6건째가 통과하는 것을 막기 위해 주문 행을 잠근다
  perform 1 from service_orders where id = new.order_id for update;

  select count(*) into v_count
    from quotations
   where order_id = new.order_id;

  if v_count >= 5 then
    raise exception '이 주문은 이미 견적 5건이 접수되었습니다';
  end if;

  return new;
end;
$$;

drop trigger if exists on_quotation_insert on quotations;
create trigger on_quotation_insert
  before insert on quotations
  for each row execute function enforce_quotation_limit();

-- ── 견적 선택 (단일 트랜잭션) ───────────────────────────────────────────
-- PostgREST 로는 여러 UPDATE 를 한 트랜잭션으로 묶을 수 없으므로 RPC 로 제공한다.
-- security definer 이므로 RLS 가 적용되지 않는다 — 권한을 함수 안에서 직접 확인한다.
-- (security invoker 로 두면 기술자가 자기 견적 id 로 호출해 주문만 배정받는
--  우회가 가능했다: quotations UPDATE 는 0건으로 막히지만 orders UPDATE 는 통과)
create or replace function accept_quotation(p_quotation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id       uuid;
  v_technician_uid text;
  v_updated        int;
begin
  select q.order_id, q.technician_uid
    into v_order_id, v_technician_uid
    from quotations q
   where q.id = p_quotation_id;

  if v_order_id is null then
    raise exception '견적을 찾을 수 없습니다';
  end if;

  if not (owns_order(v_order_id) or is_admin()) then
    raise exception '이 주문의 견적을 선택할 권한이 없습니다';
  end if;

  -- 동시 선택 방지
  perform 1 from service_orders where id = v_order_id for update;

  perform set_config('bestmario.internal', 'on', true);

  update quotations
     set status = case when id = p_quotation_id then 'accepted' else 'rejected' end
   where order_id = v_order_id;

  update service_orders
     set technician_uid = v_technician_uid,
         status = 'assigned'
   where id = v_order_id
     and status = 'pending'
     and technician_uid is null;

  get diagnostics v_updated = row_count;

  perform set_config('bestmario.internal', 'off', true);

  if v_updated = 0 then
    raise exception '이미 기술자가 배정된 주문입니다';
  end if;
end;
$$;

grant execute on function accept_quotation(uuid) to authenticated, anon;
