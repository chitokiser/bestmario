-- 004: 기술자 신청서 (분야·경력·자기소개·사진·신분증을 함께 제출, 관리자 승인 후 정식 등록)
--
-- 이전에는 버튼 한 번으로 role 이 바로 technician 이 되고 서류 없이도 승인할 수 있었다.
-- 이제 신청서를 submit_technician_application() 으로 제출해야 신청이 성립하고,
-- 승인 시점에 신분증·사진이 있는지 DB 가 직접 검증한다.

-- ── 컬럼 ────────────────────────────────────────────────────────────────
alter table technician_profiles
  add column if not exists experience_years smallint
    check (experience_years is null or experience_years between 0 and 60),
  add column if not exists career        text not null default '',
  add column if not exists bio           text not null default '',
  add column if not exists submitted_at  timestamptz,
  add column if not exists reject_reason text not null default '';

-- status 에 rejected 추가. 기존 check 제약의 이름을 가정하지 않고 찾아서 지운다.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.technician_profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table technician_profiles drop constraint %I', c);
  end loop;
end $$;

alter table technician_profiles
  add constraint technician_profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'rejected'));

-- ── 가드 트리거 ─────────────────────────────────────────────────────────
-- 승인·반려 조건은 관리자·대시보드 경로에도 적용한다 (bypass 보다 먼저 검사).
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

  -- 본인에게 허용되는 상태 전환은 '반려된 신청서의 재제출(rejected -> pending)' 뿐이다.
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

-- ── 신청 제출 ───────────────────────────────────────────────────────────
-- 역할 변경과 프로필 생성을 한 트랜잭션으로 묶는다. 중간에 실패하면 role 은 바뀌지 않는다.
-- 서류 경로는 (1) 첫 세그먼트가 본인 uid 이고 (2) 실제로 업로드된 파일이어야 한다.
create or replace function submit_technician_application(
  p_phone            text,
  p_skills           text[],
  p_experience_years int,
  p_career           text,
  p_bio              text,
  p_documents        jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := firebase_uid();
  v_role   text;
  v_status text;
  v_docs   jsonb := coalesce(p_documents, '{}'::jsonb);
  k        text;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;

  select role into v_role from users where uid = v_uid;
  if v_role is null then
    raise exception '계정 정보가 없습니다. 홈에서 다시 로그인해 주세요';
  end if;
  if v_role = 'admin' then
    raise exception '관리자 계정은 기술자로 신청할 수 없습니다';
  end if;

  if btrim(coalesce(p_phone, '')) = '' then
    raise exception '연락처를 입력해 주세요';
  end if;
  if coalesce(array_length(p_skills, 1), 0) = 0 then
    raise exception '기술분야를 1개 이상 선택해 주세요';
  end if;
  if exists (
    select 1 from unnest(p_skills) s where s not in (select id from service_categories)
  ) then
    raise exception '알 수 없는 기술분야가 있습니다';
  end if;
  if p_experience_years is null or p_experience_years < 0 or p_experience_years > 60 then
    raise exception '경력 연수는 0~60 사이여야 합니다';
  end if;
  if btrim(coalesce(p_career, '')) = '' then
    raise exception '경력 내용을 입력해 주세요';
  end if;
  if btrim(coalesce(p_bio, '')) = '' then
    raise exception '자기소개를 입력해 주세요';
  end if;
  if length(p_career) > 2000 or length(p_bio) > 2000 then
    raise exception '경력·자기소개는 2000자 이내로 입력해 주세요';
  end if;

  foreach k in array array['photo', 'id_card'] loop
    if coalesce(v_docs ->> k, '') = '' then
      raise exception '필수 서류가 없습니다: %', k;
    end if;
  end loop;

  for k in select jsonb_object_keys(v_docs) loop
    if k not in ('photo', 'id_card', 'business_license') then
      raise exception '허용되지 않는 서류 종류입니다: %', k;
    end if;
    if split_part(v_docs ->> k, '/', 1) <> v_uid then
      raise exception '본인 폴더가 아닌 파일 경로입니다: %', k;
    end if;
    if not exists (
      select 1 from storage.objects where bucket_id = 'documents' and name = v_docs ->> k
    ) then
      raise exception '업로드되지 않은 파일입니다: %', k;
    end if;
  end loop;

  select status into v_status from technician_profiles where uid = v_uid;
  if v_status in ('active', 'suspended') then
    raise exception '이미 등록된 기술자입니다';
  end if;

  perform set_config('bestmario.internal', 'on', true);

  update users
     set phone = btrim(p_phone),
         role  = 'technician'
   where uid = v_uid;

  insert into technician_profiles
    (uid, status, skills, documents, experience_years, career, bio, submitted_at, reject_reason)
  values
    (v_uid, 'pending', p_skills, v_docs, p_experience_years, btrim(p_career), btrim(p_bio), now(), '')
  on conflict (uid) do update set
    status           = 'pending',
    skills           = excluded.skills,
    documents        = excluded.documents,
    experience_years = excluded.experience_years,
    career           = excluded.career,
    bio              = excluded.bio,
    submitted_at     = now(),
    reject_reason    = '';

  perform set_config('bestmario.internal', 'off', true);
end;
$$;
