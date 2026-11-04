-- 014: 배정 전 문의 댓글 — 견적 요청에 자료가 부족할 때 기술자가 고객에게 묻는다
--
-- 채팅(messages)은 기술자가 배정된 뒤에만 열린다. 배정 전에는 이 댓글 스레드를 쓴다.
--  · 기술자(승인됨·해당 분야)와 주문한 고객만 쓸 수 있다. 같은 질문이 반복되지 않도록 스레드는
--    그 주문을 볼 수 있는 기술자들에게 함께 보인다.
--  · 사진·도면(이미지)을 첨부할 수 있다. 파일은 비공개 버킷에 두고, 스레드 참여자만 볼 수 있다.
--  · 연락처 같은 개인정보는 열리지 않는다(이름은 가려서 내려보낸다). 연락은 배정 뒤 order_contact 로 한다.
--  · 읽기·쓰기는 모두 RPC 로만 한다(테이블 직접 접근 정책 없음).

create table if not exists order_comments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references service_orders (id) on delete cascade,
  author_uid text not null references users (uid),
  content    text not null default '' check (length(content) <= 1000),
  image_path text,
  created_at timestamptz not null default now(),
  -- 글이나 사진 중 하나는 있어야 한다
  check (btrim(content) <> '' or image_path is not null)
);
create index if not exists order_comments_order_idx on order_comments (order_id, created_at);

alter table order_comments enable row level security;
-- 정책 없음: 클라이언트는 직접 읽거나 쓸 수 없다.

-- ── 첨부 이미지 버킷 (비공개, 이미지만, 5MB) ────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-files', 'comment-files', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ── 접근 판정 ───────────────────────────────────────────────────────────
-- 호출자가 이 주문의 스레드에서 어떤 입장인지: 'customer' | 'technician' | 'admin' | null
create or replace function comment_role(p_order_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid text := firebase_uid();
  o     service_orders%rowtype;
begin
  if v_uid is null then
    return null;
  end if;
  select * into o from service_orders where id = p_order_id;
  if not found then
    return null;
  end if;
  if o.customer_uid = v_uid then
    return 'customer';
  end if;
  if is_admin() then
    return 'admin';
  end if;
  -- 배정된 기술자는 읽을 수 있다
  if o.technician_uid = v_uid then
    return 'technician';
  end if;
  -- 아직 열려 있는 주문은 해당 분야의 승인 기술자가 볼 수 있다
  if o.technician_uid is null and o.status = 'pending'
     and exists (
       select 1 from technician_profiles p
        where p.uid = v_uid and p.status = 'active' and o.category_id = any (p.skills)
     ) then
    return 'technician';
  end if;
  return null;
end;
$$;

-- 스토리지 정책에서 쓴다: 이 파일이 붙은 댓글의 스레드에 접근할 수 있는가
create or replace function can_read_comment_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from order_comments c
     where c.image_path = p_name and comment_role(c.order_id) is not null
  )
$$;

drop policy if exists comment_files_insert on storage.objects;
create policy comment_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comment-files'
    and (storage.foldername(name))[1] = firebase_uid()
  );

drop policy if exists comment_files_select on storage.objects;
create policy comment_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comment-files'
    and ((storage.foldername(name))[1] = firebase_uid() or can_read_comment_file(name))
  );

-- ── 목록 ────────────────────────────────────────────────────────────────
create or replace function list_order_comments(p_order_id uuid)
returns table (id uuid, author_role text, display_name text, content text, image_path text, created_at timestamptz, mine boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  text := firebase_uid();
  v_role text := comment_role(p_order_id);
  v_cust text;
begin
  if v_role is null then
    raise exception '이 주문의 문의 내용을 볼 수 없습니다';
  end if;
  select customer_uid into v_cust from service_orders where service_orders.id = p_order_id;

  return query
    select c.id,
           case when c.author_uid = v_cust then 'customer' else 'technician' end,
           case when c.author_uid = v_cust then '' else mask_name(u.name) end,
           c.content,
           c.image_path,
           c.created_at,
           (c.author_uid = v_uid)
      from order_comments c
      join users u on u.uid = c.author_uid
     where c.order_id = p_order_id
     order by c.created_at;
end;
$$;

-- ── 작성 ────────────────────────────────────────────────────────────────
create or replace function post_order_comment(p_order_id uuid, p_content text, p_image text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  text := firebase_uid();
  v_role text := comment_role(p_order_id);
  o      service_orders%rowtype;
  v_text text := btrim(coalesce(p_content, ''));
  v_img  text := nullif(btrim(coalesce(p_image, '')), '');
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  -- v_role 이 null 이면 'not in' 이 null 이 되어 검사가 통과해 버리므로 null 을 따로 막는다
  if v_role is null or v_role not in ('customer', 'technician') then
    raise exception '이 주문에는 문의를 남길 수 없습니다';
  end if;
  select * into o from service_orders where id = p_order_id;
  if o.technician_uid is not null or o.status <> 'pending' then
    raise exception '기술자가 배정된 뒤에는 채팅을 이용해 주세요';
  end if;
  if v_text = '' and v_img is null then
    raise exception '내용을 입력하거나 사진을 첨부해 주세요';
  end if;
  if length(v_text) > 1000 then
    raise exception '1000자 이내로 입력해 주세요';
  end if;

  if v_img is not null then
    -- 본인 폴더의 실제 업로드된 파일만 붙일 수 있다
    if split_part(v_img, '/', 1) <> v_uid then
      raise exception '본인 폴더가 아닌 파일입니다';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'comment-files' and name = v_img) then
      raise exception '업로드되지 않은 파일입니다';
    end if;
  end if;

  -- 도배 방지: 같은 사람이 한 주문에 남길 수 있는 댓글은 100개까지
  if (select count(*) from order_comments where order_id = p_order_id and author_uid = v_uid) >= 100 then
    raise exception '이 주문에 남길 수 있는 댓글 수를 넘었습니다';
  end if;

  insert into order_comments (order_id, author_uid, content, image_path)
  values (p_order_id, v_uid, v_text, v_img);
end;
$$;

grant execute on function list_order_comments(uuid) to authenticated;
grant execute on function post_order_comment(uuid, text, text) to authenticated;

-- ── 새 댓글 푸시 (008 의 push_call 재사용) ──────────────────────────────
create or replace function notify_order_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform push_call(jsonb_build_object('kind', 'comment', 'order_id', new.order_id, 'comment_id', new.id));
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_order_comment_notify on order_comments;
create trigger on_order_comment_notify
  after insert on order_comments
  for each row execute function notify_order_comment();
