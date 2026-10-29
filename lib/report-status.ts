// What has happened to a report after it was saved. Every status change is a dated event with a
// note, so the history shows who claimed what and when; nothing is marked resolved without one.
export const REPORT_STATUSES = [
  "submitted",
  "under_review",
  "verified",
  "action_reported",
  "rechecked",
  "resolved",
  "closed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const STATUS_INFO: Record<ReportStatus, { label: string; description: string; needsNote: boolean }> = {
  submitted: {
    label: "Submitted",
    description: "Saved by the person who reviewed the photo. Nobody else has checked it yet.",
    needsNote: false,
  },
  under_review: {
    label: "Under review",
    description: "The project owner is checking this report.",
    needsNote: false,
  },
  verified: {
    label: "Verified",
    description: "The project owner agrees the reported barriers are visible in the photo.",
    needsNote: false,
  },
  action_reported: {
    label: "Action reported",
    description: "Someone reported that work was done or started. It has not been rechecked yet.",
    needsNote: true,
  },
  rechecked: {
    label: "Rechecked",
    description: "The place was checked again, on site or with a newer photo.",
    needsNote: true,
  },
  resolved: {
    label: "Resolved",
    description: "A recheck found the barrier is gone.",
    needsNote: true,
  },
  closed: {
    label: "Closed",
    description: "Closed without action: a duplicate, or not a barrier after all.",
    needsNote: true,
  },
};

export interface StatusEvent {
  status: ReportStatus;
  /** ISO time of the change. */
  at: string;
  /** What the change is based on; required for statuses that claim something happened. */
  note: string;
  /** For a closed duplicate: the report it duplicates. */
  duplicateOf?: string;
}

/** The history, starting with the save itself (reports saved before statuses existed have none stored). */
export function statusHistory(report: { createdAt: string; statusHistory?: StatusEvent[] }): StatusEvent[] {
  return report.statusHistory?.length
    ? report.statusHistory
    : [{ status: "submitted", at: report.createdAt, note: "" }];
}

export function currentStatus(report: { createdAt: string; statusHistory?: StatusEvent[] }): StatusEvent {
  const history = statusHistory(report);
  return history[history.length - 1];
}
