-- 010: 용역 성사 후 연락 — 자체 채팅(실시간·푸시) + 상대방 연락처(잘로/전화)
--
-- '성사' = 기술자가 배정된 주문(technician_uid 가 있고 취소되지 않음).
-- 그 전에는 채팅도 연락처 열람도 불가능하다. 연락처는 users RLS 때문에 상대가 직접 읽을 수 없으므로
-- 당사자 검증을 거치는 order_contact() 로만 내준다.

-- ── 채팅 ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table messages;

create or replace function guard_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o service_orders%rowtype;
begin
  select * into o from service_orders where id = new.order_id;
  if not found then
    raise exception '주문을 찾을 수 없습니다';
  end if;
  if o.technician_uid is null or o.status = 'cancelled' then
    raise exception '기술자가 배정된 주문에서만 대화할 수 있습니다';
  end if;
  if new.sender_uid not in (o.customer_uid, o.technician_uid) then
    raise exception '이 주문의 당사자만 대화할 수 있습니다';
  end if;
  new.content := btrim(new.content);
  if new.content = '' then
    raise exception '메시지를 입력해 주세요';
  end if;
  if length(new.content) > 2000 then
    raise exception '메시지는 2000자 이내로 입력해 주세요';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_message_trg on messages;
create trigger guard_message_trg
  before insert on messages
  for each row execute function guard_message();

-- 새 메시지 → 상대방에게 푸시 (008 의 push_call 재사용, 실패해도 전송은 막지 않는다)
create or replace function notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform push_call(jsonb_build_object('kind', 'message', 'order_id', new.order_id, 'message_id', new.id));
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_message_created_notify on messages;
create trigger on_message_created_notify
  after insert on messages
  for each row execute function notify_message();

-- ── 상대방 연락처 ───────────────────────────────────────────────────────
create or replace function order_contact(p_order_id uuid)
returns table (name text, phone text, role text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid text := firebase_uid();
  o     service_orders%rowtype;
  v_other text;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  select * into o from service_orders where id = p_order_id;
  if not found or o.technician_uid is null or o.status = 'cancelled' then
    raise exception '연락처는 기술자가 배정된 주문에서만 확인할 수 있습니다';
  end if;
  if v_uid = o.customer_uid then
    v_other := o.technician_uid;
  elsif v_uid = o.technician_uid then
    v_other := o.customer_uid;
  else
    raise exception '이 주문의 당사자만 확인할 수 있습니다';
  end if;

  return query
    select u.name, u.phone, u.role from users u where u.uid = v_other;
end;
$$;

grant execute on function order_contact(uuid) to authenticated;
