-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ Family Finance Navigator — v0.1 Init                          ║
-- ║ 5 도메인 + 2 부속 테이블, family_id 격리 RLS                  ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- ───── EXTENSIONS ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───── ENUM ────────────────────────────────────────────────────────
CREATE TYPE account_type AS ENUM ('CHECKING','SAVINGS','LOAN','OTHER');
CREATE TYPE card_type    AS ENUM ('CREDIT','CHECK','OTHER');
CREATE TYPE flow_kind    AS ENUM (
  'CARD_RECURRING','BANK_AUTO_TRANSFER','CARD_BILL_PAYMENT','OTHER'
);
CREATE TYPE flow_status  AS ENUM ('ACTIVE','PAUSED','TERMINATED');
CREATE TYPE event_type   AS ENUM ('CREATED','UPDATED','TERMINATED','NOTE');
CREATE TYPE reason_code  AS ENUM ('LIFE_EVENT','CORRECTION');
CREATE TYPE category     AS ENUM (
  'UTILITY','TELECOM','INSURANCE','MEDIA','SAAS','EDUCATION',
  'LOAN','CARD_BILL','RENT','HEALTHCARE','OTHER'
);

-- ───── FAMILIES ────────────────────────────────────────────────────
CREATE TABLE families (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role         text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','MEMBER')),
  joined_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON memberships(family_id);

-- ───── ACCOUNTS ────────────────────────────────────────────────────
CREATE TABLE accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  institution_name      text NOT NULL,
  account_type          account_type NOT NULL,
  nickname              text NOT NULL,
  account_number_masked text,
  owner_user_id         uuid REFERENCES auth.users(id),
  balance_krw           bigint,
  opened_on             date,
  closed_on             date,
  version               int NOT NULL DEFAULT 0,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_on IS NULL OR closed_on >= opened_on)
);
CREATE INDEX ON accounts(family_id) WHERE deleted_at IS NULL;

-- ───── CARDS ───────────────────────────────────────────────────────
CREATE TABLE cards (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  issuer_name              text NOT NULL,
  card_type                card_type NOT NULL,
  product_name             text NOT NULL,
  card_number_masked       text,
  owner_user_id            uuid REFERENCES auth.users(id),
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
  owner_user_id       uuid REFERENCES auth.users(id),
  notes               text,
  is_draft            boolean NOT NULL DEFAULT false,
  version             int NOT NULL DEFAULT 0,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_account_id IS NOT NULL)::int + (source_card_id IS NOT NULL)::int = 1),
  CHECK ((amount_is_variable AND amount_krw IS NULL) OR
         (NOT amount_is_variable AND amount_krw IS NOT NULL AND amount_krw > 0))
);
CREATE INDEX ON payment_flows(family_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON payment_flows(next_due_on) WHERE status='ACTIVE';

-- ───── LIFECYCLE_EVENTS (불변 변경 기록) ───────────────────────
CREATE TABLE lifecycle_events (
  id            bigserial PRIMARY KEY,
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_kind  text NOT NULL CHECK (subject_kind IN ('ACCOUNT','CARD','FLOW')),
  subject_id    uuid NOT NULL,
  event_type    event_type NOT NULL,
  reason_code   reason_code NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  before_state  jsonb,
  after_state   jsonb,
  note          text,
  notify_spouse boolean NOT NULL DEFAULT false,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON lifecycle_events(family_id, occurred_at DESC);
CREATE INDEX ON lifecycle_events(subject_kind, subject_id);

-- ───── NOTIFICATION_RULES ────────────────────────────────────────
CREATE TABLE notification_rules (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  threshold_krw    bigint NOT NULL DEFAULT 50000,
  quiet_start_hour smallint NOT NULL DEFAULT 22,
  quiet_end_hour   smallint NOT NULL DEFAULT 8,
  categories_off   jsonb NOT NULL DEFAULT '[]'::jsonb,
  digest_mode      boolean NOT NULL DEFAULT true
);

-- ───── PUSH_SUBSCRIPTIONS (Web Push VAPID) ──────────────────────
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

-- Helper: 현재 사용자의 family_id
CREATE OR REPLACE FUNCTION public.current_family_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM memberships WHERE user_id = auth.uid();
$$;

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_families_read ON families FOR SELECT
  USING (id = current_family_id());
CREATE POLICY p_families_insert ON families FOR INSERT
  WITH CHECK (true);  -- 신규 가족 생성은 누구나, memberships가 격리

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_memberships_read ON memberships FOR SELECT
  USING (family_id = current_family_id() OR user_id = auth.uid());
CREATE POLICY p_memberships_insert ON memberships FOR INSERT
  WITH CHECK (user_id = auth.uid());  -- 본인 가입만

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

-- lifecycle_events: SELECT + INSERT만 허용 (UPDATE/DELETE 정책 없음 = 차단)
ALTER TABLE lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_le_read ON lifecycle_events FOR SELECT
  USING (family_id = current_family_id());
CREATE POLICY p_le_insert ON lifecycle_events FOR INSERT
  WITH CHECK (family_id = current_family_id() AND actor_user_id = auth.uid());

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_nrules ON notification_rules
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_push ON push_subscriptions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ───── REALTIME PUBLICATION ─────────────────────────────────────
-- 부부 알림을 위해 lifecycle_events / payment_flows / accounts / cards 변경 브로드캐스트
ALTER PUBLICATION supabase_realtime ADD TABLE lifecycle_events;
ALTER PUBLICATION supabase_realtime ADD TABLE payment_flows;
ALTER PUBLICATION supabase_realtime ADD TABLE accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE cards;
