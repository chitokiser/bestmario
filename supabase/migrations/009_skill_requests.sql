-- 009: 기술분야 추가 신청 → 관리자 승인
--
-- 이전에는 기술자가 프로필에서 분야(skills)를 직접 바꿀 수 있어 승인 절차가 없었다.
-- 이제 skills 는 관리자만 바꿀 수 있고, 기술자는 분야 추가를 '신청'한다.
-- 신청·결정은 모두 RPC 로만 하며 테이블에는 직접 쓰기 정책을 두지 않는다.

create table if not exists skill_requests (
  id            uuid primary key default gen_random_uuid(),
  uid           text not null references users (uid) on delete cascade,
  category_id   text not null references service_categories (id),
  note          text not null default '',
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  reject_reason text not null default '',
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists skill_requests_uid_idx on skill_requests (uid);
create index if not exists skill_requests_pending_idx on skill_requests (status) where status = 'pending';
-- 같은 사람이 같은 분야를 동시에 두 번 신청하지 못하게 한다
create unique index if not exists skill_requests_one_pending
  on skill_requests (uid, category_id) where status = 'pending';

alter table skill_requests enable row level security;

drop policy if exists skill_req_select on skill_requests;
create policy skill_req_select on skill_requests
  for select using (uid = firebase_uid() or is_admin());
-- insert/update/delete 정책 없음: request_skill / decide_skill_request 만 쓴다.

-- ── 기술분야는 본인이 직접 못 바꾼다 ────────────────────────────────────
create or replace function guard_technician_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    if coalesce(new.documents ->> 'id_card', '') = ''
       or coalesce(new.documents ->> 'photo', '') = '' then
      raise exception '신분증과 프로필 사진이 등록되어야 승인할 수 있습니다';
    end if;
    if new.submitted_at is null then
      raise exception '제출되지 않은 신청서는 승인할 수 없습니다';
    end if;
  end if;

  if new.status = 'rejected' and old.status is distinct from 'rejected'
     and btrim(new.reject_reason) = '' then
    raise exception '반려 사유를 입력해야 합니다';
  end if;

  if guard_bypass() then
    return new;
  end if;

  if new.uid <> old.uid then
    raise exception 'uid 는 변경할 수 없습니다';
  end if;
  if new.rating <> old.rating or new.rating_count <> old.rating_count then
    raise exception '평점은 직접 변경할 수 없습니다';
  end if;
  if new.skills is distinct from old.skills then
    raise exception '기술분야는 직접 바꿀 수 없습니다. 분야 추가를 신청해 주세요';
  end if;

  if new.status <> old.status then
    if not (old.status = 'rejected' and new.status = 'pending') then
      raise exception '기술자 승인 상태는 관리자만 변경할 수 있습니다';
    end if;
    new.reject_reason := '';
    new.submitted_at  := now();
  elsif new.reject_reason <> old.reject_reason then
    raise exception '반려 사유는 관리자만 입력할 수 있습니다';
  end if;

  return new;
end;
$$;

-- ── 신청 ────────────────────────────────────────────────────────────────
create or replace function request_skill(p_category text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := firebase_uid();
  v_status text;
  v_skills text[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;

  select status, skills into v_status, v_skills from technician_profiles where uid = v_uid;
  if v_status is distinct from 'active' then
    raise exception '승인된 기술자만 분야를 추가 신청할 수 있습니다';
  end if;
  if not exists (select 1 from service_categories where id = p_category) then
    raise exception '알 수 없는 기술분야입니다';
  end if;
  if p_category = any (v_skills) then
    raise exception '이미 등록된 분야입니다';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception '설명은 1000자 이내로 입력해 주세요';
  end if;
  if (select count(*) from skill_requests where uid = v_uid and status = 'pending') >= 5 then
    raise exception '대기 중인 신청이 너무 많습니다 (최대 5건)';
  end if;
  if exists (select 1 from skill_requests where uid = v_uid and category_id = p_category and status = 'pending') then
    raise exception '이미 신청한 분야입니다. 승인을 기다려 주세요';
  end if;

  insert into skill_requests (uid, category_id, note)
  values (v_uid, p_category, btrim(coalesce(p_note, '')));
end;
$$;

-- ── 결정 (관리자) ───────────────────────────────────────────────────────
create or replace function decide_skill_request(p_id uuid, p_approve boolean, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r skill_requests%rowtype;
  n int;
begin
  if not is_admin() then
    raise exception '관리자만 처리할 수 있습니다';
  end if;

  select * into r from skill_requests where id = p_id for update;
  if not found then
    raise exception '신청을 찾을 수 없습니다';
  end if;
  if r.status <> 'pending' then
    raise exception '이미 처리된 신청입니다';
  end if;

  if p_approve then
    perform set_config('bestmario.internal', 'on', true);
    update technician_profiles
       set skills = array_append(skills, r.category_id)
     where uid = r.uid and status = 'active' and not (r.category_id = any (skills));
    get diagnostics n = row_count;
    perform set_config('bestmario.internal', 'off', true);
    if n = 0 then
      raise exception '활성 기술자가 아니거나 이미 등록된 분야라 승인할 수 없습니다';
    end if;

    update skill_requests set status = 'approved', decided_at = now() where id = p_id;
  else
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception '반려 사유를 입력해야 합니다';
    end if;
    update skill_requests
       set status = 'rejected', reject_reason = btrim(p_reason), decided_at = now()
     where id = p_id;
  end if;
end;
$$;

grant execute on function request_skill(text, text) to authenticated;
grant execute on function decide_skill_request(uuid, boolean, text) to authenticated;
