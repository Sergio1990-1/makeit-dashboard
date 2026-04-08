// ══════════════════════════════════════════
// DEBATE ENGINE TYPES
// ══════════════════════════════════════════

export interface DebateParticipant {
  provider: "anthropic" | "openai" | "gemini";
  role: "architect" | "critic" | "practitioner";
}

export interface DebateStartRequest {
  topic: string;
  project?: string;
  brief?: string;
  context_files?: string[];
  participants?: DebateParticipant[];
}

export interface DebateMessage {
  id: string;
  sender: "user" | "system" | DebateParticipant;
  round?: number;
  round_type?: "proposal" | "critique" | "synthesis";
  content: string;
  timestamp: string;
}

export interface DebateRound {
  number: number;
  type: "proposal" | "critique" | "synthesis";
  responses: Record<string, string>;
  timestamp: string;
}

export interface DebateResult {
  rounds: DebateRound[];
  messages: DebateMessage[];
  consensus: string;
  dissenting_opinions: string[];
  total_cost: number;
  cost_per_provider: Record<string, number>;
  participants: DebateParticipant[];
  project?: string;
}

export type DebateStage =
  | "context_gathering"
  | "round_1"
  | "round_2"
  | "round_3"
  | "synthesis"
  | "finalizing";

export interface DebateStatus {
  id: string;
  status: "queued" | "running" | "done" | "error";
  stage: DebateStage | string;
  progress: number;
  current_round: number;
  current_speaker?: string;
  messages: DebateMessage[];
}

export interface DebateListItem {
  id: string;
  topic: string;
  project?: string;
  status: "queued" | "running" | "done" | "error";
  consensus_level: "unanimous" | "majority" | "contested";
  total_cost: number;
  created_at: string;
  finished_at?: string;
}

export interface DebateResultResponse {
  debate_result: DebateResult;
  adr_markdown: string;
  cost_summary: {
    total_cost: number;
    cost_per_provider: Record<string, number>;
  };
}

export interface UserMessageRequest {
  content: string;
}
