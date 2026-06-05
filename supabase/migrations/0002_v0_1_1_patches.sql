-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ v0.1.1 패치 P1~P10                                            ║
-- ║ 3 에이전트 R2 검토 합의 결과 (예상 합의도 ~89.7%)             ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- ───── P1: Co-view 측정 (memberships.last_seen_at) ──────────
ALTER TABLE memberships ADD COLUMN last_seen_at timestamptz;
CREATE INDEX ON memberships(last_seen_at);

-- ───── P2: 되돌리기 = 보정 이벤트 append (event_type 확장) ──
ALTER TYPE event_type ADD VALUE 'REVERTED';
ALTER TYPE event_type ADD VALUE 'RECLASSIFIED';

-- ───── P3: uq_flow_dedup 제거 (서비스 레이어로 이동) ────────
-- (v0.1에서 만들지 않았으므로 NO-OP, 미래 호환을 위해 명시)
DROP INDEX IF EXISTS uq_flow_dedup;

-- ───── P4: If-Match 낙관적 락 (notification_rules.version) ──
ALTER TABLE notification_rules ADD COLUMN version int NOT NULL DEFAULT 0;

-- ───── P9: invite_tokens 테이블 ─────────────────────────────
CREATE TABLE invite_tokens (
  token           text PRIMARY KEY,
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id),
  email_hint      text,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at         timestamptz,
  used_by_user_id uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON invite_tokens(family_id);
CREATE INDEX ON invite_tokens(expires_at) WHERE used_at IS NULL;

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_invite_read ON invite_tokens FOR SELECT
  USING (family_id = current_family_id() OR inviter_user_id = auth.uid());
CREATE POLICY p_invite_insert ON invite_tokens FOR INSERT
  WITH CHECK (inviter_user_id = auth.uid() AND family_id = current_family_id());

-- ───── P10: last4 컬럼 분리 (v0.3 마이데이터 매칭 보험) ─────
ALTER TABLE accounts ADD COLUMN account_last4 char(4);
ALTER TABLE cards    ADD COLUMN card_last4    char(4);
CREATE INDEX ON accounts(family_id, account_last4) WHERE account_last4 IS NOT NULL;
CREATE INDEX ON cards(family_id, card_last4)       WHERE card_last4 IS NOT NULL;
