-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ v0.1.1 패치 P1~P4, P9~P10                                     ║
-- ║ (P5~P8은 존재하지 않음 — 3 에이전트 R2 검토에서 기각/통합됨) ║
-- ║ 3 에이전트 R2 검토 합의 결과 (예상 합의도 ~89.7%)             ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- 각 패치 번호는 R2 검토 이슈 트래킹 번호와 대응한다.
-- P5~P8 구간은 검토 과정에서 기각되었거나 다른 패치로 통합된 제안들이라
-- 이 마이그레이션 파일에 SQL이 없다.

-- ───── P1: Co-view 측정 (memberships.last_seen_at) ──────────────
-- 목적: 배우자가 지금 앱을 보고 있는지 "동시 열람" 여부를 표시하기 위한 컬럼.
-- 동작: 프론트엔드가 /home 또는 주요 화면 진입 시 이 값을 now()로 갱신(UPSERT).
--       상대방 화면에서 last_seen_at이 최근 N분 이내이면 "○○가 지금 보고 있어요" 표시.
-- 인덱스: 가장 최근에 앱을 본 순서로 정렬하거나, 오래된 세션을 만료 처리할 때 사용.
ALTER TABLE memberships ADD COLUMN last_seen_at timestamptz;
CREATE INDEX ON memberships(last_seen_at);

-- ───── P2: 되돌리기 = 보정 이벤트 append (event_type 확장) ─────
-- 목적: "되돌리기(Revert)" 기능과 "카테고리 재분류(Reclassify)" 기능 추가를 위한
--       event_type ENUM 값 확장.
--
-- REVERTED:
--   직전 UPDATED 이벤트를 취소할 때 사용. 중요 설계 원칙:
--   원본 UPDATED 이벤트 행을 DELETE하지 않고 REVERTED 이벤트를 새로 INSERT한다.
--   → 변경 이력이 사라지지 않아 "누가 언제 바꿨다가 되돌렸는지"까지 추적 가능.
--   → lifecycle_events의 append-only 철학과 일관됨.
--
-- RECLASSIFIED:
--   금액·날짜 변경 없이 카테고리나 FlowKind만 바꿀 때 구분하는 이벤트 타입.
--   UPDATED와 달리 "분류 오류 수정"임을 명시해 변경 기록 화면에서 다른 배지로 표시.
ALTER TYPE event_type ADD VALUE 'REVERTED';
ALTER TYPE event_type ADD VALUE 'RECLASSIFIED';

-- ───── P3: uq_flow_dedup 제거 (서비스 레이어로 이동) ────────────
-- 목적: v0.1 설계 당시 "동일 가족의 동일 merchant + 동일 schedule_day 중복 방지"를 위해
--       DB UNIQUE 인덱스(uq_flow_dedup)를 추가할 계획이 있었으나,
--       R2 검토에서 "같은 날에 같은 상호의 결제가 두 건일 수 있다" (예: 두 자녀 학원비)는
--       반론이 받아들여져 DB 제약 대신 서비스 레이어 경고로 구현하기로 결정.
-- NO-OP: v0.1 마이그레이션에서 이 인덱스를 생성하지 않았으므로 실제로는 아무 변경 없음.
--        미래에 이 인덱스가 실수로 생성될 경우를 대비해 방어적으로 명시해 둠.
DROP INDEX IF EXISTS uq_flow_dedup;

-- ───── P4: If-Match 낙관적 락 (notification_rules.version) ──────
-- 목적: notification_rules 테이블에도 낙관적 락 컬럼 추가.
--       accounts/cards/payment_flows는 v0.1 init에서부터 version 컬럼이 있었으나
--       notification_rules는 누락되었다가 이 패치에서 추가.
-- 동작: PUT /api/notification-rules 요청 시 클라이언트가 If-Match: "version값" 헤더를 보내면
--       백엔드가 현재 DB version과 비교해 불일치 시 409 Conflict 반환.
--       두 기기에서 동시에 설정을 변경하는 경우 나중 요청이 충돌을 감지할 수 있다.
ALTER TABLE notification_rules ADD COLUMN version int NOT NULL DEFAULT 0;

-- ───── P9: invite_tokens 테이블 ─────────────────────────────────
-- 목적: 부부 합류(2번째 가족 구성원 초대) 기능 구현을 위한 토큰 테이블.
-- 흐름:
--   1. OWNER가 "초대 링크 생성" → invite_tokens에 row INSERT (token=랜덤 문자열)
--   2. OWNER가 링크를 배우자에게 카카오톡 등으로 전달
--   3. 배우자가 링크 클릭 → JoinFamilySchema 검증 → token 소비(used_at=now() 기록)
--   4. 배우자가 memberships에 INSERT되어 같은 family_id 소속이 됨
--
-- 7일 TTL (expires_at = now() + interval '7 days'):
--   링크를 생성하고 오래 방치해도 무한정 유효하지 않도록 제한.
--   7일은 "충분히 전달·사용할 시간"이라는 UX 판단. 만료 후 재생성 필요.
--
-- used_at (1회용):
--   null이면 아직 사용 안 됨. not null이면 이미 사용된 토큰 → 재사용 불가.
--   used_by_user_id: 실제로 합류한 사용자 ID (감사 목적 보존).
--
-- 부분 인덱스 WHERE used_at IS NULL:
--   "아직 유효한 토큰만" 빠르게 조회 (만료 체크, 중복 발급 방지).
--   사용 완료된 토큰은 인덱스에서 제외해 크기 최소화.
--
-- RLS: 초대자 또는 같은 가족이면 조회 가능. INSERT는 본인만, 자신의 가족 토큰만.
CREATE TABLE invite_tokens (
  token           text PRIMARY KEY,
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id),
  email_hint      text,       -- 초대할 상대방 이메일 힌트 (필수 아님, UI 표시용)
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at         timestamptz,            -- null=미사용, not null=1회 사용 완료
  used_by_user_id uuid REFERENCES auth.users(id),  -- 합류한 사용자 (감사 보존)
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON invite_tokens(family_id);
-- 유효한(미사용) 토큰만 부분 인덱스 — 만료·사용 완료 토큰은 조회 대상에서 제외
CREATE INDEX ON invite_tokens(expires_at) WHERE used_at IS NULL;

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
-- 초대자 본인 또는 같은 가족 구성원이 조회 가능 (초대 수락 전에는 inviter_user_id로 확인)
CREATE POLICY p_invite_read ON invite_tokens FOR SELECT
  USING (family_id = current_family_id() OR inviter_user_id = auth.uid());
-- 본인만, 본인 가족 토큰만 생성 가능 (타인의 가족 초대 링크 위조 방지)
CREATE POLICY p_invite_insert ON invite_tokens FOR INSERT
  WITH CHECK (inviter_user_id = auth.uid() AND family_id = current_family_id());

-- ───── P10: last4 컬럼 분리 (v0.3 마이데이터 매칭 보험) ──────────
-- 목적: v0.3에서 도입 예정인 마이데이터(은행·카드사 명세서) 연동에 대비한 선제적 컬럼 추가.
--
-- 배경:
--   마이데이터 명세서는 계좌/카드를 뒤 4자리(last4)로 식별한다.
--   현재 account_number_masked / card_number_masked에 "****-**-3344" 같은 전체 마스킹 문자열이
--   저장되어 있어, last4를 추출하려면 매번 파싱이 필요하다.
--   별도 컬럼으로 분리하면 명세서 매칭 시 단순 WHERE account_last4 = '3344' 쿼리로
--   조인 키 역할을 할 수 있어 연동 구현이 단순해진다.
--
-- 현재 상태 (v0.x):
--   컬럼만 추가하고 기존 masked 값에서 last4를 추출해 채우는 backfill은 아직 없다.
--   UI에서 노출되지 않고 마이데이터 연동 코드도 없다 — 순수하게 v0.3 준비용 컬럼.
--   인덱스는 마이데이터 명세서 매칭 쿼리 (family_id + last4)를 위해 선제적으로 생성.
ALTER TABLE accounts ADD COLUMN account_last4 char(4);
ALTER TABLE cards    ADD COLUMN card_last4    char(4);
-- 마이데이터 매칭 쿼리: SELECT * FROM accounts WHERE family_id=? AND account_last4='3344'
CREATE INDEX ON accounts(family_id, account_last4) WHERE account_last4 IS NOT NULL;
CREATE INDEX ON cards(family_id, card_last4)       WHERE card_last4 IS NOT NULL;
