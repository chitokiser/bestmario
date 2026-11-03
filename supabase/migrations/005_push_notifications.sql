-- 005: 새 주문이 들어오면 해당 분야 승인 기술자에게 웹 푸시 알림
--
-- 흐름: service_orders INSERT → notify_new_order() 트리거 → pg_net 으로 Edge Function(notify-order) 호출
--       → 함수가 분야가 맞는 active 기술자의 구독 정보로 웹 푸시 발송.
-- 알림 실패가 주문 생성을 막으면 안 되므로 트리거는 어떤 오류도 삼킨다.

create extension if not exists pg_net;

-- ── 구독 정보 ───────────────────────────────────────────────────────────
-- 브라우저(기기)마다 하나. 한 사람이 여러 기기를 쓸 수 있다.
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  uid        text not null references users (uid) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_uid_idx on push_subscriptions (uid);

alter table push_subscriptions enable row level security;

drop policy if exists push_sub_select_own on push_subscriptions;
create policy push_sub_select_own on push_subscriptions
  for select using (uid = firebase_uid());

drop policy if exists push_sub_insert_own on push_subscriptions;
create policy push_sub_insert_own on push_subscriptions
  for insert with check (uid = firebase_uid());

drop policy if exists push_sub_delete_own on push_subscriptions;
create policy push_sub_delete_own on push_subscriptions
  for delete using (uid = firebase_uid());

-- ── 호출 설정 (함수 주소·공유 비밀) ─────────────────────────────────────
-- 정책이 없는 RLS 테이블 = 클라이언트는 읽을 수 없고 security definer 함수만 읽는다.
-- 값은 마이그레이션이 아니라 배포 때 직접 넣는다 (Git 에 비밀을 남기지 않는다).
create table if not exists push_config (
  key   text primary key,
  value text not null
);
alter table push_config enable row level security;

-- ── 트리거 ──────────────────────────────────────────────────────────────
create or replace function notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if new.status <> 'pending' or new.technician_uid is not null then
    return new;
  end if;

  select value into v_url    from push_config where key = 'push_url';
  select value into v_secret from push_config where key = 'push_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object('order_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_order_created_notify on service_orders;
create trigger on_order_created_notify
  after insert on service_orders
  for each row execute function notify_new_order();
