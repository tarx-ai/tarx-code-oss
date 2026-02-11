/**
 * TARX Orchestration MCP - Type Definitions
 */

// Session types
export type SessionStatus = 'active' | 'paused' | 'completed';

export interface Session {
  id: string;
  name: string;
  workspace_path: string;
  status: SessionStatus;
  current_file?: string;
  current_task?: string;
  thinking_notes?: string;
  last_command?: string;
  last_output?: string;
  error_state?: string;
  last_activity: number;
  created_at: number;
}

export interface SessionActivity {
  id: number;
  session_id: string;
  timestamp: number;
  activity_type: string;
  details?: Record<string, unknown>;
}

export interface SessionFile {
  id: number;
  session_id: string;
  file_path: string;
  opened_at: number;
  is_active: boolean;
}

// Task types
export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  session_id: string;
  milestone_id?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_at: number;
  started_at?: number;
  completed_at?: number;
  blocked_by?: string;
  result?: string;
}

// Milestone types
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed';

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  target_date?: number;
  progress: number;
  status: MilestoneStatus;
  completed_at?: number;
  created_at: number;
}

// Documentation types
export type DocType = 'README' | 'CHANGELOG' | 'SESSION_LOG' | 'DECISION_LOG' | 'CUSTOM';

export interface ManagedDoc {
  id: number;
  session_id: string;
  file_path: string;
  doc_type: DocType;
  last_updated: number;
  update_count: number;
}

export interface DocHistory {
  id: number;
  doc_id: number;
  session_id: string;
  change_type: string;
  timestamp: number;
}

// Feedback types
export type FeedbackUrgency = 'blocking' | 'high' | 'normal';
export type FeedbackStatus = 'pending' | 'received';

export interface FeedbackRequest {
  id: string;
  topic: string;
  context: string;
  options?: string[];
  urgency: FeedbackUrgency;
  status: FeedbackStatus;
  response?: string;
  created_at: number;
  responded_at?: number;
}

// Context update types
export type UpdatePriority = 'high' | 'normal';

export interface ContextUpdate {
  id: number;
  from_session_id?: string;
  to_session_id: string;
  update_type: string;
  message: string;
  priority: UpdatePriority;
  delivered: boolean;
  timestamp: number;
}

// Model types
export interface ExternalModel {
  id: string;
  name: string;
  provider: string;
  api_endpoint: string;
  model_id: string;
  capabilities?: string[];
  cost_per_1k_tokens?: number;
  max_tokens?: number;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface ModelApiKey {
  id: string;
  model_id: string;
  encrypted_key: string;
  key_hash: string;
  created_at: number;
  last_used_at?: number;
}

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  condition: RoutingCondition;
  target_model_id: string;
  fallback_model_id?: string;
  enabled: boolean;
  created_at: number;
}

export interface RoutingCondition {
  type: 'complexity' | 'token_count' | 'keyword' | 'session' | 'custom';
  operator: 'gt' | 'lt' | 'eq' | 'contains' | 'matches';
  value: unknown;
}

export interface ModelUsage {
  id: string;
  model_id: string;
  session_id?: string;
  query_type?: string;
  tokens_used: number;
  latency_ms: number;
  cost: number;
  success: boolean;
  error_message?: string;
  timestamp: number;
}

// Blocker types
export type BlockerSeverity = 'critical' | 'high' | 'medium';
export type BlockerStatus = 'active' | 'resolved';

export interface Blocker {
  id: string;
  session_id: string;
  description: string;
  severity: BlockerSeverity;
  blocks_task_ids?: string[];
  needs_user_input: boolean;
  status: BlockerStatus;
  resolution?: string;
  created_at: number;
  resolved_at?: number;
}

// Status report type
export interface StatusReport {
  generatedAt: number;
  overallProgress: number;
  sessions: Session[];
  milestones: Milestone[];
  tasks: Task[];
  pendingFeedback: FeedbackRequest[];
  activeBlockers: Blocker[];
  userInputNeeded: boolean;
  modelStats?: {
    totalQueries: number;
    totalCost: number;
    avgLatency: number;
  };
}

// Tool input schemas (for reference)
export interface RegisterSessionInput {
  sessionId: string;
  name: string;
  workspacePath: string;
}

export interface ReportActivityInput {
  sessionId: string;
  activityType: string;
  details?: Record<string, unknown>;
}

export interface UpdateFileInput {
  sessionId: string;
  filePath: string;
  content: string;
  mode?: 'overwrite' | 'append' | 'prepend';
}

export interface AddModelInput {
  name: string;
  provider: string;
  api_endpoint: string;
  model_id: string;
  api_key: string;
  capabilities?: string[];
  cost_per_1k_tokens?: number;
  max_tokens?: number;
}

export interface AddRoutingRuleInput {
  name: string;
  priority: number;
  condition: RoutingCondition;
  target_model_id: string;
  fallback_model_id?: string;
}
