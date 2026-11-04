-- 015: 입금 확인 알림 — 관리자가 고객 입금을 확정하면 고객과 기술자에게 푸시
--
-- 현금·이체는 모두 플랫폼 관리계좌로 들어온다. 관리자가 입금을 확인해 held → completed 로
-- 바꾸는 순간,
--  · 고객: "입금이 플랫폼 관리계좌에서 확인됐다"
--  · 기술자: "고객 입금이 확인됐으니 작업을 진행해도 된다(완료 시 수수료 제외 후 정산)"
-- 를 보낸다. 완료 승인 때 자동 확정되는 건과 BM 결제는 대상이 아니다.

create or replace function notify_payment_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if old.status = 'held' and new.status = 'completed' and new.method <> 'bm' then
    select status into v_status from service_orders where id = new.order_id;
    if v_status in ('pending', 'assigned', 'in_progress') then
      perform push_call(jsonb_build_object('kind', 'payment', 'order_id', new.order_id, 'payment_id', new.id));
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_payment_confirmed_notify on payments;
create trigger on_payment_confirmed_notify
  after update of status on payments
  for each row execute function notify_payment_confirmed();
