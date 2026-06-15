/**
 * routes/accounts.ts — 계좌 CRUD 라우트
 *
 * 계좌는 가족이 보유한 은행 계좌를 나타낸다.
 * 카드의 결제 계좌로 연결되거나, 자동이체 정기지출의 출금 계좌로 사용된다.
 *
 * ★ 공통 CRUD 패턴 (accounts·cards·flows 모두 동일):
 *   - GET: family_id 필터 + deleted_at IS NULL (소프트 삭제 제외).
 *   - POST: family_id를 req에서 주입. reason_code는 항상 LIFE_EVENT (신규 등록).
 *   - PATCH: before_state 먼저 조회(lifecycle 기록용) → version+1로 UPDATE
 *            → rowCount 0이면 409 VERSION_CONFLICT (낙관적 잠금).
 *   - DELETE: 실제 row 삭제가 아닌 deleted_at 설정(소프트 삭제) + version+1.
 *             lifecycle_events의 TERMINATED 이벤트로 해지 기록.
 *
 * version 필드의 의미:
 *   모든 변경마다 version을 +1한다. 클라이언트가 If-Match로 보낸 값과
 *   DB의 현재 version이 일치해야만 UPDATE가 성공한다.
 *   불일치(다른 사람이 먼저 수정)이면 maybeSingle()이 null을 반환 → 409.
 *
 * before_state 수집 이유:
 *   PATCH/DELETE 전에 반드시 현재 row를 조회한다.
 *   → lifecycle_events.before_state에 변경 전 스냅샷을 저장.
 *   → 되돌리기(history.ts revert) 시 이 스냅샷으로 복구한다.
 *
 * extractLast4 (P10 마이데이터 매칭 대비):
 *   "****1234" 같은 마스킹 문자열에서 숫자만 추출해 뒤 4자리를 저장.
 *   향후 마이데이터 API가 반환하는 계좌 정보와 last4로 매칭할 수 있도록 준비.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent, type ReasonCode } from '../services/lifecycle.js';

const CreateBody = z.object({
  institution_name: z.string().min(1).max(60),
  account_type: z.enum(['CHECKING', 'SAVINGS', 'LOAN', 'OTHER']),
  nickname: z.string().min(1).max(60),
  account_number_masked: z.string().max(40).optional(),
  balance_krw: z.number().int().nonnegative().optional(),
  owner_user_id: z.string().uuid().optional().nullable(),
});

const UpdateBody = CreateBody.partial();

// P10: 마스킹 문자열에서 last4 자동 추출
// 마이데이터 연동 시 계좌를 매칭하기 위해 last4를 별도 컬럼에 저장한다.
function extractLast4(masked?: string): string | null {
  if (!masked) return null;
  const digits = masked.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/accounts', async (req) => {
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('family_id', req.familyId!)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data };
  });

  fastify.post('/api/accounts', async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const last4 = extractLast4(body.account_number_masked);
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert({
        ...body,
        // req.familyId는 tenantPlugin이 보장 — 직접 채우지 않으면 타 가족 데이터와 섞일 수 있다.
        family_id: req.familyId!,
        account_last4: last4,
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    // 신규 등록은 항상 LIFE_EVENT (배우자에게 알림)
    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'ACCOUNT',
      subject_id: data.id,
      event_type: 'CREATED',
      reason_code: 'LIFE_EVENT',
      actor_user_id: req.user!.id,
      after_state: data,
    }, data.owner_user_id);

    return data;
  });

  fastify.patch('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateBody.parse(req.body);
    const reason = req.headers['x-reason-code'] as ReasonCode;

    // before_state를 먼저 조회 → lifecycle 기록 + 되돌리기 복구에 필요
    const { data: before } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    // version+1을 patch에 포함 — 낙관적 잠금: UPDATE WHERE version=expectedVersion
    const patch: Record<string, unknown> = { ...body, version: before.version + 1, updated_at: new Date().toISOString() };
    // 계좌번호가 PATCH 대상에 포함된 경우에만 last4를 재계산한다.
    if ('account_number_masked' in body) {
      patch.account_last4 = extractLast4(body.account_number_masked);
    }

    const { data: after, error } = await supabaseAdmin
      .from('accounts')
      .update(patch)
      .eq('id', id)
      .eq('family_id', req.familyId!)
      // 낙관적 잠금: 클라이언트가 본 version과 DB version이 일치해야 UPDATE 성공
      .eq('version', req.expectedVersion!)
      .is('deleted_at', null)
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    // maybeSingle()이 null = version 불일치 → 누군가 먼저 수정했음
    if (!after) return reply.code(409).send({ error: 'VERSION_CONFLICT' });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'ACCOUNT',
      subject_id: id,
      event_type: 'UPDATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
      after_state: after,
    }, before.owner_user_id);

    return after;
  });

  fastify.delete('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const reason = req.headers['x-reason-code'] as ReasonCode;

    // 삭제 전 스냅샷 조회 — lifecycle TERMINATED 이벤트의 before_state로 사용
    const { data: before } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    // 소프트 삭제: deleted_at 설정 + version+1 (낙관적 잠금 동일 패턴)
    // 실제 row를 지우지 않는 이유: lifecycle_events의 subject_id 참조가 유효해야 하고,
    // 과거 정기지출과 연결된 이력을 추적할 수 있어야 한다.
    const { data: after, error } = await supabaseAdmin
      .from('accounts')
      .update({ deleted_at: new Date().toISOString(), version: before.version + 1 })
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .eq('version', req.expectedVersion!)
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!after) return reply.code(409).send({ error: 'VERSION_CONFLICT' });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'ACCOUNT',
      subject_id: id,
      event_type: 'TERMINATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
      // after_state 생략: 삭제 후 상태는 "없음"이므로 기록 불필요
    }, before.owner_user_id);

    return { ok: true };
  });
};
