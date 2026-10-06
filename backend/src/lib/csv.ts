import { parse } from 'csv-parse/sync';
import { AppError, validationError, type ErrorDetail } from './errors.js';
import { memberInput } from './schemas.js';
import type { MemberInput } from '../n8n/types.js';

export const MAX_CSV_ROWS = 500;

type Field = keyof MemberInput;

/** Normalised header (lowercase, alphanumerics only) -> MemberInput field. */
const HEADER_ALIASES: Record<string, Field> = {
  memberid: 'member_id',
  id: 'member_id',
  fullname: 'full_name',
  name: 'full_name',
  mobilenumber: 'mobile_number',
  mobile: 'mobile_number',
  phone: 'mobile_number',
  phonenumber: 'mobile_number',
  whatsappnumber: 'mobile_number',
  dateofbirth: 'date_of_birth',
  dob: 'date_of_birth',
  birthdate: 'date_of_birth',
  whatsappenabled: 'whatsapp_enabled',
  whatsapp: 'whatsapp_enabled',
  status: 'status',
  remarks: 'remarks',
  remark: 'remarks',
  notes: 'remarks',
};

const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);

/** Normalise letter case only; anything else is left for validation to reject. */
function normaliseValue(field: Field, value: string): string {
  const lower = value.toLowerCase();
  if (field === 'whatsapp_enabled') {
    if (YES.has(lower)) return 'Yes';
    if (NO.has(lower)) return 'No';
  }
  if (field === 'status') {
    if (lower === 'active') return 'Active';
    if (lower === 'inactive') return 'Inactive';
  }
  return value;
}

/**
 * Parses an uploaded member CSV. Headers are matched case-insensitively and
 * ignoring spaces/underscores ("Member ID", "member_id", "MEMBER_ID" all work).
 * Unknown columns (e.g. Created_At from a Sheets export) are ignored. Empty
 * cells are omitted so an upsert does not blank existing values.
 */
export function parseMembersCsv(buf: Buffer): MemberInput[] {
  const content = buf.toString('utf8');
  if (content.includes('\u0000')) throw new AppError(400, 'VALIDATION_ERROR', 'File is not a text CSV');

  let header: (Field | undefined)[] = [];
  let rows: string[][];
  try {
    rows = parse(content, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 64 * 1024,
      // Header + one row more than allowed, so we can detect "too many" without parsing everything.
      to: MAX_CSV_ROWS + 2,
    }) as string[][];
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : 'unparseable';
    throw new AppError(400, 'VALIDATION_ERROR', 'Could not parse CSV', [String(msg).slice(0, 200)]);
  }

  const [headRow, ...dataRows] = rows;
  if (!headRow) throw new AppError(400, 'VALIDATION_ERROR', 'CSV is empty');

  header = headRow.map((h) => {
    const key = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    // hasOwn: a column named "constructor" must not resolve to Object.prototype members.
    return Object.hasOwn(HEADER_ALIASES, key) ? HEADER_ALIASES[key] : undefined;
  });
  if (!header.includes('member_id')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'CSV must have a Member_ID column');
  }
  const seen = new Set<Field>();
  for (const f of header) {
    if (!f) continue;
    if (seen.has(f)) throw new AppError(400, 'VALIDATION_ERROR', `CSV has more than one column for ${f}`);
    seen.add(f);
  }

  if (dataRows.length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'CSV has no data rows');
  if (dataRows.length > MAX_CSV_ROWS) {
    throw new AppError(400, 'VALIDATION_ERROR', `CSV has more than ${MAX_CSV_ROWS} rows; split it into smaller files`);
  }

  const records: MemberInput[] = [];
  const errors: ErrorDetail[] = [];
  dataRows.forEach((cells, i) => {
    const raw: Record<string, string> = {};
    cells.forEach((cell, col) => {
      const field = header[col];
      if (field && cell !== '') raw[field] = normaliseValue(field, cell);
    });
    const r = memberInput.safeParse(raw);
    // Row numbers match the spreadsheet: header is row 1.
    if (!r.success) for (const issue of r.error.issues) errors.push({ row: i + 2, path: issue.path.join('.'), message: issue.message });
    else records.push(r.data);
  });
  if (errors.length) throw validationError(errors.slice(0, 100), 'CSV contains invalid rows');
  return records;
}
