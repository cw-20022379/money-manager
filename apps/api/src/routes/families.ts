/**
 * routes/families.ts — 가족 생성·초대·합류·구성원 관리 라우트
 *
 * ★ /api/families가 tenantPlugin을 우회하는 이유:
 *   tenantPlugin은 memberships를 조회해 req.familyId를 주입한다.
 *   그런데 가족 생성(POST /api/families)이나 초대 토큰으로 합류(POST /api/families/join)는
 *   "아직 가족이 없는" 사용자가 호출해야 한다. memberships 조회가 실패하면 403을 반환하므로
 *   tenantPlugin이 해당 prefix를 통째로 스킵한다.
 *   → 각 라우트 핸들러가 직접 membership을 lookup하거나 family_id를 파라미터로 받는다.
 *
 * ★ 멤버 내보내기/나가기 권한 모델:
 *   - 본인 나가기(self leave): MEMBER만 가능. OWNER는 나갈 수 없다.
 *     이유: 가족이 소유자 없이 남으면 관리 불가 상태가 되기 때문.
 *     (향후 소유자 이전 기능 추가 시 해제 가능)
 *   - 남 내보내기(kick): OWNER만 가능. 단, 다른 OWNER는 내보낼 수 없다.
 *     이유: 소유자끼리 서로 추방하는 분쟁 방지.
 *
 * 초대 토큰 설계:
 *   - crypto.randomBytes(24).toString('base64url') → 32자 충돌 불가능한 토큰.
 *   - 유효기간 7일 (DB의 expires_at 컬럼으로 관리).
 *   - 1회용 (used_at이 있으면 410 TOKEN_USED).
 *   - email_hint: 초대받을 사람의 이메일을 힌트로 저장. 강제 검증은 안 하고
 *     UI에서 "홍길동@... 님에게 보낸 초대" 표시용으로만 사용.
 *
 * /api/families/invite의 familyId 직접 lookup:
 *   tenantPlugin이 /api/families를 스킵하므로 req.familyId가 주입되지 않는다.
 *   이 라우트는 이미 가족이 있는 사용자가 호출하므로 직접 memberships를 조회한다.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { supabaseAdmin } from '../db.js';

const CreateFamilyBody = z.object({
  name: z.string().min(1).max(60),
  display_name: z.string().min(1).max(30),
});

const InviteBody = z.object({
  email_hint: z.string().email().optional(),
});

const JoinBody = z.object({
  token: z.string().min(8),
  display_name: z.string().min(1).max(30),
});

export const familyRoutes: FastifyPluginAsync = async (fastify) => {
  // 가족 생성 (회원가입 직후 1회)
  // tenantPlugin을 우회하므로 req.familyId가 없다. membership 중복 확인을 직접 수행.
  fastify.post('/api/families', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const body = CreateFamilyBody.parse(req.body);

    // 이미 가족이 있으면 거부 (1인 1가족 제약)
    const { data: existing } = await supabaseAdmin
      .from('memberships')
      .select('family_id')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (existing) return reply.code(409).send({ error: 'ALREADY_IN_FAMILY' });

    const { data: fam, error: famErr } = await supabaseAdmin
      .from('families')
      .insert({ name: body.name })
      .select()
      .single();
    if (famErr || !fam) return reply.code(500).send({ error: famErr?.message });

    // 가족 생성자는 OWNER 역할로 membership 생성
    const { error: memErr } = await supabaseAdmin
      .from('memberships')
      .insert({
        user_id: req.user.id,
        family_id: fam.id,
        display_name: body.display_name,
        role: 'OWNER',
      });
    if (memErr) return reply.code(500).send({ error: memErr.message });

    return { family: fam };
  });

  // 초대 토큰 생성 (P9)
  // tenantPlugin이 /api/families를 스킵하므로 req.familyId가 없을 수 있다.
  // 초대자가 이미 가족이 있어야 하므로 직접 memberships를 조회한다.
  fastify.post('/api/families/invite', async (req, reply) => {
    if (!req.user || !req.familyId) {
      // tenant 미들웨어가 /api/families를 스킵하므로 직접 lookup
      const { data } = await supabaseAdmin
        .from('memberships')
        .select('family_id')
        .eq('user_id', req.user!.id)
        .maybeSingle();
      if (!data) return reply.code(403).send({ error: 'NO_FAMILY' });
      req.familyId = data.family_id;
    }
    const body = InviteBody.safeParse(req.body ?? {});
    // 32자 base64url 토큰 — URL-safe하고 충분히 무작위
    const token = crypto.randomBytes(24).toString('base64url');
    const { error } = await supabaseAdmin.from('invite_tokens').insert({
      token,
      family_id: req.familyId,
      inviter_user_id: req.user!.id,
      // email_hint: 초대받는 사람 이메일 힌트 (강제 검증 없음, UI 표시용)
      email_hint: body.success ? body.data.email_hint : null,
    });
    if (error) return reply.code(500).send({ error: error.message });
    return { token, expires_in_days: 7 };
  });

  // 가족 구성원 목록 (v0.2)
  // tenantPlugin 스킵으로 req.familyId 없으므로 직접 membership 조회
  fastify.get('/api/families/members', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const { data: my } = await supabaseAdmin
      .from('memberships')
      .select('family_id, role')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!my) return reply.code(403).send({ error: 'NO_FAMILY' });

    const { data: members, error } = await supabaseAdmin
      .from('memberships')
      .select('user_id, display_name, role, joined_at, last_seen_at')
      .eq('family_id', my.family_id)
      .order('joined_at', { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });

    return {
      my_role: my.role,
      // is_me: 클라이언트가 "나" 표시를 위해 사용
      members: (members ?? []).map((m) => ({ ...m, is_me: m.user_id === req.user!.id })),
    };
  });

  // 구성원 내보내기(OWNER) / 가족에서 나가기(본인)
  // 권한 모델: OWNER는 나갈 수 없고(소유자 보호), 남을 내보내려면 OWNER여야 하며, 다른 OWNER는 내보낼 수 없음
  fastify.delete('/api/families/members/:userId', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const { userId } = req.params as { userId: string };

    const { data: my } = await supabaseAdmin
      .from('memberships')
      .select('family_id, role')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!my) return reply.code(403).send({ error: 'NO_FAMILY' });

    // 대상 구성원이 같은 가족에 속하는지 확인
    const { data: target } = await supabaseAdmin
      .from('memberships')
      .select('user_id, role')
      .eq('user_id', userId)
      .eq('family_id', my.family_id)
      .maybeSingle();
    if (!target) return reply.code(404).send({ error: 'NOT_FOUND' });

    const isSelf = userId === req.user.id;
    if (isSelf) {
      // 소유자 본인은 나갈 수 없음 (가족이 주인 없이 남는 것 방지)
      // 향후 소유자 이전 기능 추가 후 해제 가능
      if (my.role === 'OWNER') return reply.code(400).send({ error: 'OWNER_CANNOT_LEAVE' });
    } else {
      // 남을 내보내려면 소유자여야 하고, 다른 소유자는 못 내보냄
      if (my.role !== 'OWNER') return reply.code(403).send({ error: 'NOT_OWNER' });
      if (target.role === 'OWNER') return reply.code(400).send({ error: 'CANNOT_REMOVE_OWNER' });
    }

    const { error } = await supabaseAdmin
      .from('memberships')
      .delete()
      .eq('user_id', userId)
      .eq('family_id', my.family_id);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  // 초대 토큰으로 합류
  // tenantPlugin을 우회 — 이 요청자는 아직 가족이 없는 상태이기 때문
  fastify.post('/api/families/join', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const body = JoinBody.parse(req.body);

    // 토큰 유효성 검증: 존재하는지, 이미 사용됐는지, 만료됐는지
    const { data: tok, error: tokErr } = await supabaseAdmin
      .from('invite_tokens')
      .select('*')
      .eq('token', body.token)
      .maybeSingle();
    if (tokErr) return reply.code(500).send({ error: tokErr.message });
    if (!tok) return reply.code(404).send({ error: 'TOKEN_NOT_FOUND' });
    if (tok.used_at) return reply.code(410).send({ error: 'TOKEN_USED' });
    if (new Date(tok.expires_at).getTime() < Date.now())
      return reply.code(410).send({ error: 'TOKEN_EXPIRED' });

    // 이미 가족 있으면 거부 (1인 1가족 제약)
    const { data: existing } = await supabaseAdmin
      .from('memberships')
      .select('family_id')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (existing) return reply.code(409).send({ error: 'ALREADY_IN_FAMILY' });

    // MEMBER 역할로 합류 (OWNER는 가족 생성자만)
    const { error: memErr } = await supabaseAdmin.from('memberships').insert({
      user_id: req.user.id,
      family_id: tok.family_id,
      display_name: body.display_name,
      role: 'MEMBER',
    });
    if (memErr) return reply.code(500).send({ error: memErr.message });

    // 토큰 사용 처리 — 재사용 방지 (1회용)
    await supabaseAdmin
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by_user_id: req.user.id })
      .eq('token', body.token);

    return { family_id: tok.family_id };
  });
};
