/**
 * routes/flows.ts — 정기지출(payment_flows) CRUD 라우트
 *
 * 정기지출은 이 앱의 핵심 도메인 — 넷플릭스·통신비·보험·학원비 등
 * 매달 반복되는 지출을 관리한다.
 *
 * ★ source XOR 제약 (source_account_id vs source_card_id):
 *   정기지출은 반드시 계좌(자동이체) 또는 카드(카드 결제) 중 하나로만 나가야 한다.
 *   둘 다 지정하거나 둘 다 null이면 graph 트리 구성이 불가능하다.
 *   Zod .refine()으로 서비스 레이어에서 강제 (DB unique 제약 대신 앱 레이어 검증).
 *   DB unique를 쓰지 않는 이유: 복합 nullable 제약은 DB마다 동작이 다르고,
 *   사람이 읽기 좋은 에러 메시지를 내보내기도 어렵다.
 *
 * is_draft:
 *   아직 금액이나 날짜를 확정하지 못한 항목을 임시 저장하는 용도.
 *   draft는 monthly_sum 집계와 upcoming 계산에서 제외된다 (graph.ts 참고).
 *
 * schedule_day:
 *   카드 결제는 "카드 긁히는 날", 자동이체는 "통장에서 빠지는 날".
 *   카드의 실제 출금일(payment_due_day)과 별개 개념임에 주의.
 *
 * /api/flows/similar (P3 중복 등록 방지 가드):
 *   DB unique 제약을 걸지 않고 서비스 레이어에서 "비슷한 항목" 경고만 준다.
 *   이유: 같은 머천트라도 정상적으로 복수 등록하는 경우가 있음
 *         (예: 부부 각자 명의의 넷플릭스).
 *   클라이언트는 이 결과를 받아 "이미 있는 것 같아요" UI를 보여주되, 차단은 안 한다.
 *
 * DELETE 처리:
 *   accounts/cards의 deleted_at만 세팅하는 것과 달리
 *   status='TERMINATED' + terminated_on 날짜도 함께 기록한다.
 *   정기지출은 "언제 해지했는가"가 재무 기록상 의미 있기 때문.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent, type ReasonCode } from '../services/lifecycle.js';

const CreateBody = z
  .object({
    flow_kind: z.enum(['CARD_RECURRING', 'BANK_AUTO_TRANSFER', 'CARD_BILL_PAYMENT', 'OTHER']),
    merchant_name: z.string().min(1).max(60),
    category: z.enum([
      'UTILITY','TELECOM','INSURANCE','MEDIA','SAAS','EDUCATION',
      'LOAN','CARD_BILL','RENT','HEALTHCARE','OTHER',
    ]),
    // source_account_id XOR source_card_id — 둘 중 정확히 하나만 지정
    source_account_id: z.string().uuid().nullable().optional(),
    source_card_id: z.string().uuid().nullable().optional(),
    amount_krw: z.number().int().positive().nullable().optional(),
    amount_is_variable: z.boolean().default(false),
    schedule_freq: z.string().default('MONTHLY'),
    // 카드결제면 "카드 긁히는 날", 자동이체면 "실제 출금일"
    schedule_day: z.number().int().min(1).max(31),
    owner_user_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(200).optional(),
    // true = 금액/날짜 미확정 임시 항목 (집계에서 제외됨)
    is_draft: z.boolean().default(false),
  })
  .refine(
    // source_account_id와 source_card_id는 XOR — 둘 다 있거나 둘 다 없으면 오류
    (v) => !!v.source_account_id !== !!v.source_card_id,
    { message: 'source_account_id와 source_card_id 중 정확히 하나만 지정해야 합니다 (XOR)' },
  );

// PATCH는 innerType()으로 .refine() 제거 후 partial — 일부 필드만 수정 가능
const UpdateBody = CreateBody.innerType().partial();

export const flowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/flows', async (req) => {
    const q = req.query as { status?: string; is_draft?: string; card_id?: string; account_id?: string; limit?: string };

    let query = supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('family_id', req.familyId!)
      .is('deleted_at', null)
      .order('schedule_day', { ascending: true });

    if (q.status) query = query.eq('status', q.status);
    if (q.is_draft != null) query = query.eq('is_draft', q.is_draft === 'true');
    if (q.card_id) query = query.eq('source_card_id', q.card_id);
    if (q.account_id) query = query.eq('source_account_id', q.account_id);
    if (q.limit) query = query.limit(Number(q.limit));

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { items: data };
  });

  // P3: DB unique 제거 + 서비스 레이어 휴리스틱 가드
  // 같은 머천트+날짜+출처가 이미 등록되어 있으면 결과를 반환 (차단은 안 함)
  // 클라이언트가 "이미 비슷한 항목이 있어요" UI를 보여주기 위해 사용
  fastify.get('/api/flows/similar', async (req) => {
    const q = req.query as { merchant?: string; schedule_day?: string; source_card_id?: string; source_account_id?: string };
    if (!q.merchant || !q.schedule_day) return { items: [] };

    let query = supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('family_id', req.familyId!)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .ilike('merchant_name', q.merchant)
      .eq('schedule_day', Number(q.schedule_day));
    if (q.source_card_id) query = query.eq('source_card_id', q.source_card_id);
    if (q.source_account_id) query = query.eq('source_account_id', q.source_account_id);

    const { data } = await query;
    return { items: data ?? [] };
  });

  fastify.post('/api/flows', async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('payment_flows')
      .insert({ ...body, family_id: req.familyId! })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    // 정기지출 등록은 항상 LIFE_EVENT — 가족 재무에 영향을 주는 중요 변경
    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'FLOW',
      subject_id: data.id,
      event_type: 'CREATED',
      reason_code: 'LIFE_EVENT',
      actor_user_id: req.user!.id,
      after_state: data,
    }, data.owner_user_id);

    return data;
  });

  fastify.patch('/api/flows/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateBody.parse(req.body);
    const reason = req.headers['x-reason-code'] as ReasonCode;

    // lifecycle before_state + 낙관적 잠금용 현재 version 확보
    const { data: before } = await supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { data: after, error } = await supabaseAdmin
      .from('payment_flows')
      .update({ ...body, version: before.version + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('family_id', req.familyId!)
      // 낙관적 잠금: version 불일치 시 UPDATE 행 없음 → 409
      .eq('version', req.expectedVersion!)
      .is('deleted_at', null)
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!after) return reply.code(409).send({ error: 'VERSION_CONFLICT' });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'FLOW',
      subject_id: id,
      event_type: 'UPDATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
      after_state: after,
    }, before.owner_user_id);

    return after;
  });

  fastify.delete('/api/flows/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    // accounts/cards와 달리 status='TERMINATED' + terminated_on도 같이 기록.
    // "언제 해지했는가"는 정기지출 관리에서 중요한 재무 정보이기 때문.
    const { data: after, error } = await supabaseAdmin
      .from('payment_flows')
      .update({
        status: 'TERMINATED',
        terminated_on: new Date().toISOString().slice(0, 10),
        deleted_at: new Date().toISOString(),
        version: before.version + 1,
      })
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .eq('version', req.expectedVersion!)
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!after) return reply.code(409).send({ error: 'VERSION_CONFLICT' });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'FLOW',
      subject_id: id,
      event_type: 'TERMINATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
    }, before.owner_user_id);

    return { ok: true };
  });
};
