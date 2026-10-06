import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type { N8nClient } from '../n8n/client.js';
import type { MemberInput } from '../n8n/types.js';
import { AppError } from '../lib/errors.js';
import { asyncHandler, callCtx, compact, forward, parse } from '../lib/http.js';
import { parseMembersCsv } from '../lib/csv.js';
import { listMembersQuery, memberId, memberInput, memberPatch, recordsBody } from '../lib/schemas.js';

const CSV_MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_MAX_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 50 },
  fileFilter: (_req, file, cb) => {
    const okName = /\.csv$/i.test(file.originalname);
    const okType = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'].includes(
      file.mimetype,
    );
    if (file.fieldname !== 'file' || !okName || !okType) {
      cb(new AppError(400, 'VALIDATION_ERROR', 'Upload a single .csv file in the "file" field'));
      return;
    }
    cb(null, true);
  },
});

/** Records come from a JSON body `{records}` or a multipart CSV upload (field "file"). */
async function readRecords(req: Request, res: Response): Promise<MemberInput[]> {
  if (req.is('multipart/form-data')) {
    await new Promise<void>((resolve, reject) => upload.single('file')(req, res, (err?: unknown) => (err ? reject(err) : resolve())));
    if (!req.file) throw new AppError(400, 'VALIDATION_ERROR', 'Upload a single .csv file in the "file" field');
    return parseMembersCsv(req.file.buffer);
  }
  return parse(recordsBody, req.body).records;
}

export function membersRouter(n8n: N8nClient): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = parse(listMembersQuery, req.query);
      forward(res, await n8n.callApi('list_members', compact(query), callCtx(req)));
    }),
  );

  router.post(
    '/verify',
    asyncHandler(async (req, res) => {
      const records = await readRecords(req, res);
      forward(res, await n8n.callApi('verify_members', { records }, callCtx(req)));
    }),
  );

  router.post(
    '/import',
    asyncHandler(async (req, res) => {
      const records = await readRecords(req, res);
      forward(res, await n8n.callApi('upsert_members', { records }, callCtx(req)));
    }),
  );

  // Upsert semantics: creates the member, or updates it if member_id already exists.
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const record = parse(memberInput, req.body);
      forward(res, await n8n.callApi('upsert_members', { records: [record] }, callCtx(req)));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(memberId, req.params.id);
      forward(res, await n8n.callApi('get_member', { member_id: id }, callCtx(req)));
    }),
  );

  /**
   * PATCH and deactivate must not create members, but upsert would. So confirm
   * the member exists first and pass n8n's 404 through if not.
   */
  const ensureExists = async (req: Request, id: string) => {
    const found = await n8n.callApi('get_member', { member_id: id }, callCtx(req));
    return found.status === 200 && found.body.success ? null : found;
  };

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(memberId, req.params.id);
      const patch = parse(memberPatch, req.body);
      if (patch.member_id !== undefined && patch.member_id !== id) {
        throw new AppError(400, 'VALIDATION_ERROR', 'member_id in body does not match the URL', [
          { path: 'member_id', message: 'member_id cannot be changed' },
        ]);
      }
      const missing = await ensureExists(req, id);
      if (missing) return forward(res, missing);
      const record: MemberInput = { ...compact(patch), member_id: id };
      forward(res, await n8n.callApi('upsert_members', { records: [record] }, callCtx(req)));
    }),
  );

  // There is no hard delete, by design.
  router.post(
    '/:id/deactivate',
    asyncHandler(async (req, res) => {
      const id = parse(memberId, req.params.id);
      const missing = await ensureExists(req, id);
      if (missing) return forward(res, missing);
      forward(res, await n8n.callApi('upsert_members', { records: [{ member_id: id, status: 'Inactive' }] }, callCtx(req)));
    }),
  );

  return router;
}
