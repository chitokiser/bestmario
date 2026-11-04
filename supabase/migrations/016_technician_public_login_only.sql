-- 016: technician_public 을 로그인한 사용자에게 열어 둔다
--
-- 이 프로젝트의 로그인 토큰(Third Party Auth)은 DB 역할이 authenticated 가 아니라 anon 으로 잡힌다.
-- (스토리지 업로드가 'to authenticated' 정책에서 막힌 것과 같은 현상)
-- 그래서 authenticated 에만 select 를 준 뷰는 로그인한 고객에게도 조회가 거부되어,
-- 주문 상세 헤더가 기술자가 배정되었는데도 "아직 배정되지 않았습니다"로 보였다.
--
-- 역할 대신 firebase_uid() 로 판정한다: 로그인(토큰의 sub 있음)한 경우에만 행이 보이고,
-- 비로그인 요청에는 빈 결과다. 노출 범위는 이전과 같다(이름·평점은 로그인한 사용자에게만).

create or replace view technician_public as
  select
    p.uid,
    p.status,
    p.skills,
    p.rating,
    p.rating_count,
    u.name
  from technician_profiles p
  join users u on u.uid = p.uid
  where p.status = 'active'
    and firebase_uid() is not null;

grant select on technician_public to anon, authenticated;
