/** Types mirroring the n8n contract in CLAUDE.md. n8n is the source of truth. */

export type ApiAction =
  | 'health'
  | 'list_members'
  | 'get_member'
  | 'verify_members'
  | 'upsert_members'
  | 'preview_send'
  | 'message_log'
  | 'run_history';

export interface N8nError {
  code: string;
  message: string;
  details?: unknown[];
}

export interface N8nEnvelope<T = unknown> {
  success: boolean;
  action?: string;
  status?: string;
  data?: T;
  error?: N8nError;
  request_id?: string;
  execution_id?: string;
}

export type YesNo = 'Yes' | 'No';
export type MemberStatus = 'Active' | 'Inactive';

export interface Member {
  member_id: string;
  full_name: string;
  mobile_number: string;
  normalized_mobile: string;
  date_of_birth: string;
  whatsapp_enabled: YesNo | string;
  status: MemberStatus | string;
  remarks: string;
  created_at: string;
  updated_at: string;
  last_birthday_sent: string;
  last_message_status: string;
  last_error: string;
  data_issues: string[];
  eligible_for_whatsapp: boolean;
}

export interface MemberInput {
  member_id: string;
  full_name?: string;
  mobile_number?: string;
  date_of_birth?: string;
  whatsapp_enabled?: YesNo;
  status?: MemberStatus;
  remarks?: string;
}

export interface RowResult {
  row: number;
  member_id: string;
  operation: 'ADD' | 'UPDATE';
  validation_status: 'VALID' | 'INVALID' | 'UNCHANGED';
  errors: string[];
  warnings: string[];
}

export type DecisionKind = 'SEND' | 'SKIPPED' | 'INVALID' | 'REVIEW' | 'DEFERRED' | 'NOT_FOUND';

export interface Decision {
  member_id: string;
  full_name: string;
  mobile_number: string;
  date_of_birth: string;
  decision: DecisionKind;
  reason: string;
  attempt: number;
  message_preview: string;
}

export type MessageStatus = 'SENT' | 'FAILED' | 'UNKNOWN' | 'SKIPPED' | 'INVALID' | 'REVIEW' | 'DEFERRED' | 'PENDING';

export interface LogRow {
  log_id: string;
  member_id: string;
  member_name: string;
  mobile_number: string;
  birthday_date: string;
  attempt: number;
  status: MessageStatus;
  reason: string;
  wa_message_id: string;
  http_status: number | string;
  error_code: string;
  error: string;
  trigger_source: string;
  requested_by: string;
  claimed_at: string;
  completed_at: string;
  execution_id: string;
}

export type RunResult = 'COMPLETED' | 'COMPLETED_WITH_FAILURES' | 'COMPLETED_NEEDS_ATTENTION' | 'NO_BIRTHDAYS';

export interface Run {
  run_id: string;
  execution_id: string;
  request_id: string;
  trigger_source: string;
  requested_by: string;
  target_date: string;
  started_at: string;
  finished_at: string;
  birthdays: number;
  attempted: number;
  sent: number;
  failed: number;
  unknown: number;
  skipped: number;
  invalid: number;
  needs_review: number;
  deferred: number;
  data_issues: number;
  result: RunResult;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface HealthData {
  status: string;
  service?: string;
  workflow_id?: string;
  time_ist?: string;
}
export interface ListMembersData {
  members: Member[];
  pagination: Pagination;
  totals: { all_members: number; with_data_issues: number };
}
export interface GetMemberData {
  member: Member;
}
export interface MemberBatchData {
  committed: boolean;
  summary: Record<string, number>;
  rows: RowResult[];
}
export interface PreviewSendData {
  target_date: string;
  birthdays: number;
  would_send: number;
  counts: Record<string, number>;
  members: Decision[];
}
export interface MessageLogData {
  date: string;
  counts: Record<string, number>;
  returned: number;
  total: number;
  messages: LogRow[];
}
export interface RunHistoryData {
  found: boolean;
  status: string;
  runs: Run[];
}

export interface ActionDataMap {
  health: HealthData;
  list_members: ListMembersData;
  get_member: GetMemberData;
  verify_members: MemberBatchData;
  upsert_members: MemberBatchData;
  preview_send: PreviewSendData;
  message_log: MessageLogData;
  run_history: RunHistoryData;
}

export interface SendRequest {
  request_id: string;
  requested_by: string;
  date?: string;
  member_ids?: string[];
  force_resend?: boolean;
}

export interface SendAcceptedData {
  target_date: string;
  scope: string;
  member_ids: string[];
  force_resend: boolean;
  requested_by: string;
}
