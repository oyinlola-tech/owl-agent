import type { ApprovalRead } from "../../services/agentApi.types";

export type InboxView = "pending" | "decided" | "all";

export interface InboxItem {
  key: string;
  source: "local" | "backend";
  taskId: string;
  id: string;
  kind: ApprovalRead["kind"];
  title: string;
  reason: string;
  command: string | null;
  files: string[];
  dir: string;
  risk: "Low" | "Medium" | "High";
  scope: string;
  expires_at: string | null;
  status: ApprovalRead["status"];
  decided_by: string;
  decided_at: string | null;
  created_at: string;
}

export interface InboxGroup {
  taskId: string;
  title: string;
  project: string;
  status: string;
  source: "local" | "backend";
  items: InboxItem[];
}
