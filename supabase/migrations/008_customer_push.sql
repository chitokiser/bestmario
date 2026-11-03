-- 008: 고객에게도 푸시 — 기술자가 수락했을 때, 견적이 도착했을 때
--
-- 005 의 호출 경로를 그대로 쓴다. 호출 코드를 한 곳(push_call)으로 모으고
-- 이벤트 종류(kind)를 본문에 실어 보낸다. kind 가 없으면 기존 '새 주문' 으로 처리한다.
-- 알림 실패가 주문·견적 처리를 막으면 안 되므로 모든 트리거는 오류를 삼킨다.

create or replace function push_call(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from push_config where key = 'push_url';
  select value into v_secret from push_config where key = 'push_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := p_body
  );
exception when others then
  null;
end;
$$;

-- 기술자가 직접 수락해 배정된 순간 → 주문한 고객에게
-- (견적 요청은 고객이 직접 견적을 골라 배정하므로 제외)
create or replace function notify_order_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.technician_uid is null and new.technician_uid is not null
     and new.status = 'assigned' and new.order_type <> 'quote_request' then
    perform push_call(jsonb_build_object('kind', 'assigned', 'order_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_order_assigned_notify on service_orders;
create trigger on_order_assigned_notify
  after update of technician_uid on service_orders
  for each row execute function notify_order_assigned();

-- 새 견적이 제출되면 → 주문한 고객에게
create or replace function notify_quote_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform push_call(jsonb_build_object('kind', 'quote', 'order_id', new.order_id, 'quotation_id', new.id));
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_quotation_created_notify on quotations;
create trigger on_quotation_created_notify
  after insert on quotations
  for each row execute function notify_quote_received();
