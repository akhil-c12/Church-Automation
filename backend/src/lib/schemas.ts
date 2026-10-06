import { z } from 'zod';

/**
 * Shape-only validation. Business rules (phone format, DOB sanity, required
 * fields for new members, date windows) belong to n8n and are not repeated here.
 */

const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f]*$/;

const text = (max: number) => z.string().trim().max(max).regex(NO_CONTROL_CHARS, 'must not contain control characters');

export const memberId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(NO_CONTROL_CHARS, 'must not contain control characters');

export const executionId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid execution id');

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be yyyy-MM-dd');

export const yesNo = z.enum(['Yes', 'No']);
export const memberStatus = z.enum(['Active', 'Inactive']);
export const messageStatus = z.enum(['SENT', 'FAILED', 'UNKNOWN', 'SKIPPED', 'INVALID', 'REVIEW', 'DEFERRED', 'PENDING']);

/** Query-string boolean: only true/false/1/0 are accepted. */
export const queryBool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const queryInt = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,7}$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

const memberFields = {
  full_name: text(200).optional(),
  mobile_number: text(32).optional(),
  date_of_birth: text(32).optional(),
  whatsapp_enabled: yesNo.optional(),
  status: memberStatus.optional(),
  remarks: text(1000).optional(),
};

export const memberInput = z.object({ member_id: memberId, ...memberFields }).strict();

export const memberPatch = z
  .object({ member_id: memberId.optional(), ...memberFields })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'member_id'), 'at least one field to update is required');

export const recordsBody = z.object({ records: z.array(memberInput).min(1).max(500) }).strict();

export const memberIdList = z.array(memberId).min(1).max(200);

/** Comma-separated ids in a query string: ?member_ids=CH1,CH2 */
export const memberIdsQuery = z
  .string()
  .max(200 * 65)
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(memberIdList);

export const listMembersQuery = z
  .object({
    q: text(100).optional(),
    status: memberStatus.optional(),
    whatsapp_enabled: yesNo.optional(),
    issues_only: queryBool.optional(),
    birthday_month: queryInt(1, 12).optional(),
    page: queryInt(1, 1_000_000).optional(),
    page_size: queryInt(1, 200).optional(),
  })
  .strict();

export const previewQuery = z
  .object({
    date: isoDate.optional(),
    member_ids: memberIdsQuery.optional(),
  })
  .strict();

export const sendBody = z
  .object({
    date: isoDate.optional(),
    member_ids: memberIdList.optional(),
    force_resend: z.boolean().optional(),
  })
  .strict();

export const messagesQuery = z
  .object({
    date: isoDate.optional(),
    status: messageStatus.optional(),
    member_id: memberId.optional(),
    limit: queryInt(1, 1000).optional(),
  })
  .strict();

export const runsQuery = z
  .object({
    date: isoDate.optional(),
    limit: queryInt(1, 200).optional(),
  })
  .strict();
