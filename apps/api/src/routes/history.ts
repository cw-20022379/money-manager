/**
 * routes/history.ts — 변경 이력 조회 + 되돌리기(revert) 라우트
 *
 * 역할: lifecycle_events(append-only 감사 로그)를 조회하고, 되돌리기를 처리한다.
 *
 * ★ 되돌리기가 "보정 이벤트 append"인 이유:
 *   lifecycle_events는 RLS로 UPDATE/DELETE가 차단되어 있다 — 누가 언제 무엇을
 *   바꿨는지의 증거를 보존하기 위해. 따라서 "되돌리기"는 원본 이벤트를 지울 수 없고,
 *   대신 REVERTED 이벤트를 새로 append하는 방식을 취한다.
 *   이 패턴으로 "어떤 이벤트를 왜 되돌렸는가"도 이력으로 남는다.
 *
 * ★ before_state가 필요한 이유:
 *   되돌리기는 lifecycle_events.before_state에 저장된 스냅샷으로 엔티티를 복구한다.
 *   before_state가 없으면(null) 어떤 값으로 되돌려야 할지 알 수 없다.
 *   PATCH 시 before_state를 저장하는 이유가 바로 이 되돌리기 기능 때문이다.
 *
 * 되돌리기 제약:
 *   - event_type='UPDATED'만 지원 (v0.1.1). CREATED/TERMINATED는 v0.2.
 *     CREATED 되돌리기 = 삭제, TERMINATED 되돌리기 = 재활성화. 별도 로직 필요.
 *   - 7일 이내 이벤트만 허용. 오래된 이벤트를 되돌리면 그 사이 다른 변경과 충돌 위험.
 *
 * RLS 차단 우회:
 *   supabaseAdmin(service_role)을 사용하므로 lifecycle_events의 RLS를 우회한다.
 *   하지만 모든 쿼리에 .eq('family_id', req.familyId!)를 붙여 가족 격리는 유지.
 *
 * 복구 필드 선택 (id·version·created_at 등 제외):
 *   before_state의 모든 필드를 그대로 복구하되, 메타 필드는 현재 값을 유지한다.
 *   id를 되돌리면 row 자체가 바뀌고, version을 되돌리면 낙관적 잠금이 깨지므로 제외.
 */
import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent } from '../services/lifecycle.js';

// subject_kind → 실제 테이블명 매핑
const TABLE_BY_KIND: Record<string, string> = {
  ACCOUNT: 'accounts',
  CARD: 'cards',
  FLOW: 'payment_flows',
};

export const historyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/history', async (req) => {
    const q = req.query as { subject_kind?: string; subject_id?: string; actor?: string; limit?: string };

    let query = supabaseAdmin
      .from('lifecycle_events')
      .select('*')
      .eq('family_id', req.familyId!)
      .order('occurred_at', { ascending: false })
      .limit(Number(q.limit ?? 50));

    if (q.subject_kind) query = query.eq('subject_kind', q.subject_kind);
    if (q.subject_id) query = query.eq('subject_id', q.subject_id);
    if (q.actor) query = query.eq('actor_user_id', q.actor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { items: data };
  });

  /**
   * P2: 되돌리기 = 보정 이벤트 append.
   * lifecycle_events는 RLS UPDATE/DELETE 차단됨 → 새 REVERTED 이벤트 append +
   * 대상 엔티티(payment_flows/accounts/cards)는 before_state로 복구.
   *
   * v0.1.1 범위: event_type='UPDATED'만 지원. CREATED/TERMINATED는 v0.2.
   */
  fastify.post('/api/history/:id/revert', async (req, reply) => {
    const { id } = req.params as { id: string };
    const eventId = Number(id);
    if (!Number.isFinite(eventId)) return reply.code(400).send({ error: 'INVALID_ID' });

    // 대상 이벤트를 family_id로 격리하여 조회 (타 가족 이벤트 접근 방지)
    const { data: ev } = await supabaseAdmin
      .from('lifecycle_events')
      .select('*')
      .eq('id', eventId)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!ev) return reply.code(404).send({ error: 'NOT_FOUND' });

    // 7일 제한: 오래된 이벤트 되돌리기는 그 사이 생긴 다른 변경과 충돌 위험
    const ageMs = Date.now() - new Date(ev.occurred_at).getTime();
    if (ageMs > 7 * 24 * 3600_000) return reply.code(410).send({ error: 'TOO_OLD' });
    // UPDATED만 지원 — CREATED/TERMINATED 되돌리기는 별도 로직 필요 (v0.2)
    if (ev.event_type !== 'UPDATED') return reply.code(400).send({ error: 'ONLY_UPDATE_REVERTABLE' });
    // before_state가 없으면 어떤 값으로 복구할지 알 수 없음
    if (!ev.before_state) return reply.code(400).send({ error: 'NO_BEFORE_STATE' });

    const table = TABLE_BY_KIND[ev.subject_kind];
    if (!table) return reply.code(400).send({ error: 'UNKNOWN_SUBJECT_KIND' });

    // 대상의 현재 row 조회 (현재 version 확보)
    // 복구 후 REVERTED 이벤트의 before_state로도 사용
    const { data: current } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', ev.subject_id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!current) return reply.code(404).send({ error: 'SUBJECT_NOT_FOUND' });

    // before_state의 필드만 골라 복구 (id/version/created_at은 유지)
    // 메타 필드를 되돌리면 row 무결성이 깨지거나 낙관적 잠금이 오동작하므로 스킵
    const before = ev.before_state as Record<string, unknown>;
    const restore: Record<string, unknown> = {};
    for (const k of Object.keys(before)) {
      if (['id', 'family_id', 'version', 'created_at', 'updated_at', 'deleted_at'].includes(k)) continue;
      restore[k] = before[k];
    }
    // 복구 후 version도 증가 — 낙관적 잠금이 복구 행에도 작동하도록
    restore.version = current.version + 1;
    restore.updated_at = new Date().toISOString();

    const { data: restored, error: updErr } = await supabaseAdmin
      .from(table)
      .update(restore)
      .eq('id', ev.subject_id)
      .eq('family_id', req.familyId!)
      .select()
      .maybeSingle();
    if (updErr) return reply.code(500).send({ error: updErr.message });

    // REVERTED 이벤트를 append — 원본 이벤트는 삭제하지 않음 (append-only 원칙)
    // reason_code=CORRECTION: 되돌리기는 "실수 수정" 성격이므로 조용히 기록
    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: ev.subject_kind,
      subject_id: ev.subject_id,
      event_type: 'REVERTED',
      reason_code: 'CORRECTION',
      actor_user_id: req.user!.id,
      before_state: current,    // 되돌리기 직전 상태
      after_state: restored,     // 복구된 상태
      note: `event #${eventId} 되돌림`,
    }, current.owner_user_id);

    return { ok: true, restored };
  });
};
