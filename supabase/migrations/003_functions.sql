-- BestMario — 003_functions.sql
-- 트리거·RPC. 002_rls.sql 적용 후 실행.

-- ── 주문 완료 승인 → 에스크로 해제 + 정산 + 워런티 ──────────────────────
-- 스펙 §6: 고객 완료 승인 시 payments.status = 'held' → 'completed' 로 바꾼 뒤
-- settlements 를 생성한다. 순서를 바꾸면 held 결제만 있는 주문에서
-- 정산 금액이 0 이 되어 기술자가 돈을 못 받는다.
create or replace function generate_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee_rate numeric(4,3);
  v_gross    int;
begin
  if new.status = 'completed' and old.status = 'in_progress' then
    -- 1) 에스크로 해제
    update payments
       set status = 'completed'
     where order_id = new.id
       and status = 'held';

    -- 2) 수수료율: 운영 설정값 우선, 없으면 10%
    select value::numeric(4,3) into v_fee_rate
      from service_settings
     where key = 'platform_fee_rate';
    if v_fee_rate is null or v_fee_rate < 0 or v_fee_rate >= 1 then
      v_fee_rate := 0.100;
    end if;

    -- 3) 혼합 결제(BM + VietQR 등)는 payments 가 여러 건이므로 합산한다
    select coalesce(sum(amount), 0) into v_gross
      from payments
     where order_id = new.id
       and status = 'completed';

    if new.technician_uid is not null and v_gross > 0 then
      insert into settlements (order_id, technician_uid, gross_amount, fee_rate)
      values (new.id, new.technician_uid, v_gross, v_fee_rate)
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

-- ── role 자가 변경 제한 ─────────────────────────────────────────────────
-- users 의 UPDATE 정책은 본인 행을 허용하므로, role 컬럼만 별도로 막는다.
-- 자가 변경은 customer → technician 만 허용 (관리자 승인은 technician_profiles.status).
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

  if is_admin() then
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
-- security invoker(기본) 이므로 호출자의 RLS 정책이 그대로 적용된다.
create or replace function accept_quotation(p_quotation_id uuid)
returns void
language plpgsql
as $$
declare
  v_order_id       uuid;
  v_technician_uid text;
begin
  select order_id, technician_uid
    into v_order_id, v_technician_uid
    from quotations
   where id = p_quotation_id;

  if v_order_id is null then
    raise exception '견적을 찾을 수 없습니다';
  end if;

  update quotations
     set status = case when id = p_quotation_id then 'accepted' else 'rejected' end
   where order_id = v_order_id;

  update service_orders
     set technician_uid = v_technician_uid,
         status = 'assigned'
   where id = v_order_id
     and status = 'pending';

  if not found then
    raise exception '이미 기술자가 배정된 주문입니다';
  end if;
end;
$$;

grant execute on function accept_quotation(uuid) to authenticated;
