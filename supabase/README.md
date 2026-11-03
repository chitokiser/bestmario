# BestMario Supabase 셋업

이 디렉터리의 SQL은 **아직 한 번도 실행되지 않았습니다.** 아래 순서대로 적용해야
주문·결제·기술자·관리자 기능이 동작합니다.

## 1. 프로젝트 생성

Supabase 대시보드에서 신규 프로젝트를 만듭니다 (region: **Southeast Asia**).

## 2. Firebase를 Third Party Auth로 등록

`Project Settings > Auth > Third Party Auth > Add provider > Firebase`

`web/.env.local`의 `NEXT_PUBLIC_FIREBASE_PROJECT_ID`와 **같은** 프로젝트 ID를
넣어야 합니다. 이 값이 다르면 Firebase ID 토큰이 거부되고 모든 조회가 빈 결과가 됩니다.

> RLS 정책은 역할(`authenticated`)이 아니라 JWT의 `sub` 클레임으로 통제하므로,
> Firebase 토큰에 `role` 커스텀 클레임을 따로 넣지 않아도 됩니다.

## 3. 환경변수

`web/.env.local`에 아래를 추가합니다 (`Project Settings > API`에서 확인).

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_USE_EMULATOR=false
```

`service_role` 키는 클라이언트에 절대 넣지 않습니다.

## 4. 마이그레이션 적용

SQL Editor에서 **이 순서대로** 실행합니다. 순서를 바꾸면 실패합니다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `migrations/001_schema.sql` | 테이블·인덱스·제약 |
| 2 | `migrations/002_rls.sql` | 인증 헬퍼, RLS 정책, Realtime, Storage 버킷·정책 |
| 3 | `migrations/003_functions.sql` | 정산·가드 트리거, `accept_quotation` RPC |
| 4 | `seed.sql` | 13개 카테고리, 고정가 상품, 운영 설정 |

**002만 적용하고 003을 건너뛰면 안 됩니다.** RLS는 "어떤 행"만 통제하고
"어떤 컬럼을 어떤 값으로"는 표현할 수 없습니다. 003의 `guard_*` 트리거가
상태 전이와 동결 컬럼을 담당하므로, 빠뜨리면 기술자가 스스로를 승인하거나
고객이 견적 금액을 고쳐 쓸 수 있습니다.

적용 후 Table Editor에서 모든 테이블의 RLS 열에 초록 표시가 뜨는지 확인합니다.

## 5. 최초 관리자 지정

관리자 계정으로 사이트에 한 번 로그인해 `users` 행을 만든 뒤,
`/admin`에 접속하면 화면에 표시되는 uid를 복사합니다. 그다음 SQL Editor에서:

```sql
update users set role = 'admin' where uid = '<FIREBASE_UID>';
```

관리자 권한은 앱에서 자가 설정할 수 없습니다(`guard_user_role`). SQL Editor에는
요청 JWT가 없어 그 경로만 허용됩니다.

## 6. 운영 개시 전 반드시 확정할 것

| 항목 | 현재 상태 |
|---|---|
| `service_products.base_price` | **하노이 시세 기준 임시값.** 관리자가 전 항목 확정 필요 |
| `service_settings.bm_rate_vnd` | `1000` (임시) — 관리자 화면에서 변경 |
| `service_settings.platform_fee_rate` | `0.100` (스펙 §6의 10~15% 범위 내) |
| BM 결제 | `payServiceJobEscrow` / `releaseEscrow` Firebase callable이 이 저장소에 **없음**. 공유 프로젝트에 존재하는지 확인 필요 |
| BM 결제 기록 위조 | 고객이 Firebase 차감 없이 `method='bm'` 결제 행을 넣을 수 있음. 차감과 기록을 함께 수행하는 서버 경로(Edge Function 등)가 필요 |
| VietQR / MoMo | sandbox 미연동. 현재는 현금과 동일하게 관리자 수동 입금 확인 |
| 완료 72시간 자동 승인 | 미구현. 관리자 화면의 "강제 완료 처리"로 수동 처리 |
| 베트남 전자상거래·에스크로 법률 | 사전 검토 미완료 |
