-- BestMario — 002_rls.sql
-- RLS 정책. 001_schema.sql 적용 후 실행.
--
-- 중요 1: `auth.uid()` 를 쓰지 않는다.
--   Supabase 의 auth.uid() 는 JWT `sub` 클레임을 ::uuid 로 캐스팅한다.
--   Firebase uid 는 28자 영숫자(UUID 아님)이므로 캐스팅이 실패하고
--   모든 정책이 에러를 낸다. 대신 아래 firebase_uid() = auth.jwt() ->> 'sub' 를 쓴다.
--
-- 중요 2: 정책에 `TO authenticated` 를 붙이지 않는다.
--   Third Party Auth 로 들어오는 Firebase ID 토큰에 `role: 'authenticated'`
--   커스텀 클레임이 없으면 요청은 anon 역할로 실행된다. `TO authenticated` 로
--   제한하면 그 경우 모든 쿼리가 빈 결과를 돌려주고 원인을 찾기 어렵다.
--   역할 대신 firebase_uid() 조건으로 통제한다 — 토큰이 없으면 null 이라
--   어떤 행과도 일치하지 않으므로 anon 에게 열리지 않는다.
--
-- 중요 3: 컬럼 단위 규칙(상태 전이, 금액·평점 동결)은 RLS 로 표현할 수 없다.
--   003_functions.sql 의 guard_* 트리거가 담당한다. 이 파일만 적용하면
--   클라이언트가 임의 컬럼을 고칠 수 있으므로 003 까지 반드시 실행해야 한다.

-- ── 인증 헬퍼 ───────────────────────────────────────────────────────────

-- 현재 요청의 Firebase uid (미인증이면 null)
create or replace function firebase_uid()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- 관리자 여부. security definer 로 users 의 RLS 를 우회해 무한 재귀를 막는다.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where uid = nullif(auth.jwt() ->> 'sub', '')
      and role = 'admin'
  )
$$;

-- 승인된(active) 기술자 여부
create or replace function is_active_technician()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from technician_profiles
    where uid = nullif(auth.jwt() ->> 'sub', '')
      and status = 'active'
  )
$$;

-- 해당 주문의 고객인지
create or replace function owns_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from service_orders
    where id = p_order_id
      and customer_uid = nullif(auth.jwt() ->> 'sub', '')
  )
$$;

-- 해당 주문에 배정된 기술자인지
create or replace function assigned_to_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from service_orders
    where id = p_order_id
      and technician_uid = nullif(auth.jwt() ->> 'sub', '')
  )
$$;

-- 주의: 위 헬퍼들의 EXECUTE 권한을 회수하지 말 것. RLS 정책 표현식은 질의하는
-- 역할의 권한으로 평가되므로, 회수하면 정책 자체가 권한 오류로 실패한다.

-- ── users ───────────────────────────────────────────────────────────────
alter table users enable row level security;

drop policy if exists users_select_own on users;
create policy users_select_own on users
  for select
  using (uid = firebase_uid() or is_admin());

-- 신규 가입: 본인 행만, role 은 customer 로만 생성 가능 (admin 자가 승격 차단)
drop policy if exists users_insert_own on users;
create policy users_insert_own on users
  for insert
  with check ((uid = firebase_uid() and role = 'customer') or is_admin());

-- 본인 행 수정. role 변경은 003_functions.sql 의 guard_user_role 트리거가 제한한다.
drop policy if exists users_update_own on users;
create policy users_update_own on users
  for update
  using (uid = firebase_uid() or is_admin())
  with check (uid = firebase_uid() or is_admin());

drop policy if exists users_admin_insert on users;
drop policy if exists users_admin_delete on users;
create policy users_admin_delete on users
  for delete
  using (is_admin());

-- ── technician_profiles ─────────────────────────────────────────────────
-- documents(신분증·사업자등록증 경로)가 들어 있으므로 기본 테이블은 본인·관리자만.
-- 고객에게 보여줄 공개 정보는 아래 technician_public 뷰로 분리한다.
-- status / rating / rating_count 는 guard_technician_profile 트리거가 동결한다.
alter table technician_profiles enable row level security;

drop policy if exists tech_profile_own on technician_profiles;
create policy tech_profile_own on technician_profiles
  for select
  using (uid = firebase_uid() or is_admin());

drop policy if exists tech_profile_insert_own on technician_profiles;
create policy tech_profile_insert_own on technician_profiles
  for insert
  with check ((uid = firebase_uid() and status = 'pending') or is_admin());

drop policy if exists tech_profile_update on technician_profiles;
create policy tech_profile_update on technician_profiles
  for update
  using (uid = firebase_uid() or is_admin())
  with check (uid = firebase_uid() or is_admin());

-- 공개 뷰: documents 제외. security_invoker 를 켜지 않으므로 뷰 소유자 권한으로
-- 실행되어 기본 테이블 RLS 를 우회한다 — 노출 컬럼을 여기서 통제한다.
create or replace view technician_public as
  select
    p.uid,
    p.status,
    p.skills,
    p.rating,
    p.rating_count,
    u.name
  from technician_profiles p
  join users u on u.uid = p.uid
  where p.status = 'active';

-- 기술자 이름·평점은 로그인한 사용자에게만. anon 에는 주지 않는다.
revoke all on technician_public from anon;
grant select on technician_public to authenticated;

-- ── service_categories / service_products — 공개 읽기 ───────────────────
-- 랜딩 페이지가 비로그인 상태로 읽으므로 anon 에게도 열어 둔다.
alter table service_categories enable row level security;
alter table service_products   enable row level security;

drop policy if exists categories_read on service_categories;
create policy categories_read on service_categories
  for select to authenticated, anon using (true);

drop policy if exists categories_admin on service_categories;
create policy categories_admin on service_categories
  for all using (is_admin()) with check (is_admin());

drop policy if exists products_read on service_products;
create policy products_read on service_products
  for select to authenticated, anon using (true);

drop policy if exists products_admin on service_products;
create policy products_admin on service_products
  for all using (is_admin()) with check (is_admin());

-- ── service_orders ──────────────────────────────────────────────────────
-- 상태 전이·컬럼 동결은 guard_order_transition 트리거(003)가 담당한다.
alter table service_orders enable row level security;

-- 고객: 본인 주문 / 기술자: 배정된 주문 / 관리자: 전체 (스펙 §4 RLS 핵심 규칙)
drop policy if exists orders_select_party on service_orders;
create policy orders_select_party on service_orders
  for select
  using (
    customer_uid = firebase_uid()
    or technician_uid = firebase_uid()
    or is_admin()
  );

-- 승인된 기술자는 미배정 대기 주문도 볼 수 있다 (수락·견적 제출 대상)
drop policy if exists orders_select_open on service_orders;
create policy orders_select_open on service_orders
  for select
  using (
    technician_uid is null
    and status = 'pending'
    and is_active_technician()
  );

drop policy if exists orders_insert_own on service_orders;
create policy orders_insert_own on service_orders
  for insert
  with check (customer_uid = firebase_uid() or is_admin());

drop policy if exists orders_update_customer on service_orders;
create policy orders_update_customer on service_orders
  for update
  using (customer_uid = firebase_uid())
  with check (customer_uid = firebase_uid());

-- 기술자: 배정된 주문, 또는 미배정 대기 주문의 직접 수락.
-- quote_request 는 고객이 견적을 선택해 배정하므로 직접 수락 대상이 아니다.
drop policy if exists orders_update_technician on service_orders;
create policy orders_update_technician on service_orders
  for update
  using (
    technician_uid = firebase_uid()
    or (
      technician_uid is null
      and status = 'pending'
      and order_type in ('fixed', 'customer_bid')
      and is_active_technician()
    )
  )
  with check (technician_uid = firebase_uid());

drop policy if exists orders_admin_all on service_orders;
create policy orders_admin_all on service_orders
  for all using (is_admin()) with check (is_admin());

-- ── quotations ──────────────────────────────────────────────────────────
-- price / duration_min / technician_uid 동결과 status 전이는
-- guard_quotation_update 트리거(003)가 담당한다.
alter table quotations enable row level security;

-- 기술자는 본인 견적만, 해당 주문의 고객은 그 주문의 모든 견적을 본다
drop policy if exists quotations_select on quotations;
create policy quotations_select on quotations
  for select
  using (
    technician_uid = firebase_uid()
    or owns_order(order_id)
    or is_admin()
  );

-- 견적은 quote_request 타입의 미배정 대기 주문에만 제출할 수 있다
drop policy if exists quotations_insert_own on quotations;
create policy quotations_insert_own on quotations
  for insert
  with check (
    technician_uid = firebase_uid()
    and is_active_technician()
    and exists (
      select 1 from service_orders o
       where o.id = order_id
         and o.order_type = 'quote_request'
         and o.status = 'pending'
         and o.technician_uid is null
    )
  );

drop policy if exists quotations_update on quotations;
create policy quotations_update on quotations
  for update
  using (owns_order(order_id) or is_admin())
  with check (owns_order(order_id) or is_admin());

-- ── payments ────────────────────────────────────────────────────────────
alter table payments enable row level security;

drop policy if exists payments_select on payments;
create policy payments_select on payments
  for select
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

-- 고객이 만드는 결제는 반드시 'held'(에스크로 보관) 상태로만 생성된다.
-- 'completed' 로 직접 넣으면 입금 확인 없이 정산이 발생하므로 차단한다.
drop policy if exists payments_insert_customer on payments;
create policy payments_insert_customer on payments
  for insert
  with check ((owns_order(order_id) and status = 'held') or is_admin());

-- 현금 결제 확인·환불은 관리자만. 에스크로 해제는 트리거(security definer)가 처리.
drop policy if exists payments_update_admin on payments;
create policy payments_update_admin on payments
  for update
  using (is_admin()) with check (is_admin());

-- ── settlements ─────────────────────────────────────────────────────────
-- INSERT 는 generate_settlement() 트리거(security definer)만 수행한다.
alter table settlements enable row level security;

drop policy if exists settlements_select on settlements;
create policy settlements_select on settlements
  for select
  using (technician_uid = firebase_uid() or is_admin());

drop policy if exists settlements_admin on settlements;
create policy settlements_admin on settlements
  for all using (is_admin()) with check (is_admin());

-- ── warranties ──────────────────────────────────────────────────────────
alter table warranties enable row level security;

drop policy if exists warranties_select on warranties;
create policy warranties_select on warranties
  for select
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

drop policy if exists warranties_admin on warranties;
create policy warranties_admin on warranties
  for all using (is_admin()) with check (is_admin());

-- ── disputes ────────────────────────────────────────────────────────────
alter table disputes enable row level security;

drop policy if exists disputes_select on disputes;
create policy disputes_select on disputes
  for select
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

drop policy if exists disputes_insert on disputes;
create policy disputes_insert on disputes
  for insert
  with check (owns_order(order_id) or assigned_to_order(order_id));

drop policy if exists disputes_admin on disputes;
create policy disputes_admin on disputes
  for all using (is_admin()) with check (is_admin());

-- ── messages (Phase 2 UI) ───────────────────────────────────────────────
alter table messages enable row level security;

drop policy if exists messages_select_party on messages;
create policy messages_select_party on messages
  for select
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

drop policy if exists messages_insert_party on messages;
create policy messages_insert_party on messages
  for insert
  with check (
    sender_uid = firebase_uid()
    and (owns_order(order_id) or assigned_to_order(order_id))
  );

-- ── service_settings ────────────────────────────────────────────────────
alter table service_settings enable row level security;

drop policy if exists settings_read on service_settings;
create policy settings_read on service_settings
  for select
  using (firebase_uid() is not null);

drop policy if exists settings_admin on service_settings;
create policy settings_admin on service_settings
  for all using (is_admin()) with check (is_admin());

-- ── Realtime ────────────────────────────────────────────────────────────
-- 테이블이 supabase_realtime 퍼블리케이션에 없으면 postgres_changes 구독이
-- 조용히 아무 이벤트도 받지 못한다 (useOrders / useTechnicianOrders / useQuotations).
-- 이미 추가된 테이블(duplicate_object)이든 퍼블리케이션이 없는 경우든
-- 마이그레이션 전체를 실패시키지 않도록 넓게 잡는다.
do $$
begin
  begin
    alter publication supabase_realtime add table service_orders;
  exception when others then
    raise notice 'service_orders realtime 추가 건너뜀: %', sqlerrm;
  end;
  begin
    alter publication supabase_realtime add table quotations;
  exception when others then
    raise notice 'quotations realtime 추가 건너뜀: %', sqlerrm;
  end;
end
$$;

-- ── Storage 버킷 + 정책 ─────────────────────────────────────────────────
-- order-photos: 작업 전/후 사진. 공개 URL 로 주문 상세에 표시.
-- documents   : 기술자 신분증·사업자등록증. 비공개.
insert into storage.buckets (id, name, public)
  values ('order-photos', 'order-photos', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;

drop policy if exists order_photos_read on storage.objects;
create policy order_photos_read on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'order-photos');

-- 경로는 "<order_id>/<파일명>" 이어야 하고, 그 주문의 고객 또는 배정된 기술자만 올린다.
-- owner_id 는 Third Party Auth 환경에서 값이 보장되지 않으므로 경로로 판정한다.
-- 정규식 검사와 ::uuid 캐스팅의 평가 순서는 보장되지 않으므로, 캐스팅 자체를
-- 예외 없이 처리하는 헬퍼를 쓴다.
create or replace function try_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists order_photos_write on storage.objects;
create policy order_photos_write on storage.objects
  for insert
  with check (
    bucket_id = 'order-photos'
    and (
      owns_order(try_uuid((storage.foldername(name))[1]))
      or assigned_to_order(try_uuid((storage.foldername(name))[1]))
    )
  );

-- documents: 경로 첫 세그먼트가 본인 uid 인 파일만 (예: "<uid>/id_card.jpg")
drop policy if exists documents_own_read on storage.objects;
create policy documents_own_read on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = firebase_uid() or is_admin())
  );

drop policy if exists documents_own_write on storage.objects;
create policy documents_own_write on storage.objects
  for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = firebase_uid()
  );
