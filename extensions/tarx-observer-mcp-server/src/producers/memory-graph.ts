/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Memory Graph Producer
 *  Builds a weighted relationship graph from domain knowledge, preferences,
 *  and growth metrics. Exports as JSON for visualization or analysis.
 *--------------------------------------------------------------------------------------------*/

import { getDomainTerms, getAllPreferences, getGrowthMetrics, getRecentInteractions } from '../storage.js';
import type { DomainTerm, Preference } from '../types.js';

export interface GraphNode {
	id: string;
	label: string;
	type: 'term' | 'person' | 'project' | 'concept' | 'tool' | 'preference';
	weight: number; // 0-1, based on frequency/confidence
	metadata: Record<string, unknown>;
}

export interface GraphEdge {
	source: string;
	target: string;
	relationship: string;
	weight: number; // co-occurrence strength
}

export interface MemoryGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
	generated_at: string;
	stats: {
		total_nodes: number;
		total_edges: number;
		clusters: number;
	};
}

export class MemoryGraphProducer {

	/**
	 * Build the full memory graph from all available data.
	 */
	build(): MemoryGraph {
		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];

		// ── Domain term nodes ──
		const terms = getDomainTerms(100);
		for (const term of terms) {
			nodes.push({
				id: `term:${term.term}`,
				label: term.term,
				type: (term.category as GraphNode['type']) || 'concept',
				weight: Math.min(1.0, term.frequency / 20),
				metadata: {
					definition: term.definition,
					category: term.category,
					frequency: term.frequency,
					first_seen: term.first_seen,
					last_seen: term.last_seen
				}
			});
		}

		// ── Preference nodes ──
		const preferences = getAllPreferences();
		for (const pref of preferences) {
			if (pref.confidence < 0.5) continue;
			nodes.push({
				id: `pref:${pref.key}`,
				label: `${pref.key}=${pref.value}`,
				type: 'preference',
				weight: pref.confidence,
				metadata: {
					evidence_count: pref.evidence_count,
					last_updated: pref.last_updated
				}
			});
		}

		// ── Co-occurrence edges ──
		this.buildCooccurrenceEdges(terms, edges);

		// ── Category clustering edges ──
		this.buildCategoryEdges(terms, edges);

		// ── Compute clusters ──
		const clusters = this.countClusters(nodes, edges);

		return {
			nodes,
			edges,
			generated_at: new Date().toISOString(),
			stats: {
				total_nodes: nodes.length,
				total_edges: edges.length,
				clusters
			}
		};
	}

	/**
	 * Build edges between terms that co-occur in the same interactions.
	 */
	private buildCooccurrenceEdges(terms: DomainTerm[], edges: GraphEdge[]): void {
		const interactions = getRecentInteractions(200);
		const cooccurrence = new Map<string, number>();

		for (const interaction of interactions) {
			const text = `${interaction.user_message} ${interaction.assistant_message}`.toLowerCase();
			const presentTerms = terms.filter(t => text.includes(t.term.toLowerCase()));

			// Create pairs
			for (let i = 0; i < presentTerms.length; i++) {
				for (let j = i + 1; j < presentTerms.length; j++) {
					const key = [presentTerms[i].term, presentTerms[j].term].sort().join('|');
					cooccurrence.set(key, (cooccurrence.get(key) || 0) + 1);
				}
			}
		}

		// Convert to edges (only if co-occurred 2+ times)
		for (const [key, count] of cooccurrence.entries()) {
			if (count < 2) continue;
			const [a, b] = key.split('|');
			edges.push({
				source: `term:${a}`,
				target: `term:${b}`,
				relationship: 'co-occurs',
				weight: Math.min(1.0, count / 10)
			});
		}
	}

	/**
	 * Build edges between terms in the same category.
	 */
	private buildCategoryEdges(terms: DomainTerm[], edges: GraphEdge[]): void {
		const byCategory = new Map<string, DomainTerm[]>();

		for (const term of terms) {
			if (!term.category) continue;
			const list = byCategory.get(term.category) || [];
			list.push(term);
			byCategory.set(term.category, list);
		}

		for (const [category, categoryTerms] of byCategory.entries()) {
			// Connect terms in the same category (sparse: only top N)
			const top = categoryTerms.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
			for (let i = 0; i < top.length; i++) {
				for (let j = i + 1; j < Math.min(top.length, i + 3); j++) {
					edges.push({
						source: `term:${top[i].term}`,
						target: `term:${top[j].term}`,
						relationship: `same_category:${category}`,
						weight: 0.3
					});
				}
			}
		}
	}

	/**
	 * Count connected components (clusters) using union-find.
	 */
	private countClusters(nodes: GraphNode[], edges: GraphEdge[]): number {
		const parent = new Map<string, string>();
		for (const node of nodes) parent.set(node.id, node.id);

		const find = (x: string): string => {
			while (parent.get(x) !== x) {
				parent.set(x, parent.get(parent.get(x)!)!);
				x = parent.get(x)!;
			}
			return x;
		};

		const union = (a: string, b: string): void => {
			const ra = find(a);
			const rb = find(b);
			if (ra !== rb) parent.set(ra, rb);
		};

		for (const edge of edges) {
			if (parent.has(edge.source) && parent.has(edge.target)) {
				union(edge.source, edge.target);
			}
		}

		const roots = new Set<string>();
		for (const node of nodes) roots.add(find(node.id));
		return roots.size;
	}
}
