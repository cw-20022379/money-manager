-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ Family Finance Navigator — v0.1 Init                          ║
-- ║ 5 도메인 + 2 부속 테이블, family_id 격리 RLS                  ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- 설계 원칙 요약:
--   1. 멀티테넌트: 모든 도메인 테이블에 family_id를 두고 RLS로 가족 간 격리.
--      "우리 가족만 보인다"는 보장을 DB 레벨에서 제공해 앱 레이어 실수 여지를 없앤다.
--   2. Soft-delete: 계좌·카드·정기지출은 deleted_at 컬럼으로 논리 삭제.
--      물리 삭제 시 lifecycle_events와의 참조가 끊기므로 감사 로그 보존을 위해 논리 삭제.
--   3. Optimistic locking: version 컬럼 + If-Match 헤더로 동시 편집 충돌 방지.
--   4. Append-only audit: lifecycle_events는 INSERT/SELECT만 허용. 수정·삭제 불가.

-- ───── EXTENSIONS ──────────────────────────────────────────────────
-- gen_random_uuid()를 위해 pgcrypto 필요 (Postgres 13 이상은 gen_random_uuid() 내장이지만,
-- Supabase 환경 호환성을 위해 명시적으로 활성화)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───── ENUM ────────────────────────────────────────────────────────
-- Postgres ENUM은 문자열보다 저장 효율이 좋고 CHECK 제약보다 JOIN 성능이 낫다.
-- TypeScript types.ts의 동명 타입과 1:1 대응 — 둘 중 하나 변경 시 반드시 양쪽 동기화.
CREATE TYPE account_type AS ENUM ('CHECKING','SAVINGS','LOAN','OTHER');
CREATE TYPE card_type    AS ENUM ('CREDIT','CHECK','OTHER');
CREATE TYPE flow_kind    AS ENUM (
  'CARD_RECURRING','BANK_AUTO_TRANSFER','CARD_BILL_PAYMENT','OTHER'
);
CREATE TYPE flow_status  AS ENUM ('ACTIVE','PAUSED','TERMINATED');
-- REVERTED, RECLASSIFIED는 v0.1.1 P2 패치(0002 마이그레이션)에서 추가됨
CREATE TYPE event_type   AS ENUM ('CREATED','UPDATED','TERMINATED','NOTE');
CREATE TYPE reason_code  AS ENUM ('LIFE_EVENT','CORRECTION');
CREATE TYPE category     AS ENUM (
  'UTILITY','TELECOM','INSURANCE','MEDIA','SAAS','EDUCATION',
  'LOAN','CARD_BILL','RENT','HEALTHCARE','OTHER'
);

-- ───── FAMILIES ────────────────────────────────────────────────────
-- 가족 그룹의 최상위 테넌트 단위.
-- 현재 한 사용자는 한 가족에만 속할 수 있다 (memberships PK=user_id 참조).
-- 다중 가족 지원은 v0.3 이후 과제.
CREATE TABLE families (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───── MEMBERSHIPS ──────────────────────────────────────────────────
-- 사용자↔가족 소속 관계 테이블.
--
-- PK = user_id (단일 컬럼) 를 선택한 이유:
--   한 사람이 여러 가족에 동시에 속하는 시나리오를 현재 지원하지 않는다.
--   (user_id, family_id) 복합 PK로 두면 "한 사용자는 한 가족" 제약을
--   DB 레벨에서 강제할 수 없어, 앱 실수 시 중복 소속이 생길 수 있다.
--   user_id 단일 PK로 하면 UNIQUE 제약이 자동으로 "한 사용자=한 가족"을 보장한다.
--   → v0.3에서 다중 가족을 지원할 때는 복합 PK로 변경 필요.
--
-- role: OWNER(가족 생성자, 내보내기 권한) / MEMBER(일반 구성원).
--   현재 OWNER 권한 체크는 앱 레이어에서 수행. v0.x는 두 역할 간 DB 레벨 분기 없음.
--
-- last_seen_at: Co-view 측정 컬럼 (v0.1.1 P1 패치로 추가).
--   프론트가 /home 진입 시 갱신. "지금 배우자도 앱 보고 있나?" 실시간 표시 용도.
CREATE TABLE memberships (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role         text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','MEMBER')),
  joined_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON memberships(family_id);

-- ───── ACCOUNTS ────────────────────────────────────────────────────
-- 가족의 은행 계좌.
--
-- owner_user_id (soft ownership):
--   "이 계좌는 누가 주로 관리/부담하는가"를 나타내는 라벨.
--   null = 공동 계좌. 접근 제어와 무관 — 가족 전원이 family_id RLS 기반으로 조회 가능.
--   분담 집계·알림 귀속 계산에만 사용한다.
--
-- account_number_masked:
--   계좌번호 전체가 아니라 마스킹된 형태(예: "****-**-3344")만 저장.
--   실제 계좌 인증용이 아니라 "내 월급 계좌 맞나?" 확인용 UI 표시 목적.
--
-- version:
--   낙관적 락(Optimistic Locking) 카운터. PUT 요청 시 If-Match 헤더와 비교해
--   동시에 두 기기에서 편집하더라도 하나의 변경만 성공하도록 한다.
--
-- deleted_at:
--   논리 삭제 타임스탬프. 물리 삭제 시 lifecycle_events.subject_id FK가 끊기므로
--   감사 로그 보존을 위해 논리 삭제 방식 채택.
--   인덱스에 WHERE deleted_at IS NULL 조건으로 활성 계좌만 빠르게 조회.
CREATE TABLE accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  institution_name      text NOT NULL,
  account_type          account_type NOT NULL,
  nickname              text NOT NULL,
  account_number_masked text,
  owner_user_id         uuid REFERENCES auth.users(id),  -- soft ownership 라벨, null=공동
  balance_krw           bigint,
  opened_on             date,
  closed_on             date,
  version               int NOT NULL DEFAULT 0,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_on IS NULL OR closed_on >= opened_on)
);
-- 부분 인덱스: 삭제된 계좌는 일반 조회에서 제외하여 인덱스 크기와 스캔 범위를 최소화
CREATE INDEX ON accounts(family_id) WHERE deleted_at IS NULL;

-- ───── CARDS ───────────────────────────────────────────────────────
-- 가족의 신용카드·체크카드.
--
-- owner_user_id: accounts와 동일한 soft ownership 개념.
--
-- billing_cycle_start_day / billing_cycle_end_day:
--   카드 이용 기간의 시작·종료 일자 (예: 전달 15일 ~ 당월 14일).
--   "이번 달 카드로 긁은 금액"을 집계할 때 사용.
--
-- payment_due_day:
--   카드 대금이 통장에서 실제로 빠져나가는 날짜.
--   schedule_day(긁는 날)와 구별: 이용일≠결제일 혼동을 방지하기 위해 분리.
--
-- payment_due_month_offset:
--   결제가 몇 달 뒤에 빠지는가. 기본값 1 = 익월 결제.
--   (일부 카드는 당월 결제이므로 0도 가능)
--
-- billing_account_id:
--   카드 대금이 빠져나가는 연결 계좌. accounts 테이블 FK.
--   관계도 그래프에서 "계좌 → 카드 → 정기지출" 트리 구조를 그리는 핵심 연결고리.
CREATE TABLE cards (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  issuer_name              text NOT NULL,
  card_type                card_type NOT NULL,
  product_name             text NOT NULL,
  card_number_masked       text,
  owner_user_id            uuid REFERENCES auth.users(id),  -- soft ownership 라벨, null=공동
  billing_account_id       uuid REFERENCES accounts(id),
  billing_cycle_start_day  smallint CHECK (billing_cycle_start_day BETWEEN 1 AND 31),
  billing_cycle_end_day    smallint CHECK (billing_cycle_end_day   BETWEEN 1 AND 31),
  payment_due_day          smallint CHECK (payment_due_day         BETWEEN 1 AND 31),
  payment_due_month_offset smallint NOT NULL DEFAULT 1,
  issued_on                date,
  terminated_on            date,
  version                  int NOT NULL DEFAULT 0,
  deleted_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (terminated_on IS NULL OR terminated_on >= issued_on)
);
CREATE INDEX ON cards(family_id) WHERE deleted_at IS NULL;
CREATE INDEX ON cards(billing_account_id);

-- ───── PAYMENT_FLOWS (정기지출, account/card XOR) ───────────────
-- 가족의 월별 고정지출 항목. 이 PWA의 핵심 데이터 모델.
--
-- source_account_id / source_card_id XOR 제약:
--   정기지출의 출처는 "계좌 자동이체" 또는 "카드 자동결제" 중 하나여야 한다.
--   둘 다 null이면 현금흐름 추적이 불가능하고, 둘 다 있으면 이중 계산 위험.
--   CHECK ((account IS NOT NULL)::int + (card IS NOT NULL)::int = 1) 으로 DB 레벨 강제.
--   동일 규칙이 Zod 스키마(CreateFlowSchema)에서도 .refine()으로 검증됨 — 서버 왕복 절감.
--
-- owner_user_id: accounts/cards와 동일한 soft ownership. null = 공동 부담.
--   분담 집계 화면에서 "남편 부담 합계 / 아내 부담 합계 / 공동 합계"를 계산할 때 사용.
--
-- amount_is_variable:
--   true이면 amount_krw가 반드시 null이어야 한다 (CHECK 제약).
--   공과금처럼 매달 청구금액이 다른 항목을 표현. 현금흐름 캘린더에서는 "변동"으로 표시.
--
-- schedule_day:
--   매월 결제 예정일 (1~31). 29~31일의 경우 해당 월에 그 날이 없으면 백엔드가 말일 clamp.
--   next_due_on은 이 값 기반으로 서버가 계산해 저장. 현금흐름 캘린더 셀 배치에 사용.
--
-- is_draft:
--   true = 아직 작성 중인 임시 항목. 홈 화면 DraftResumeModal에서 이어쓰기 유도.
--   집계·알림 계산에서 제외.
--
-- version: accounts/cards와 동일한 낙관적 락 카운터.
CREATE TABLE payment_flows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  flow_kind           flow_kind NOT NULL,
  status              flow_status NOT NULL DEFAULT 'ACTIVE',
  merchant_name       text NOT NULL,
  category            category NOT NULL,
  source_account_id   uuid REFERENCES accounts(id),
  source_card_id      uuid REFERENCES cards(id),
  amount_krw          bigint,
  amount_is_variable  boolean NOT NULL DEFAULT false,
  schedule_freq       text NOT NULL DEFAULT 'MONTHLY',
  schedule_day        smallint NOT NULL,
  next_due_on         date,
  started_on          date NOT NULL DEFAULT CURRENT_DATE,
  terminated_on       date,
  owner_user_id       uuid REFERENCES auth.users(id),  -- soft ownership, null=공동 부담
  notes               text,
  is_draft            boolean NOT NULL DEFAULT false,
  version             int NOT NULL DEFAULT 0,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- XOR: 출처가 계좌와 카드 중 정확히 하나여야 한다
  CHECK ((source_account_id IS NOT NULL)::int + (source_card_id IS NOT NULL)::int = 1),
  -- 변동 지출이면 금액 없음, 고정 지출이면 양수 금액 필수
  CHECK ((amount_is_variable AND amount_krw IS NULL) OR
         (NOT amount_is_variable AND amount_krw IS NOT NULL AND amount_krw > 0))
);
-- (family_id, status) 복합 인덱스: 가족별 활성 정기지출 목록 조회 (가장 빈번한 쿼리)
CREATE INDEX ON payment_flows(family_id, status) WHERE deleted_at IS NULL;
-- next_due_on 인덱스: 알림 스케줄러가 "오늘 결제 예정" 항목을 빠르게 찾기 위함
CREATE INDEX ON payment_flows(next_due_on) WHERE status='ACTIVE';

-- ───── LIFECYCLE_EVENTS (불변 변경 기록) ───────────────────────
-- 계좌·카드·정기지출의 모든 변경을 기록하는 append-only 감사 로그.
--
-- 설계 의도:
--   변경을 "덮어쓰기"가 아니라 "이벤트 append"로 기록해, 어느 시점에 어떻게 바뀌었는지
--   전체 이력을 보존한다. 부부 중 한 명이 금액을 몰래 바꿔도 이력이 남는다.
--
-- append-only 보장:
--   RLS에 SELECT + INSERT 정책만 있고 UPDATE/DELETE 정책이 없다 (아래 RLS 섹션 참조).
--   Postgres RLS는 정책이 없는 작업을 기본 거부(default-deny)하므로
--   UPDATE/DELETE는 서버 사이드라 해도 불가 → 변경 증거 삭제 불가.
--
-- REVERTED 이벤트:
--   "되돌리기" 시 원본 UPDATED 이벤트를 삭제하지 않는다.
--   대신 별도 REVERTED 이벤트를 append해 "원래 50,000이었다가 17,000으로 되돌아갔다"는
--   맥락 전체를 이력에서 추적할 수 있다.
--
-- before_state / after_state:
--   변경 전후의 레코드 스냅샷을 jsonb로 저장. UI에서 diff(이전→이후) 표시에 사용.
--
-- notify_spouse:
--   true이면 (LIFE_EVENT reason_code일 때) 배우자에게 Realtime 토스트 + Web Push 발송.
--
-- subject_kind + subject_id:
--   어떤 도메인 객체가 변경됐는지 식별. FK 대신 (kind, id) 조합을 쓴 이유:
--   세 테이블(ACCOUNT/CARD/FLOW)을 단일 테이블로 통합 관리하기 위함.
--   bigserial PK: 시간순 정렬을 위해 자동 증가 정수 사용 (uuid보다 정렬 비용 낮음).
CREATE TABLE lifecycle_events (
  id            bigserial PRIMARY KEY,
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_kind  text NOT NULL CHECK (subject_kind IN ('ACCOUNT','CARD','FLOW')),
  subject_id    uuid NOT NULL,
  event_type    event_type NOT NULL,
  reason_code   reason_code NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  before_state  jsonb,  -- 변경 전 레코드 스냅샷 (diff 표시용)
  after_state   jsonb,  -- 변경 후 레코드 스냅샷
  note          text,
  notify_spouse boolean NOT NULL DEFAULT false,  -- LIFE_EVENT 시 배우자 알림 트리거
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
-- (family_id, occurred_at DESC): 가족별 최신 변경 기록 목록 조회 (변경 기록 화면)
CREATE INDEX ON lifecycle_events(family_id, occurred_at DESC);
-- (subject_kind, subject_id): 특정 계좌/카드/정기지출의 변경 이력 조회
CREATE INDEX ON lifecycle_events(subject_kind, subject_id);

-- ───── NOTIFICATION_RULES ────────────────────────────────────────
-- 사용자별 푸시 알림 설정.
-- PK = user_id: 한 사용자에게 하나의 설정만 존재 (UPSERT 방식 관리).
--
-- threshold_krw: 이 금액 이상의 변경만 알림 발송 (소액 변경 알림 피로 방지).
-- quiet_start_hour / quiet_end_hour: 방해금지 시간대 (예: 22시~08시).
-- categories_off: 알림을 끈 카테고리 목록 (jsonb 배열, 예: ["MEDIA","SAAS"]).
-- digest_mode: true이면 개별 알림 대신 일괄 요약 알림.
CREATE TABLE notification_rules (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  threshold_krw    bigint NOT NULL DEFAULT 50000,
  quiet_start_hour smallint NOT NULL DEFAULT 22,
  quiet_end_hour   smallint NOT NULL DEFAULT 8,
  categories_off   jsonb NOT NULL DEFAULT '[]'::jsonb,
  digest_mode      boolean NOT NULL DEFAULT true
);

-- ───── PUSH_SUBSCRIPTIONS (Web Push VAPID) ──────────────────────
-- 사용자 기기의 Web Push 구독 정보.
-- 한 사용자가 여러 기기에서 앱을 쓸 수 있어 user_id가 PK가 아닌 FK.
-- endpoint UNIQUE: 동일 브라우저의 중복 구독 등록 방지.
-- 잘못된 endpoint(만료·삭제된 기기)로 발송 시도 시 410/404 응답을 받으면
-- 백엔드가 자동으로 해당 row를 삭제 (test_b.py 시나리오에서 검증).
CREATE TABLE push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth_key   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint)
);
CREATE INDEX ON push_subscriptions(user_id);

-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ ROW LEVEL SECURITY                                            ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- 기본 원칙:
--   모든 도메인 테이블에 RLS를 활성화해 Supabase anon/authenticated role 모두
--   정책이 없는 행에는 접근 불가(default-deny).
--   서버 사이드(apps/api)는 service_role key로 RLS bypass 가능하지만,
--   클라이언트(apps/web)는 반드시 정책 범위 내에서만 접근.

-- Helper: 현재 사용자의 family_id를 조회하는 함수.
--   SECURITY DEFINER: 호출자 권한이 아닌 정의자(postgres) 권한으로 실행.
--   STABLE: 같은 트랜잭션 내에서 결과가 변하지 않음 → Postgres가 캐시해 RLS 평가 비용 감소.
--   search_path = public 고정: 보안 우회(search_path 주입) 방지.
CREATE OR REPLACE FUNCTION public.current_family_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM memberships WHERE user_id = auth.uid();
$$;

-- families: 본인이 속한 가족만 조회 가능. 신규 가족 생성은 모든 인증 사용자 허용.
--   (생성 직후 memberships에 행을 추가해야 가족이 격리되므로 INSERT 자체는 열어 두고,
--    memberships가 실질적인 격리 게이트 역할을 한다)
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_families_read ON families FOR SELECT
  USING (id = current_family_id());
CREATE POLICY p_families_insert ON families FOR INSERT
  WITH CHECK (true);  -- 신규 가족 생성은 누구나, memberships가 격리

-- memberships: 본인 소속 가족 구성원 조회 가능 (OR user_id=self는 가입 직후 자신을 볼 수 있게).
--   INSERT는 본인 user_id로만 가능 → 타인을 대신 가입시킬 수 없다.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_memberships_read ON memberships FOR SELECT
  USING (family_id = current_family_id() OR user_id = auth.uid());
CREATE POLICY p_memberships_insert ON memberships FOR INSERT
  WITH CHECK (user_id = auth.uid());  -- 본인 가입만

-- accounts / cards / payment_flows:
--   같은 family_id인 경우에만 SELECT/INSERT/UPDATE/DELETE 가능.
--   owner_user_id는 접근 제어와 무관 — 가족 전원이 서로의 계좌·카드를 볼 수 있다.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_accounts ON accounts
  USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_cards ON cards
  USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

ALTER TABLE payment_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_flows ON payment_flows
  USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

-- lifecycle_events: SELECT + INSERT만 허용 (UPDATE/DELETE 정책 없음 = 차단).
--   의도: append-only 감사 로그이므로 한번 기록된 이벤트는 수정·삭제 불가.
--   Postgres RLS default-deny 원칙에 따라 정책이 없는 UPDATE/DELETE는 자동으로 거부된다.
--   INSERT WITH CHECK: actor_user_id=자신이어야 한다 (타인 행위를 대리 기록 불가).
ALTER TABLE lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_le_read ON lifecycle_events FOR SELECT
  USING (family_id = current_family_id());
CREATE POLICY p_le_insert ON lifecycle_events FOR INSERT
  WITH CHECK (family_id = current_family_id() AND actor_user_id = auth.uid());

-- notification_rules / push_subscriptions: 본인 데이터만 접근 가능.
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_nrules ON notification_rules
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_push ON push_subscriptions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ───── REALTIME PUBLICATION ─────────────────────────────────────
-- Supabase Realtime 채널에 추가할 테이블 목록.
--
-- 선택 이유:
--   - lifecycle_events: 배우자가 정기지출을 변경하면 LIFE_EVENT notify_spouse=true인 경우
--                       상대방 화면에 토스트가 뜨도록 Realtime INSERT 이벤트를 구독.
--   - payment_flows   : 배우자가 추가·수정하면 목록이 실시간 갱신.
--   - accounts / cards: 배우자가 계좌·카드를 등록하면 관계도(react-flow)가 자동 업데이트.
--
-- 제외 이유 (memberships, notification_rules, push_subscriptions):
--   실시간 갱신이 필요한 협업 시나리오가 없거나, 개인 데이터라 실시간 브로드캐스트가 불필요.
ALTER PUBLICATION supabase_realtime ADD TABLE lifecycle_events;
ALTER PUBLICATION supabase_realtime ADD TABLE payment_flows;
ALTER PUBLICATION supabase_realtime ADD TABLE accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE cards;
