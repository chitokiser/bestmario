-- 011: 리뷰·평점, 랭킹에 작업 내역·리뷰 노출
--
-- technician_profiles.rating 칼럼은 있었지만 값을 채우는 경로가 없었다.
-- 이제 고객이 '완료된' 주문에 별점(1~5)과 후기를 남기면 기술자의 평균이 자동 갱신된다.
-- 쓰기는 RPC 로만 하고(주문당 1건), 공개 노출은 이름을 가린 집계 함수로만 한다.

create table if not exists reviews (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references service_orders (id) on delete cascade,
  customer_uid   text not null references users (uid),
  technician_uid text not null references users (uid),
  rating         smallint not null check (rating between 1 and 5),
  comment        text not null default '' check (length(comment) <= 1000),
  created_at     timestamptz not null default now()
);
create index if not exists reviews_technician_idx on reviews (technician_uid, created_at desc);

alter table reviews enable row level security;

drop policy if exists reviews_select_party on reviews;
create policy reviews_select_party on reviews
  for select using (customer_uid = firebase_uid() or technician_uid = firebase_uid() or is_admin());
-- insert/update/delete 정책 없음: submit_review 만 쓴다.

-- ── 작성 ────────────────────────────────────────────────────────────────
create or replace function submit_review(p_order_id uuid, p_rating int, p_comment text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := firebase_uid();
  o     service_orders%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  select * into o from service_orders where id = p_order_id;
  if not found or o.customer_uid <> v_uid then
    raise exception '본인이 주문한 건만 리뷰를 남길 수 있습니다';
  end if;
  if o.status <> 'completed' or o.technician_uid is null then
    raise exception '작업이 완료된 주문에만 리뷰를 남길 수 있습니다';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception '별점은 1~5 사이여야 합니다';
  end if;
  if length(coalesce(p_comment, '')) > 1000 then
    raise exception '후기는 1000자 이내로 입력해 주세요';
  end if;
  if exists (select 1 from reviews where order_id = p_order_id) then
    raise exception '이미 리뷰를 남긴 주문입니다';
  end if;

  insert into reviews (order_id, customer_uid, technician_uid, rating, comment)
  values (p_order_id, v_uid, o.technician_uid, p_rating, btrim(coalesce(p_comment, '')));
end;
$$;

grant execute on function submit_review(uuid, int, text) to authenticated;

-- ── 평균 갱신 ───────────────────────────────────────────────────────────
-- rating 은 guard_technician_profile 이 동결하므로 내부 플래그를 켜고 갱신한다.
create or replace function refresh_technician_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('bestmario.internal', 'on', true);
  update technician_profiles p
     set rating       = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r where r.technician_uid = new.technician_uid), 0),
         rating_count = (select count(*) from reviews r where r.technician_uid = new.technician_uid)
   where p.uid = new.technician_uid;
  perform set_config('bestmario.internal', 'off', true);
  return new;
end;
$$;

drop trigger if exists on_review_created_rating on reviews;
create trigger on_review_created_rating
  after insert on reviews
  for each row execute function refresh_technician_rating();

-- ── 이름 가리기 (공개 화면용) ───────────────────────────────────────────
-- 공백이 있으면 "이름 성이니셜.", 없으면 첫 글자 + '*'
create or replace function mask_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p_name, '')) = '' then '***'
    when position(' ' in btrim(p_name)) > 0 then
      split_part(btrim(p_name), ' ', 1) || ' ' ||
      coalesce((regexp_match(btrim(p_name), '(\S)\S*$'))[1], '') || '.'
    else left(btrim(p_name), 1) || repeat('*', greatest(length(btrim(p_name)) - 1, 1))
  end
$$;

-- ── 랭킹: 작업 내역과 리뷰 포함 ─────────────────────────────────────────
drop function if exists technician_ranking(int);

create function technician_ranking(p_limit int default 10)
returns table (
  rank            int,
  display_name    text,
  completed_count int,
  rating          numeric,
  rating_count    int,
  skills          text[],
  recent_jobs     jsonb,
  recent_reviews  jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with done as (
    select technician_uid as uid, count(*)::int as n
      from service_orders
     where status = 'completed' and technician_uid is not null
     group by technician_uid
  ),
  ranked as (
    select (row_number() over (order by d.n desc, p.rating desc, p.uid))::int as rank,
           d.uid, d.n, p.rating, p.rating_count, p.skills, u.name
      from done d
      join technician_profiles p on p.uid = d.uid and p.status = 'active'
      join users u on u.uid = d.uid
     order by d.n desc, p.rating desc, p.uid
     limit greatest(least(coalesce(p_limit, 10), 50), 1)
  )
  select r.rank,
         mask_name(r.name),
         r.n,
         r.rating::numeric,
         r.rating_count,
         r.skills,
         -- 최근 완료한 작업(분야·항목·작업일). 주소·요청 메모는 공개하지 않는다.
         coalesce((
           select jsonb_agg(x.j order by x.at desc)
             from (
               select jsonb_build_object(
                        'at',   o.scheduled_at,
                        'cat',  jsonb_build_object('ko', c.name_ko, 'vi', c.name_vi, 'en', c.name_en, 'icon', c.icon),
                        'item', jsonb_build_object('ko', sp.name_ko, 'vi', sp.name_vi)
                      ) as j,
                      o.scheduled_at as at
                 from service_orders o
                 left join service_categories c on c.id = o.category_id
                 left join service_products sp on sp.id = o.product_id
                where o.technician_uid = r.uid and o.status = 'completed'
                order by o.scheduled_at desc
                limit 3
             ) x
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'rating',  rv.rating,
                    'comment', rv.comment,
                    'by',      mask_name(cu.name),
                    'at',      rv.created_at
                  ) order by rv.created_at desc)
             from (
               select * from reviews
                where technician_uid = r.uid
                order by created_at desc
                limit 3
             ) rv
             join users cu on cu.uid = rv.customer_uid
         ), '[]'::jsonb)
    from ranked r
   order by r.rank
$$;

grant execute on function technician_ranking(int) to anon, authenticated;
