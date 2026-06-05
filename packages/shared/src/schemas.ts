import { z } from 'zod';

export const ReasonCodeSchema = z.enum(['LIFE_EVENT', 'CORRECTION']);

export const CreateFamilySchema = z.object({
  name: z.string().min(1).max(60),
  display_name: z.string().min(1).max(30),
});

export const JoinFamilySchema = z.object({
  token: z.string().min(8),
  display_name: z.string().min(1).max(30),
});

export const CreateAccountSchema = z.object({
  institution_name: z.string().min(1).max(60),
  account_type: z.enum(['CHECKING', 'SAVINGS', 'LOAN', 'OTHER']),
  nickname: z.string().min(1).max(60),
  account_number_masked: z.string().optional(),
  balance_krw: z.number().int().nonnegative().optional(),
});

export const CreateFlowSchema = z
  .object({
    merchant_name: z.string().min(1).max(60),
    category: z.enum([
      'UTILITY',
      'TELECOM',
      'INSURANCE',
      'MEDIA',
      'SAAS',
      'EDUCATION',
      'LOAN',
      'CARD_BILL',
      'RENT',
      'HEALTHCARE',
      'OTHER',
    ]),
    flow_kind: z.enum([
      'CARD_RECURRING',
      'BANK_AUTO_TRANSFER',
      'CARD_BILL_PAYMENT',
      'OTHER',
    ]),
    source_account_id: z.string().uuid().optional(),
    source_card_id: z.string().uuid().optional(),
    amount_krw: z.number().int().positive().optional(),
    amount_is_variable: z.boolean().default(false),
    schedule_day: z.number().int().min(1).max(31),
    is_draft: z.boolean().default(false),
    notes: z.string().max(200).optional(),
  })
  .refine(
    (v) => !!v.source_account_id !== !!v.source_card_id,
    { message: 'source_account_id와 source_card_id 중 정확히 하나만 지정해야 합니다 (XOR)' },
  );
