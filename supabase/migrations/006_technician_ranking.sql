-- 006: 미션(완료 주문) 수행 랭킹 TOP N — 랜딩 페이지 공개용
--
-- 주문·프로필은 RLS 로 본인/관리자에게만 열려 있으므로, 집계 결과만 돌려주는
-- security definer 함수로 공개한다. 이름은 가려서 내보낸다
-- (공백이 있으면 "이름 성이니셜.", 없으면 첫 글자 + '*').
create or replace function technician_ranking(p_limit int default 10)
returns table (
  rank            int,
  display_name    text,
  completed_count int,
  rating          numeric,
  rating_count    int,
  skills          text[]
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
  )
  select (row_number() over (order by d.n desc, p.rating desc, p.uid))::int as rank,
         case
           when btrim(u.name) = '' then '***'
           when position(' ' in btrim(u.name)) > 0 then
             split_part(btrim(u.name), ' ', 1) || ' ' ||
             coalesce((regexp_match(btrim(u.name), '(\S)\S*$'))[1], '') || '.'
           else left(btrim(u.name), 1) || repeat('*', greatest(length(btrim(u.name)) - 1, 1))
         end as display_name,
         d.n as completed_count,
         p.rating::numeric,
         p.rating_count,
         p.skills
    from done d
    join technician_profiles p on p.uid = d.uid and p.status = 'active'
    join users u on u.uid = d.uid
   order by d.n desc, p.rating desc, p.uid
   limit greatest(least(coalesce(p_limit, 10), 50), 1)
$$;

grant execute on function technician_ranking(int) to anon, authenticated;
