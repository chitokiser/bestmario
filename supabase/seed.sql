-- BestMario — seed.sql
-- 001 → 002 → 003 적용 후 마지막에 실행. 반복 실행 가능(idempotent).

-- ── 13개 서비스 카테고리 ────────────────────────────────────────────────
-- id 는 web/src/components/LandingClient.tsx 의 BESTMARIO_SERVICES[].id 와 동일해야 한다.
insert into service_categories (id, name_ko, name_vi, name_en, icon) values
  ('repair',     '생활수리 및 출장 홈서비스',   'Sửa chữa & Dịch vụ tại nhà',        'Home Repair & Services',        '🔧'),
  ('clean',      '청소 및 위생관리',            'Vệ sinh & Khử trùng',               'Cleaning & Sanitation',         '🧹'),
  ('interior',   '인테리어 및 리모델링',        'Nội thất & Cải tạo',                'Interior & Renovation',         '🏠'),
  ('design3d',   '인테리어 설계 및 3D 디자인',  'Thiết kế & Mô hình 3D',             'Design & 3D Visualization',     '📐'),
  ('elevator',   '엘리베이터 및 승강설비',      'Thang máy & Thiết bị nâng',         'Elevator & Lifting Systems',    '🛗'),
  ('hvac',       '냉난방 및 공조설비',          'Điều hòa & Thông gió',              'HVAC Systems',                  '❄️'),
  ('electric',   '전기·전자 및 스마트홈',       'Điện & Nhà thông minh',             'Electrical & Smart Home',       '⚡'),
  ('waterproof', '방수·도장·건축 보수',         'Chống thấm & Sơn phủ',              'Construction Maintenance',      '🏗️'),
  ('move',       '이사 및 입주 서비스',         'Chuyển nhà & Dọn vào',              'Moving & Relocation',           '📦'),
  ('garden',     '정원 및 외부시설 관리',       'Sân vườn & Ngoại thất',             'Garden & Outdoor',              '🌿'),
  ('pest',       '해충 방제 및 환경관리',       'Kiểm soát côn trùng',               'Pest Control',                  '🪲'),
  ('appliance',  '가전제품 및 생활설비',        'Gia dụng & Thiết bị',               'Appliance Services',            '🔌'),
  ('safety',     '안전·소방 및 건물 관리',      'An toàn & PCCC & Quản lý tòa nhà',  'Safety & Facility Management',  '🛡️')
on conflict (id) do update set
  name_ko = excluded.name_ko,
  name_vi = excluded.name_vi,
  name_en = excluded.name_en,
  icon    = excluded.icon;

-- ── 고정가 메뉴 (order_type = 'fixed') ──────────────────────────────────
-- !! base_price 는 하노이 시세 기준 임시값이다. 운영 개시 전 관리자가 반드시 확정할 것.
insert into service_products (id, category_id, name_ko, name_vi, base_price, description) values
  ('hvac-clean-1',      'hvac',      '에어컨 청소 (1대)',      'Vệ sinh máy lạnh (1 máy)',      350000,  '벽걸이형 1대 분해 세척'),
  ('hvac-install-1',    'hvac',      '에어컨 설치 (1대)',      'Lắp máy lạnh (1 máy)',          800000,  '벽걸이형 1대 설치, 배관 3m 포함'),
  ('hvac-gas-1',        'hvac',      '에어컨 가스 충전',       'Nạp gas máy lạnh',              500000,  'R32/R410A 냉매 충전'),
  ('clean-home-4h',     'clean',     '가정 청소 (4시간)',      'Vệ sinh nhà ở (4 giờ)',         500000,  '청소도구 지참, 2인 2시간 또는 1인 4시간'),
  ('clean-movein',      'clean',     '입주 청소',              'Vệ sinh trước khi chuyển vào',  1500000, '최대 100㎡ 기준 전체 청소'),
  ('clean-sofa',        'clean',     '소파 세탁',              'Giặt sofa',                     600000,  '3인용 패브릭 소파 1개'),
  ('repair-electric',   'repair',    '전기 수리 출장',         'Sửa điện tại nhà',              300000,  '출장비 포함, 부품비 별도'),
  ('repair-plumbing',   'repair',    '수도·배관 수리 출장',    'Sửa đường ống nước tại nhà',    350000,  '출장비 포함, 부품비 별도'),
  ('repair-doorlock',   'repair',    '도어락 설치',            'Lắp khóa cửa thông minh',       700000,  '제품 제외 설치비'),
  ('appliance-washer',  'appliance', '세탁기 수리 출장',       'Sửa máy giặt tại nhà',          400000,  '진단 포함, 부품비 별도'),
  ('appliance-fridge',  'appliance', '냉장고 수리 출장',       'Sửa tủ lạnh tại nhà',           450000,  '진단 포함, 부품비 별도'),
  ('pest-cockroach',    'pest',      '바퀴벌레 방제',          'Diệt gián',                     600000,  '최대 80㎡ 1회 방제'),
  ('pest-mosquito',     'pest',      '모기 방제',              'Diệt muỗi',                     500000,  '최대 80㎡ 1회 방제'),
  ('electric-cctv-1',   'electric',  'CCTV 설치 (1대)',        'Lắp camera CCTV (1 cái)',       1200000, '제품 제외 설치·배선비')
on conflict (id) do update set
  category_id = excluded.category_id,
  name_ko     = excluded.name_ko,
  name_vi     = excluded.name_vi,
  base_price  = excluded.base_price,
  description = excluded.description;

-- ── 운영 설정 ───────────────────────────────────────────────────────────
-- bm_rate_vnd      : 1 BM = ? VND (미확정 사항 #6 — 관리자 대시보드에서 변경)
-- platform_fee_rate: 플랫폼 수수료율 (스펙 §6 10~15%)
insert into service_settings (key, value) values
  ('bm_rate_vnd',       '1000'),
  ('platform_fee_rate', '0.100')
on conflict (key) do nothing;

-- ── 최초 관리자 지정 (수동) ─────────────────────────────────────────────
-- 아래 주석을 해제하고 <FIREBASE_UID> 를 관리자 Firebase uid 로 바꿔 실행한다.
-- Firestore users/<uid> 문서에도 role: 'admin' 을 같이 설정해야 /admin 가드를 통과한다.
--
-- insert into users (uid, role, name, lang)
--   values ('<FIREBASE_UID>', 'admin', '관리자', 'ko')
--   on conflict (uid) do update set role = 'admin';
