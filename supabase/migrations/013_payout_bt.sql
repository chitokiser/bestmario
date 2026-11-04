-- 013: 플랫폼 계좌 결제 · 기술자 정산 지급 기록 · 운영자 BT 지급 기록
--
-- 1) 고객의 현금 지불은 플랫폼이 지정한 계좌로만 받는다 → '현장 현금' 결제를 막는다.
--    계좌 정보는 service_settings 에 두고 관리자가 입력한다 (코드·Git 에 계좌번호를 남기지 않는다).
-- 2) 정산 기록(settlements: 총액·수수료율·순액)은 이미 완료 시점에 생성된다.
--    여기에 '기술자에게 실제로 입금했는지(지급 상태·일시·거래 참조)'를 더한다.
-- 3) 운영자가 BestClub 의 merchantSendBtDirect 로 고객에게 BT 를 보내면 그 사실을 bt_grants 에 남긴다.
--    (BT 잔고 자체는 BestClub/Firebase 에 있고, 여기서는 지급 이력만 기록한다.)

-- ── 1) 플랫폼 계좌 설정 ─────────────────────────────────────────────────
insert into service_settings (key, value) values
  ('bank_name', ''), ('bank_account', ''), ('bank_holder', '')
on conflict (key) do nothing;

create or replace function reject_cash_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.method = 'cash' and not guard_bypass() then
    raise exception '현금 결제는 플랫폼이 지정한 계좌로 이체해 주세요';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_cash_payment_trg on payments;
create trigger reject_cash_payment_trg
  before insert on payments
  for each row execute function reject_cash_payment();

-- ── 2) 기술자 정산 계좌와 지급 기록 ─────────────────────────────────────
alter table technician_profiles
  add column if not exists bank_name    text not null default '',
  add column if not exists bank_account text not null default '',
  add column if not exists bank_holder  text not null default '';

alter table settlements
  add column if not exists payout_status text not null default 'pending'
    check (payout_status in ('pending', 'paid')),
  add column if not exists paid_at       timestamptz,
  add column if not exists payout_ref    text not null default '',
  -- 지급 당시 입금한 계좌의 스냅샷 (이후 기술자가 계좌를 바꿔도 기록은 남는다)
  add column if not exists payout_bank   text not null default '';

create index if not exists settlements_payout_idx on settlements (payout_status);

create or replace function mark_settlement_paid(p_id uuid, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s settlements%rowtype;
  b technician_profiles%rowtype;
begin
  if not is_admin() then
    raise exception '관리자만 처리할 수 있습니다';
  end if;
  if btrim(coalesce(p_ref, '')) = '' then
    raise exception '입금 거래번호(또는 메모)를 입력해 주세요';
  end if;

  select * into s from settlements where id = p_id for update;
  if not found then
    raise exception '정산 기록을 찾을 수 없습니다';
  end if;
  if s.payout_status = 'paid' then
    raise exception '이미 지급 처리된 정산입니다';
  end if;

  select * into b from technician_profiles where uid = s.technician_uid;
  if coalesce(b.bank_account, '') = '' then
    raise exception '기술자가 정산 계좌를 등록하지 않았습니다';
  end if;

  update settlements
     set payout_status = 'paid',
         paid_at       = now(),
         payout_ref    = btrim(p_ref),
         payout_bank   = b.bank_name || ' ' || b.bank_account || ' (' || b.bank_holder || ')'
   where id = p_id;
end;
$$;

grant execute on function mark_settlement_paid(uuid, text) to authenticated;

-- ── 3) 고객 이메일 + BT 지급 기록 ───────────────────────────────────────
-- BestClub 의 merchantSendBtDirect 는 고객을 이메일로 찾는다. 로그인할 때 저장한다.
alter table users add column if not exists email text not null default '';

create table if not exists bt_grants (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references service_orders (id) on delete cascade,
  customer_uid text not null references users (uid),
  amount_vnd   int  not null check (amount_vnd > 0),
  bt_issued    int,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error        text not null default '',
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table bt_grants enable row level security;

drop policy if exists bt_grants_admin on bt_grants;
create policy bt_grants_admin on bt_grants for all using (is_admin()) with check (is_admin());

-- 고객은 자기에게 지급된 내역을 읽을 수 있다
drop policy if exists bt_grants_own on bt_grants;
create policy bt_grants_own on bt_grants for select using (customer_uid = firebase_uid());
