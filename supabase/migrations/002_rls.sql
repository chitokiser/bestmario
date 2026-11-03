-- BestMario — 002_rls.sql
-- RLS 정책. 001_schema.sql 적용 후 실행.
--
-- 중요: `auth.uid()` 를 쓰지 않는다.
--   Supabase 의 auth.uid() 는 JWT `sub` 클레임을 ::uuid 로 캐스팅한다.
--   Firebase uid 는 28자 영숫자(UUID 아님)이므로 캐스팅이 실패하고
--   모든 정책이 에러를 낸다. 대신 아래 firebase_uid() = auth.jwt() ->> 'sub' 를 쓴다.

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

-- ── users ───────────────────────────────────────────────────────────────
alter table users enable row level security;

drop policy if exists users_select_own on users;
create policy users_select_own on users
  for select to authenticated
  using (uid = firebase_uid() or is_admin());

-- 신규 가입: 본인 행만, role 은 customer 로만 생성 가능 (admin 자가 승격 차단)
drop policy if exists users_insert_own on users;
create policy users_insert_own on users
  for insert to authenticated
  with check (uid = firebase_uid() and role = 'customer');

-- 본인 행 수정. role 변경은 003_functions.sql 의 guard_user_role 트리거가 제한한다.
drop policy if exists users_update_own on users;
create policy users_update_own on users
  for update to authenticated
  using (uid = firebase_uid() or is_admin())
  with check (uid = firebase_uid() or is_admin());

drop policy if exists users_admin_insert on users;
create policy users_admin_insert on users
  for insert to authenticated
  with check (is_admin());

drop policy if exists users_admin_delete on users;
create policy users_admin_delete on users
  for delete to authenticated
  using (is_admin());

-- ── technician_profiles ─────────────────────────────────────────────────
-- documents(신분증·사업자등록증 URL)가 들어 있으므로 기본 테이블은 본인·관리자만.
-- 고객에게 보여줄 공개 정보는 아래 technician_public 뷰로 분리한다.
alter table technician_profiles enable row level security;

drop policy if exists tech_profile_own on technician_profiles;
create policy tech_profile_own on technician_profiles
  for select to authenticated
  using (uid = firebase_uid() or is_admin());

drop policy if exists tech_profile_insert_own on technician_profiles;
create policy tech_profile_insert_own on technician_profiles
  for insert to authenticated
  with check ((uid = firebase_uid() and status = 'pending') or is_admin());

drop policy if exists tech_profile_update on technician_profiles;
create policy tech_profile_update on technician_profiles
  for update to authenticated
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

grant select on technician_public to authenticated, anon;

-- ── service_categories / service_products — 공개 읽기 ───────────────────
alter table service_categories enable row level security;
alter table service_products   enable row level security;

drop policy if exists categories_read on service_categories;
create policy categories_read on service_categories
  for select to authenticated, anon using (true);

drop policy if exists categories_admin on service_categories;
create policy categories_admin on service_categories
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists products_read on service_products;
create policy products_read on service_products
  for select to authenticated, anon using (true);

drop policy if exists products_admin on service_products;
create policy products_admin on service_products
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── service_orders ──────────────────────────────────────────────────────
alter table service_orders enable row level security;

-- 고객: 본인 주문 / 기술자: 배정된 주문 / 관리자: 전체 (스펙 §4 RLS 핵심 규칙)
drop policy if exists orders_select_party on service_orders;
create policy orders_select_party on service_orders
  for select to authenticated
  using (
    customer_uid = firebase_uid()
    or technician_uid = firebase_uid()
    or is_admin()
  );

-- 승인된 기술자는 미배정 대기 주문도 볼 수 있다 (수락·견적 제출 대상)
drop policy if exists orders_select_open on service_orders;
create policy orders_select_open on service_orders
  for select to authenticated
  using (
    technician_uid is null
    and status = 'pending'
    and is_active_technician()
  );

drop policy if exists orders_insert_own on service_orders;
create policy orders_insert_own on service_orders
  for insert to authenticated
  with check (customer_uid = firebase_uid() or is_admin());

drop policy if exists orders_update_customer on service_orders;
create policy orders_update_customer on service_orders
  for update to authenticated
  using (customer_uid = firebase_uid())
  with check (customer_uid = firebase_uid());

drop policy if exists orders_update_technician on service_orders;
create policy orders_update_technician on service_orders
  for update to authenticated
  using (
    technician_uid = firebase_uid()
    or (technician_uid is null and status = 'pending' and is_active_technician())
  )
  with check (technician_uid = firebase_uid());

drop policy if exists orders_admin_all on service_orders;
create policy orders_admin_all on service_orders
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── quotations ──────────────────────────────────────────────────────────
alter table quotations enable row level security;

-- 기술자는 본인 견적만, 해당 주문의 고객은 그 주문의 모든 견적을 본다
drop policy if exists quotations_select on quotations;
create policy quotations_select on quotations
  for select to authenticated
  using (
    technician_uid = firebase_uid()
    or owns_order(order_id)
    or is_admin()
  );

drop policy if exists quotations_insert_own on quotations;
create policy quotations_insert_own on quotations
  for insert to authenticated
  with check (technician_uid = firebase_uid() and is_active_technician());

-- 고객이 선택(accepted/rejected) 하거나 관리자가 처리
drop policy if exists quotations_update on quotations;
create policy quotations_update on quotations
  for update to authenticated
  using (owns_order(order_id) or is_admin())
  with check (owns_order(order_id) or is_admin());

-- ── payments ────────────────────────────────────────────────────────────
alter table payments enable row level security;

drop policy if exists payments_select on payments;
create policy payments_select on payments
  for select to authenticated
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

drop policy if exists payments_insert_customer on payments;
create policy payments_insert_customer on payments
  for insert to authenticated
  with check (owns_order(order_id) or is_admin());

-- 현금 결제 확인·환불은 관리자만. 에스크로 해제는 트리거(security definer)가 처리.
drop policy if exists payments_update_admin on payments;
create policy payments_update_admin on payments
  for update to authenticated
  using (is_admin()) with check (is_admin());

-- ── settlements ─────────────────────────────────────────────────────────
-- INSERT 는 generate_settlement() 트리거(security definer)만 수행한다.
alter table settlements enable row level security;

drop policy if exists settlements_select on settlements;
create policy settlements_select on settlements
  for select to authenticated
  using (technician_uid = firebase_uid() or is_admin());

drop policy if exists settlements_admin on settlements;
create policy settlements_admin on settlements
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── warranties ──────────────────────────────────────────────────────────
alter table warranties enable row level security;

drop policy if exists warranties_select on warranties;
create policy warranties_select on warranties
  for select to authenticated
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

drop policy if exists warranties_admin on warranties;
create policy warranties_admin on warranties
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── disputes ────────────────────────────────────────────────────────────
alter table disputes enable row level security;

drop policy if exists disputes_select on disputes;
create policy disputes_select on disputes
  for select to authenticated
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

drop policy if exists disputes_insert on disputes;
create policy disputes_insert on disputes
  for insert to authenticated
  with check (owns_order(order_id) or assigned_to_order(order_id));

drop policy if exists disputes_admin on disputes;
create policy disputes_admin on disputes
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── messages (Phase 2 UI) ───────────────────────────────────────────────
alter table messages enable row level security;

drop policy if exists messages_select_party on messages;
create policy messages_select_party on messages
  for select to authenticated
  using (owns_order(order_id) or assigned_to_order(order_id) or is_admin());

drop policy if exists messages_insert_party on messages;
create policy messages_insert_party on messages
  for insert to authenticated
  with check (
    sender_uid = firebase_uid()
    and (owns_order(order_id) or assigned_to_order(order_id))
  );

-- ── service_settings ────────────────────────────────────────────────────
alter table service_settings enable row level security;

drop policy if exists settings_read on service_settings;
create policy settings_read on service_settings
  for select to authenticated using (true);

drop policy if exists settings_admin on service_settings;
create policy settings_admin on service_settings
  for all to authenticated using (is_admin()) with check (is_admin());

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

drop policy if exists order_photos_write on storage.objects;
create policy order_photos_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'order-photos' and owner_id = firebase_uid());

-- documents: 경로 첫 세그먼트가 본인 uid 인 파일만 (예: "<uid>/id_card.jpg")
drop policy if exists documents_own_read on storage.objects;
create policy documents_own_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = firebase_uid() or is_admin())
  );

drop policy if exists documents_own_write on storage.objects;
create policy documents_own_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = firebase_uid()
  );
