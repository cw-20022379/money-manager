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
