/**
 * routes/cards.ts — 카드 CRUD 라우트
 *
 * 카드는 신용카드/체크카드를 나타낸다.
 * billing_account_id로 결제 계좌와 연결되어 graph 트리를 구성한다.
 *
 * ★ 카드 날짜 개념 구분 (혼동 주의):
 *   - billing_cycle_start_day / billing_cycle_end_day: 카드를 "긁는" 기간.
 *     예: 1일~말일 → 해당 달의 지출이 청구서에 포함됨.
 *   - payment_due_day + payment_due_month_offset: 통장에서 실제로 "빠지는" 날.
 *     예: payment_due_day=15, offset=1 → 다음 달 15일에 출금.
 *   정기지출의 schedule_day는 "카드 긁는 날"(billing 기준)이며,
 *   실제 출금일은 카드의 payment_due_day로 별도 계산해야 한다.
 *
 * owner_user_id (soft ownership):
 *   누가 주로 이 카드를 쓰는지(부담 책임자) 표시하는 라벨.
 *   null이면 부부 공동 카드. 접근 권한과 무관하게 가족 전원이 조회/수정 가능.
 *
 * last4(마이데이터 매칭 대비)는 mask.ts의 extractLast4 공용 util 사용.
 *
 * CRUD 패턴은 accounts.ts와 동일:
 *   GET(soft delete 제외) / POST(LIFE_EVENT) / PATCH(낙관적 잠금) / DELETE(소프트 삭제)
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent, type ReasonCode } from '../services/lifecycle.js';
import { extractLast4 } from '../mask.js';

const CreateBody = z.object({
  issuer_name: z.string().min(1).max(60),
  card_type: z.enum(['CREDIT', 'CHECK', 'OTHER']),
  product_name: z.string().min(1).max(60),
  card_number_masked: z.string().max(40).optional(),
  owner_user_id: z.string().uuid().optional().nullable(),
  // 이 카드의 청구서가 빠져나가는 결제 계좌 (graph 트리 구성의 핵심)
  billing_account_id: z.string().uuid().optional().nullable(),
  billing_cycle_start_day: z.number().int().min(1).max(31).optional(),
  billing_cycle_end_day: z.number().int().min(1).max(31).optional(),
  // 카드 대금이 통장에서 출금되는 날 (schedule_day와 다름)
  payment_due_day: z.number().int().min(1).max(31).optional(),
  // 0=당월, 1=익월, 2=2개월 후 (카드사마다 다름)
  payment_due_month_offset: z.number().int().min(0).max(3).optional(),
});

const UpdateBody = CreateBody.partial();

export const cardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/cards', async (req) => {
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('family_id', req.familyId!)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data };
  });

  fastify.post('/api/cards', async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('cards')
      .insert({
        ...body,
        family_id: req.familyId!,
        card_last4: extractLast4(body.card_number_masked),
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    // 카드 등록은 항상 LIFE_EVENT — 배우자가 알아야 하는 중요 변경
    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'CARD',
      subject_id: data.id,
      event_type: 'CREATED',
      reason_code: 'LIFE_EVENT',
      actor_user_id: req.user!.id,
      after_state: data,
    }, data.owner_user_id);

    return data;
  });

  fastify.patch('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateBody.parse(req.body);
    const reason = req.headers['x-reason-code'] as ReasonCode;

    // lifecycle before_state + 낙관적 잠금용 현재 version 확보
    const { data: before } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const patch: Record<string, unknown> = { ...body, version: before.version + 1, updated_at: new Date().toISOString() };
    // 카드번호가 PATCH에 포함된 경우에만 last4 재계산
    if ('card_number_masked' in body) {
      patch.card_last4 = extractLast4(body.card_number_masked);
    }

    const { data: after, error } = await supabaseAdmin
      .from('cards')
      .update(patch)
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
      subject_kind: 'CARD',
      subject_id: id,
      event_type: 'UPDATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
      after_state: after,
    }, before.owner_user_id);

    return after;
  });

  fastify.delete('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    // 소프트 삭제 + 낙관적 잠금 (accounts.ts와 동일 패턴)
    const { data: after, error } = await supabaseAdmin
      .from('cards')
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
      subject_kind: 'CARD',
      subject_id: id,
      event_type: 'TERMINATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
    }, before.owner_user_id);

    return { ok: true };
  });
};
