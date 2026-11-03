-- BestMario — 001_schema.sql
-- 스펙 §4 데이터 모델. Supabase SQL Editor 에서 001 → 002 → 003 → seed.sql 순서로 실행.
--
-- 식별자 정책
--   users.uid / technician_uid / customer_uid : TEXT = Firebase Auth uid (UUID 아님)
--   service_categories.id / service_products.id : TEXT 슬러그 (프론트 BESTMARIO_SERVICES 의 id 와 동일)
--   그 외 : uuid (gen_random_uuid())

create extension if not exists pgcrypto;

-- ── 사용자 ──────────────────────────────────────────────────────────────
create table if not exists users (
  uid         text primary key,                      -- Firebase Auth uid
  role        text not null default 'customer'
                check (role in ('customer', 'technician', 'admin')),
  name        text not null default '',
  phone       text not null default '',
  lang        text not null default 'vi'
                check (lang in ('ko', 'en', 'vi')),
  created_at  timestamptz not null default now()
);

-- ── 기술자 프로필 ───────────────────────────────────────────────────────
create table if not exists technician_profiles (
  uid           text primary key references users(uid) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'active', 'suspended')),
  skills        text[] not null default '{}',        -- service_categories.id 목록
  documents     jsonb  not null default '{}'::jsonb, -- { "id_card": url, "business_license": url }
  rating        numeric(3,2) not null default 0 check (rating >= 0 and rating <= 5),
  rating_count  int not null default 0 check (rating_count >= 0)
);

create index if not exists technician_profiles_status_idx on technician_profiles (status);
create index if not exists technician_profiles_skills_idx on technician_profiles using gin (skills);

-- ── 서비스 카테고리 / 상품 ──────────────────────────────────────────────
create table if not exists service_categories (
  id       text primary key,
  name_ko  text not null,
  name_vi  text not null,
  name_en  text not null,
  icon     text not null default ''
);

create table if not exists service_products (
  id           text primary key,
  category_id  text not null references service_categories(id) on delete cascade,
  name_ko      text not null,
  name_vi      text not null,
  base_price   int  not null check (base_price >= 0),   -- VND
  description  text not null default ''
);

create index if not exists service_products_category_idx on service_products (category_id);

-- ── 주문 ────────────────────────────────────────────────────────────────
create table if not exists service_orders (
  id              uuid primary key default gen_random_uuid(),
  customer_uid    text not null references users(uid),
  technician_uid  text references users(uid),
  category_id     text not null references service_categories(id),
  product_id      text references service_products(id),  -- 고정가 선택 시
  order_type      text not null
                    check (order_type in ('fixed', 'customer_bid', 'quote_request')),
  status          text not null default 'pending'
                    check (status in ('pending', 'assigned', 'in_progress',
                                      'completed', 'cancelled', 'disputed')),
  address         text not null default '',
  scheduled_at    timestamptz not null,
  photos_before   text[] not null default '{}',
  photos_after    text[] not null default '{}',
  note            text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists service_orders_customer_idx   on service_orders (customer_uid);
create index if not exists service_orders_technician_idx on service_orders (technician_uid);
create index if not exists service_orders_status_idx     on service_orders (status);
create index if not exists service_orders_open_idx        on service_orders (status, order_type)
  where technician_uid is null;

-- ── 견적 (quote_request) ────────────────────────────────────────────────
create table if not exists quotations (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references service_orders(id) on delete cascade,
  technician_uid  text not null references users(uid),
  price           int  not null check (price > 0),     -- VND
  duration_min    int  not null check (duration_min > 0),
  note            text not null default '',
  status          text not null default 'submitted'
                    check (status in ('submitted', 'accepted', 'rejected')),
  created_at      timestamptz not null default now(),
  -- 기술자 1명은 주문 1건에 견적 1개만 (스펙 §5③ 수정 불가)
  unique (order_id, technician_uid)
);

create index if not exists quotations_order_idx on quotations (order_id);
create index if not exists quotations_technician_idx on quotations (technician_uid);

-- ── 결제 ────────────────────────────────────────────────────────────────
create table if not exists payments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references service_orders(id) on delete cascade,
  amount           int  not null check (amount > 0),   -- VND
  method           text not null
                     check (method in ('vietqr', 'momo', 'bm', 'cash')),
  status           text not null default 'held'
                     check (status in ('held', 'completed', 'refunded')),
  -- 스펙 §10 중복 결제 방지. 혼합 결제는 수단별로 다른 키를 쓴다.
  idempotency_key  text unique,
  paid_at          timestamptz not null default now()
);

create index if not exists payments_order_idx on payments (order_id);
create index if not exists payments_status_idx on payments (status);

-- ── 정산 ────────────────────────────────────────────────────────────────
create table if not exists settlements (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references service_orders(id) on delete cascade,
  technician_uid  text not null references users(uid),
  gross_amount    int  not null check (gross_amount >= 0),
  fee_rate        numeric(4,3) not null default 0.100
                    check (fee_rate >= 0 and fee_rate < 1),
  net_amount      int generated always as
                    (floor(gross_amount * (1 - fee_rate))::int) stored,
  settled_at      timestamptz not null default now(),
  -- 스펙 §10 중복 정산 방지
  unique (order_id)
);

create index if not exists settlements_technician_idx on settlements (technician_uid);

-- ── 채팅 (Phase 2 UI, 스키마는 선반영) ──────────────────────────────────
create table if not exists messages (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references service_orders(id) on delete cascade,
  sender_uid          text not null references users(uid),
  content             text not null,
  translated_content  text,
  created_at          timestamptz not null default now()
);

create index if not exists messages_order_idx on messages (order_id, created_at);

-- ── 워런티 (30일 A/S) ───────────────────────────────────────────────────
create table if not exists warranties (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references service_orders(id) on delete cascade,
  expires_at  timestamptz not null,
  status      text not null default 'active'
                check (status in ('active', 'claimed', 'closed')),
  unique (order_id)
);

-- ── 분쟁 ────────────────────────────────────────────────────────────────
create table if not exists disputes (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references service_orders(id) on delete cascade,
  reason       text not null,
  status       text not null default 'open'
                 check (status in ('open', 'investigating', 'resolved')),
  resolved_at  timestamptz
);

create index if not exists disputes_status_idx on disputes (status);

-- ── 운영 설정 (BM→VND 환산율, 수수료율 등) ──────────────────────────────
create table if not exists service_settings (
  key    text primary key,
  value  text not null
);
