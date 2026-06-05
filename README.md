# 우리 가족 금융 내비게이터 (Family Finance Navigator)

부부 공동 가족 금융관리 PWA. 토이 프로젝트 — Node.js + React + Supabase Free.

## 요구사항
- Node 20+
- pnpm 10+
- Docker 데몬 동작중
- Supabase CLI (`brew install supabase/tap/supabase`)

## 폴더 구조
```
.
├── apps/
│   ├── api/        Fastify API (Node 20)
│   └── web/        React PWA (Vite)
├── packages/
│   └── shared/     Zod 스키마·타입 공유
└── supabase/
    ├── migrations/ 0001_init.sql + 0002_v0_1_1_patches.sql
    └── seed.sql    테스트 가족 1개 + 부부 2명
```

## 최초 1회 셋업
```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 (Supabase 시작 후 출력되는 anon_key를 .env에 복사)
cp .env.example .env

# 3. Supabase 로컬 스택 시작 (첫 실행은 Docker 이미지 풀로 3~5분)
pnpm db:start

# 4. anon_key를 .env에 복사
pnpm db:status   # ⬅ 여기서 출력되는 anon_key를 .env의 SUPABASE_ANON_KEY와 VITE_SUPABASE_ANON_KEY에 붙여넣기

# 5. (선택) Web Push VAPID 키 생성
cd apps/api && pnpm exec web-push generate-vapid-keys --json
# 출력된 publicKey/privateKey를 .env의 VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY에 복사
```

## 일상 명령
```bash
pnpm db:start    # Supabase Docker 스택 시작
pnpm dev         # api(:3000) + web(:5173) 병렬 실행
pnpm db:studio   # Supabase Studio (테이블 시각화) 열기
pnpm db:reset    # DB 초기화 + 마이그레이션 재적용 + seed
pnpm db:stop     # Supabase 중지
```

## 접속 주소 (로컬)
| 서비스 | URL |
|---|---|
| Web (PWA) | http://127.0.0.1:5173 |
| API | http://127.0.0.1:3000 |
| API healthz | http://127.0.0.1:3000/healthz |
| Supabase Studio | http://127.0.0.1:54323 |
| Supabase Auth | http://127.0.0.1:54321 |
| Inbucket (가짜 메일) | http://127.0.0.1:54324 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

## 검증 시나리오 (=진행 결정 근거)
1. 두 브라우저 탭에서 부부 시뮬레이션 로그인 → 가족 격리(RLS) 확인
2. 한쪽 정기지출 등록 → 다른쪽 실시간 표시 (Realtime)
3. 한쪽 수정 → 다른쪽 Web Push 알림
4. 동시 수정 시도 → If-Match 409 토스트
5. PWA 설치 (홈 화면 추가)
6. 오프라인 토글 → SW 캐시 동작
7. Studio에서 `lifecycle_events` append-only 확인
8. 7일 되돌리기 (P2 보정 이벤트)

## 설계 문서
- PRD: `/Users/jdy/Downloads/NAVERWORKS/family_finance_navigator_prd.md`
- 통합 설계 v0.1 + v0.1.1 패치 노트: `/Users/jdy/Downloads/NAVERWORKS/family_finance_navigator_design_v1.md`
- 라이브 대시보드: http://127.0.0.1:59494/
