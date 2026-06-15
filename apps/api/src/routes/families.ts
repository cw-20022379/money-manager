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
  fastify.post('/api/families', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const body = CreateFamilyBody.parse(req.body);

    // 이미 가족이 있으면 거부
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
    const token = crypto.randomBytes(24).toString('base64url');
    const { error } = await supabaseAdmin.from('invite_tokens').insert({
      token,
      family_id: req.familyId,
      inviter_user_id: req.user!.id,
      email_hint: body.success ? body.data.email_hint : null,
    });
    if (error) return reply.code(500).send({ error: error.message });
    return { token, expires_in_days: 7 };
  });

  // 가족 구성원 목록 (v0.2)
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
      members: (members ?? []).map((m) => ({ ...m, is_me: m.user_id === req.user!.id })),
    };
  });

  // 구성원 내보내기(OWNER) / 가족에서 나가기(본인)
  fastify.delete('/api/families/members/:userId', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const { userId } = req.params as { userId: string };

    const { data: my } = await supabaseAdmin
      .from('memberships')
      .select('family_id, role')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!my) return reply.code(403).send({ error: 'NO_FAMILY' });

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
  fastify.post('/api/families/join', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const body = JoinBody.parse(req.body);

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

    // 이미 가족 있으면 거부
    const { data: existing } = await supabaseAdmin
      .from('memberships')
      .select('family_id')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (existing) return reply.code(409).send({ error: 'ALREADY_IN_FAMILY' });

    const { error: memErr } = await supabaseAdmin.from('memberships').insert({
      user_id: req.user.id,
      family_id: tok.family_id,
      display_name: body.display_name,
      role: 'MEMBER',
    });
    if (memErr) return reply.code(500).send({ error: memErr.message });

    await supabaseAdmin
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by_user_id: req.user.id })
      .eq('token', body.token);

    return { family_id: tok.family_id };
  });
};
