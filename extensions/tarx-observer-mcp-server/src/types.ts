/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Shared Types
 *  Passive intelligence layer for user modeling and training data curation.
 *--------------------------------------------------------------------------------------------*/

// ── Interaction records ──

export interface Interaction {
	id: string;
	session_id: string | null;
	user_message: string;
	assistant_message: string;
	user_tokens: number;
	assistant_tokens: number;
	response_time_ms: number;
	created_at: number;
	was_edited: number;
	was_copied: number;
	was_ignored: number;
	was_corrected: number;
	correction_text: string | null;
	rating: 'thumbs_up' | 'thumbs_down' | 'none';
	quality_score: number;
	flagged_issues: string | null; // JSON array
}

// ── Preferences ──

export interface Preference {
	key: string;
	value: string;
	confidence: number;
	evidence_count: number;
	last_updated: number;
}

// ── Domain knowledge ──

export interface DomainTerm {
	id: string;
	term: string;
	definition: string | null;
	category: string | null;
	frequency: number;
	confidence: number;
	first_seen: number;
	last_seen: number;
}

// ── Model gaps ──

export interface ModelGap {
	id: string;
	pattern: string;
	wrong_response: string | null;
	correct_response: string | null;
	occurrence_count: number;
	last_occurred: number;
	resolved: number;
}

// ── Training queue ──

export interface TrainingEntry {
	id: string;
	instruction: string;
	response: string;
	system_context: string | null;
	source: 'interaction' | 'correction' | 'synthetic' | 'manual';
	quality_score: number;
	tokens: number | null;
	exported: number;
	created_at: number;
}

// ── Training runs ──

export interface TrainingRun {
	id: string;
	started_at: number;
	completed_at: number | null;
	examples_count: number;
	method: 'lora' | 'full' | 'dpo';
	status: 'pending' | 'running' | 'completed' | 'failed';
	mesh_peers_used: number;
	adapter_path: string | null;
	metrics: string | null; // JSON
}

// ── Growth metrics ──

export interface GrowthMetric {
	id: string;
	metric: string;
	value: number;
	period: string;
	details: string | null; // JSON
	created_at: number;
}

// ── Prompt fragments ──

export interface PromptFragment {
	id: string;
	category: string;
	content: string;
	priority: number;
	active: number;
	last_updated: number;
}

// ── Collector input ──

export interface InteractionInput {
	session_id?: string;
	user_message: string;
	assistant_message: string;
	response_time_ms?: number;
	tools_used?: string[];
}

// ── Analyzer output ──

export interface AnalysisResult {
	updated: number;
	details: Record<string, unknown>;
}

// ── Observer status ──

export interface ObserverStatus {
	interactions_captured: number;
	preferences_learned: number;
	domain_terms: number;
	model_gaps: number;
	training_queue_size: number;
	last_analysis_run: string | null;
	quality_score_avg: number;
}

// ── Insight ──

export interface Insight {
	category: 'preferences' | 'domain' | 'gaps' | 'growth';
	message: string;
	confidence: number;
	evidence_count: number;
}

// ── Export result ──

export interface ExportResult {
	path: string;
	count: number;
	total_tokens: number;
}

// ── Growth dashboard ──

export interface GrowthDashboard {
	metrics: Array<{
		metric: string;
		current_value: number;
		trend: 'improving' | 'stable' | 'declining';
		details: string;
	}>;
	summary: string;
}
