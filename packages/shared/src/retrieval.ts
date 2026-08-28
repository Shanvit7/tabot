// packages/shared/src/retrieval.ts
// Phase 5 — Memories → Retrieval (docs/tech.md)
// Query primitives + composites over the derived layer. No LLM, no persistence.

import type { BrowserContext, ContextDomain } from "./contexts";
import { getContextById, getContexts, getRecentContexts } from "./contexts";
import type { TabotDatabase } from "./db";
import { getMemories, getMemoriesBySignature, type Memory } from "./memories";

// --- Result types (tech.md §4.3, §5) ---

export interface SimilarContextResult {
	context: BrowserContext;
	similarity: number; // Jaccard index [0, 1]
	sharedDomains: string[]; // intersection
}

export interface SimilarMemoryResult {
	memory: Memory;
	similarity: number; // Jaccard index [0, 1]
	sharedDomains: string[];
}

export interface ContextSummary {
	context: BrowserContext;
	observation: string; // e.g. "visited github.com, slack.com across 3 sessions"
	domainList: string[]; // sorted by eventCount
	eventDensity: number; // events / duration (activity intensity)
}

export interface RecurrenceReport {
	isRecurrent: boolean;
	memory?: Memory; // if found
	similarMemories?: SimilarMemoryResult[]; // partial overlaps (top 3)
}

export interface TimelineEntry {
	context: BrowserContext;
	isRecurrent: boolean;
	memoryId?: string; // if recurrent
}

export interface DomainHistoryReport {
	domain: string;
	contexts: BrowserContext[];
	memories: Memory[]; // memories where this domain appears
	totalEvents: number;
	firstSeen: number;
	lastSeen: number;
}

// --- Jaccard similarity (tech.md §8.3) ---

export const jaccardIndex = (a: Set<string>, b: Set<string>): number => {
	if (a.size === 0 && b.size === 0) return 0;
	const intersection = new Set([...a].filter((x) => b.has(x)));
	const union = new Set([...a, ...b]);
	return intersection.size / union.size;
};

const domainSet = (context: BrowserContext): Set<string> =>
	new Set(context.domains.map((d) => d.domain));

const memoryDomainSet = (memory: Memory): Set<string> =>
	new Set(memory.signature.split("+"));

const sharedDomains = (a: Set<string>, b: Set<string>): string[] =>
	[...a].filter((x) => b.has(x)).sort();

// --- Pure cores (testable without a db) ---

export const contextSignature = (context: BrowserContext): string =>
	[...domainSet(context)].sort().join("+");

export const findSimilarContextsCore = (
	target: BrowserContext,
	candidates: BrowserContext[],
	limit = 5,
): SimilarContextResult[] => {
	const targetDomains = domainSet(target);
	const results: SimilarContextResult[] = [];
	for (const context of candidates) {
		if (context.id === target.id) continue; // exclude self
		const other = domainSet(context);
		const similarity = jaccardIndex(targetDomains, other);
		if (similarity > 0) {
			results.push({
				context,
				similarity,
				sharedDomains: sharedDomains(targetDomains, other),
			});
		}
	}
	return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
};

export const findSimilarMemoriesCore = (
	target: BrowserContext,
	memories: Memory[],
	limit = 5,
): SimilarMemoryResult[] => {
	const targetDomains = domainSet(target);
	const results: SimilarMemoryResult[] = [];
	for (const memory of memories) {
		const other = memoryDomainSet(memory);
		const similarity = jaccardIndex(targetDomains, other);
		if (similarity > 0) {
			results.push({
				memory,
				similarity,
				sharedDomains: sharedDomains(targetDomains, other),
			});
		}
	}
	return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
};

export const summarizeContextCore = (
	context: BrowserContext,
): ContextSummary => {
	const domainList = [...context.domains]
		.sort((a, b) => b.eventCount - a.eventCount)
		.map((d) => d.domain);
	const duration = context.endTimestamp - context.startTimestamp;
	const eventDensity = duration > 0 ? context.totalEventCount / duration : 0;

	return {
		context,
		observation: `visited ${domainList.join(", ")} across ${context.sessionCount} session${context.sessionCount === 1 ? "" : "s"}`,
		domainList,
		eventDensity,
	};
};

export const annotateTimelineCore = (
	contexts: BrowserContext[],
	memories: Memory[],
): TimelineEntry[] => {
	const signatureToMemory = new Map(memories.map((m) => [m.signature, m]));
	return contexts.map((context) => {
		const memory = signatureToMemory.get(contextSignature(context));
		return {
			context,
			isRecurrent: memory?.kind === "recurrent",
			memoryId: memory?.kind === "recurrent" ? memory.id : undefined,
		};
	});
};

// --- Temporal primitives (tech.md §4.1) ---

export const getRecentActivity = async (
	db: TabotDatabase,
	limit = 10,
): Promise<BrowserContext[]> => {
	const contexts = await getRecentContexts(db, limit);
	return [...contexts].reverse(); // latest first
};

export const getActivityToday = async (
	db: TabotDatabase,
): Promise<BrowserContext[]> => {
	const now = Date.now();
	const startOfDay = new Date(now).setHours(0, 0, 0, 0);
	const contexts = await getContexts(db, startOfDay, now);
	return contexts.filter((c) => c.startTimestamp >= startOfDay);
};

export const getActivityBetween = async (
	db: TabotDatabase,
	start: number,
	end: number,
): Promise<BrowserContext[]> => {
	return getContexts(db, start, end);
};

// --- Domain primitives (tech.md §4.2) ---

export const getDomainsInContext = async (
	db: TabotDatabase,
	contextId: string,
): Promise<ContextDomain[]> => {
	const context = await getContextById(db, contextId);
	return context?.domains ?? [];
};

export const getContextsWithDomain = async (
	db: TabotDatabase,
	domain: string,
	limit = 20,
): Promise<BrowserContext[]> => {
	const contexts = await getRecentContexts(db, 500); // bounded read
	return contexts
		.filter((c) => c.domains.some((d) => d.domain === domain))
		.slice(-limit);
};

export const findMemoryBySignature = async (
	db: TabotDatabase,
	signature: string,
): Promise<Memory | undefined> => {
	const memories = await getMemoriesBySignature(db, signature);
	return memories[0];
};

export const getMemoryHistoryForDomain = async (
	db: TabotDatabase,
	domain: string,
): Promise<Memory[]> => {
	const memories = await getMemories(db);
	return memories.filter((m) =>
		m.fingerprint.domains.some((d) => d.domain === domain),
	);
};

// --- Similarity primitives (tech.md §4.3) ---

export const findSimilarContexts = async (
	db: TabotDatabase,
	contextId: string,
	limit = 5,
): Promise<SimilarContextResult[]> => {
	const target = await getContextById(db, contextId);
	if (!target) return [];
	const contexts = await getRecentContexts(db, 500);
	return findSimilarContextsCore(target, contexts, limit);
};

export const findSimilarMemories = async (
	db: TabotDatabase,
	contextId: string,
	limit = 5,
): Promise<SimilarMemoryResult[]> => {
	const target = await getContextById(db, contextId);
	if (!target) return [];
	const memories = await getMemories(db);
	return findSimilarMemoriesCore(target, memories, limit);
};

// --- Current-context primitives (tech.md §4.4) ---

export const getCurrentContext = async (
	db: TabotDatabase,
): Promise<BrowserContext | undefined> => {
	const contexts = await getRecentContexts(db, 1);
	return contexts[0];
};

export const getPreviousContext = async (
	db: TabotDatabase,
	currentContextId: string,
): Promise<BrowserContext | undefined> => {
	const contexts = await getContexts(db);
	const index = contexts.findIndex((c) => c.id === currentContextId);
	if (index <= 0) return undefined;
	return contexts[index - 1];
};

export const isDomainNovel = async (
	db: TabotDatabase,
	domain: string,
	lookbackDays = 7,
): Promise<boolean> => {
	const now = Date.now();
	const start = now - lookbackDays * 24 * 60 * 60 * 1000;
	const contexts = await getContexts(db, start, now);
	return !contexts.some((c) => c.domains.some((d) => d.domain === domain));
};

export const isSignatureRecurrent = async (
	db: TabotDatabase,
	signature: string,
): Promise<boolean> => {
	const memory = await findMemoryBySignature(db, signature);
	return memory?.kind === "recurrent";
};

// --- Composite queries (tech.md §5) ---

export const summarizeContext = async (
	db: TabotDatabase,
	contextId: string,
): Promise<ContextSummary | undefined> => {
	const context = await getContextById(db, contextId);
	return context ? summarizeContextCore(context) : undefined;
};

export const reportRecurrence = async (
	db: TabotDatabase,
	contextId: string,
): Promise<RecurrenceReport> => {
	const context = await getContextById(db, contextId);
	if (!context) {
		return { isRecurrent: false, similarMemories: [] };
	}

	const signature = contextSignature(context);
	const memory = await findMemoryBySignature(db, signature);
	const similarMemories = await findSimilarMemories(db, contextId, 3);

	return {
		isRecurrent: memory?.kind === "recurrent",
		memory,
		similarMemories,
	};
};

export const getActivityTimeline = async (
	db: TabotDatabase,
	hours = 24,
): Promise<TimelineEntry[]> => {
	const contexts = await getRecentContexts(db, 500);
	const now = Date.now();
	const windowStart = now - hours * 60 * 60 * 1000;
	const inWindow = contexts
		.filter((c) => c.startTimestamp >= windowStart)
		.sort((a, b) => a.startTimestamp - b.startTimestamp);

	const memories = await getMemories(db);
	return annotateTimelineCore(inWindow, memories);
};

export const getDomainHistory = async (
	db: TabotDatabase,
	domain: string,
): Promise<DomainHistoryReport> => {
	const contexts = await getContextsWithDomain(db, domain, 100);
	const memories = await getMemoryHistoryForDomain(db, domain);

	const totalEvents = contexts.reduce(
		(sum, c) =>
			sum + (c.domains.find((d) => d.domain === domain)?.eventCount ?? 0),
		0,
	);

	return {
		domain,
		contexts,
		memories,
		totalEvents,
		firstSeen: contexts.length > 0 ? contexts[0].startTimestamp : 0,
		lastSeen:
			contexts.length > 0 ? contexts[contexts.length - 1].endTimestamp : 0,
	};
};
