// Mirrors the backend / n8n contract (backend/src/n8n/types.ts).

export type YesNo = "Yes" | "No";
export type MemberStatus = "Active" | "Inactive";

export interface Member {
  member_id: string;
  full_name: string;
  mobile_number: string;
  normalized_mobile: string;
  date_of_birth: string;
  whatsapp_enabled: string;
  status: string;
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
  operation: "ADD" | "UPDATE";
  validation_status: "VALID" | "INVALID" | "UNCHANGED";
  errors: string[];
  warnings: string[];
}

export interface MemberBatch {
  committed: boolean;
  summary: Record<string, number>;
  rows: RowResult[];
}

export type DecisionKind = "SEND" | "SKIPPED" | "INVALID" | "REVIEW" | "DEFERRED" | "NOT_FOUND";

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

export type MessageStatus = "SENT" | "FAILED" | "UNKNOWN" | "SKIPPED" | "INVALID" | "REVIEW" | "DEFERRED" | "PENDING";

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

export type RunResult = "COMPLETED" | "COMPLETED_WITH_FAILURES" | "COMPLETED_NEEDS_ATTENTION" | "NO_BIRTHDAYS";

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

export interface ListMembers {
  members: Member[];
  pagination: Pagination;
  totals: { all_members: number; with_data_issues: number };
}

export interface Preview {
  target_date: string;
  birthdays: number;
  would_send: number;
  counts: Partial<Record<DecisionKind, number>>;
  members: Decision[];
}

export interface MessageLog {
  date: string;
  counts: Partial<Record<MessageStatus, number>>;
  returned: number;
  total: number;
  messages: LogRow[];
}

export interface RunHistory {
  found: boolean;
  status: string;
  runs: Run[];
}

export interface SendAccepted {
  target_date: string;
  scope: string;
  member_ids: string[];
  force_resend: boolean;
  requested_by: string;
}

export interface DashboardData {
  totals: { all_members: number; with_data_issues: number } | null;
  data_issues: number | null;
  today: {
    date: string | null;
    birthdays: number | null;
    would_send: number | null;
    counts: Partial<Record<DecisionKind, number>> | null;
    members: Decision[];
  } | null;
  messages_today: Partial<Record<MessageStatus, number>> | null;
  last_run: Run | null;
}

export interface DashboardSourceError {
  source: string;
  status: number;
  code: string;
  message: string;
}
