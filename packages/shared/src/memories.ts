// packages/shared/src/memories.ts
// Phase 4 — Contexts → Memories (docs/tech.md)
// Pure derivation layer: BrowserContext[] in, Memory[] out. No persistence, no LLM.

import { type BrowserContext, getRecentContexts } from "./contexts";
import type { TabotDatabase } from "./db";

export interface Memory {
	id: string; // `${firstContextId}-${lastContextId}` (single context: just the context id)
	kind: "single" | "recurrent"; // What the memory represents

	// Temporal span (first → last supporting context)
	startTimestamp: number;
	endTimestamp: number;

	// Core identity: the domain-set that recurs
	signature: string; // Canonical signature, e.g. "github.com+slack.com" (sorted, +-joined)
	domains: MemoryDomain[]; // The participating domains

	// Recurrence evidence
	contextIds: string[]; // Supporting contexts (evidence)
	contextCount: number; // How many contexts support this memory
	firstContextId: string;
	lastContextId: string;

	// Consolidation stats
	totalSessionCount: number; // Sum of member sessions across contexts
	totalEventCount: number;

	// Value/retention signals
	lastSeen: number; // Latest supporting context's endTimestamp
	firstSeen: number; // Earliest supporting context's startTimestamp
	staleness: number; // now - lastSeen (computed at build time)
	strength: number; // Evidence strength: contextCount * min(domainCount, 5)

	// Observed vs inferred — NEVER set to intent
	observation: string; // Template string of observed facts, e.g. "visited github.com and slack.com across 3 activity periods"
	inference: null; // Always null in Phase 4 (no LLM, no intent)
}

export interface MemoryDomain {
	domain: string;
	eventCount: number;
	contextCount: number; // Contexts this domain appeared in
	contextIds: string[]; // Evidence
	firstSeen: number;
	lastSeen: number;
}

export const MEMORY_THRESHOLDS = {
	MEMORY_MIN_CONTEXTS: 2, // contexts needed for a recurrent memory
	MEMORY_SINGLE_CONTEXT_MIN_EVENTS: 500, // events for a single-context memory
	MEMORY_MAX_SIGNATURE_DOMAINS: 6, // domains used in the signature
	MEMORY_STALE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days: staleness threshold
	MEMORY_MAX_MEMORIES: 50, // cap for getMemories()/persist
} as const;

// §4.1 — chain of context ids; single context keeps just its own id
const memoryId = (contextIds: string[]): string =>
	contextIds.length === 1
		? contextIds[0]
		: `${contextIds[0]}-${contextIds[contextIds.length - 1]}`;

const signatureOf = (context: BrowserContext): string => {
	const top = context.domains
		.slice(0, MEMORY_THRESHOLDS.MEMORY_MAX_SIGNATURE_DOMAINS)
		.map((d) => d.domain)
		.sort();
	return top.join("+");
};

// tech.md §5.3 — pure, deterministic, rebuildable
export const buildMemories = (
	contexts: BrowserContext[],
	now = Date.now(),
): Memory[] => {
	const bySignature = new Map<string, BrowserContext[]>();
	for (const context of contexts) {
		const sig = signatureOf(context);
		const group = bySignature.get(sig);
		if (group) {
			group.push(context);
		} else {
			bySignature.set(sig, [context]);
		}
	}

	const memories: Memory[] = [];
	for (const [sig, group] of bySignature) {
		const sorted = [...group].sort(
			(a, b) => a.startTimestamp - b.startTimestamp,
		);

		// Single context: qualify by density
		if (
			sorted.length === 1 &&
			sorted[0].totalEventCount <
				MEMORY_THRESHOLDS.MEMORY_SINGLE_CONTEXT_MIN_EVENTS
		) {
			continue; // too thin to remember
		}

		memories.push(finalizeMemory(sig, sorted, now));
	}

	return memories.sort((a, b) => b.strength - a.strength);
};

const finalizeMemory = (
	sig: string,
	contexts: BrowserContext[],
	now: number,
): Memory => {
	const first = contexts[0];
	const last = contexts[contexts.length - 1];

	const domains = new Map<string, MemoryDomain>();
	for (const context of contexts) {
		for (const d of context.domains) {
			let md = domains.get(d.domain);
			if (!md) {
				md = {
					domain: d.domain,
					eventCount: 0,
					contextCount: 0,
					contextIds: [],
					firstSeen: d.firstSeen,
					lastSeen: d.lastSeen,
				};
				domains.set(d.domain, md);
			}
			md.eventCount += d.eventCount;
			md.contextCount++;
			md.contextIds.push(context.id);
			md.firstSeen = Math.min(md.firstSeen, d.firstSeen);
			md.lastSeen = Math.max(md.lastSeen, d.lastSeen);
		}
	}

	const domainList = Array.from(domains.values()).sort(
		(a, b) => b.eventCount - a.eventCount || a.firstSeen - b.firstSeen,
	);

	const contextIds = contexts.map((c) => c.id);
	const kind = contextIds.length > 1 ? "recurrent" : "single";

	return {
		id: memoryId(contextIds),
		kind,
		startTimestamp: first.startTimestamp,
		endTimestamp: last.endTimestamp,
		signature: sig,
		domains: domainList,
		contextIds,
		contextCount: contextIds.length,
		firstContextId: first.id,
		lastContextId: last.id,
		totalSessionCount: contexts.reduce((sum, c) => sum + c.sessionCount, 0),
		totalEventCount: contexts.reduce((sum, c) => sum + c.totalEventCount, 0),
		lastSeen: last.endTimestamp,
		firstSeen: first.startTimestamp,
		staleness: Math.max(0, now - last.endTimestamp),
		strength: contextIds.length * Math.min(domainList.length, 5),
		observation: `visited ${sig.split("+").join(", ")} across ${contextIds.length} activity ${contextIds.length === 1 ? "period" : "periods"}`,
		inference: null,
	};
};

// --- APIs (tech.md §8.1, Option A: lazy derivation) ---

export const getMemories = async (
	db: TabotDatabase,
	limit = MEMORY_THRESHOLDS.MEMORY_MAX_MEMORIES,
): Promise<Memory[]> => {
	const contexts = await getRecentContexts(db, 500); // bounded read
	const memories = buildMemories(contexts);
	return memories.slice(0, limit);
};

export const getMemoryById = async (
	db: TabotDatabase,
	id: string,
): Promise<Memory | undefined> => {
	const contexts = await getRecentContexts(db, 500);
	return buildMemories(contexts).find((m) => m.id === id);
};

export const getMemoriesBySignature = async (
	db: TabotDatabase,
	signature: string,
): Promise<Memory[]> => {
	const contexts = await getRecentContexts(db, 500);
	return buildMemories(contexts).filter((m) => m.signature === signature);
};
