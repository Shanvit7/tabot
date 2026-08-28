// packages/shared/src/memories.ts
// Phase 4 + V7 — Contexts → Memories (docs/tech.md, Downloads/prompt.md §13-25)
// Pure derivation layer: BrowserContext[] in, Memory[] out. No persistence, no LLM.
//
// V7 — a memory is a RECURRING BEHAVIORAL PATTERN across activity episodes, not
// an exact domain-set that happened more than once. Identity is a behavioral
// fingerprint (ordered origin sequence + domain weights + interaction profile +
// entry/exit), similarity is sequence-aware (normalized Levenshtein over
// tokenized origins + domain overlap + transition overlap + entry/exit match),
// and recurrence requires separate temporal occurrences.

import { type BrowserContext, getRecentContexts } from "./contexts";
import type { TabotDatabase } from "./db";

// --- Behavioral fingerprint (§15) ---

export interface BehaviorFingerprint {
	domains: Array<{ domain: string; weight: number }>; // weighted domain set
	pageKeys: string[]; // weighted page set (first-occurrence order)
	orderedOrigins: string[]; // tokenized origin sequence (A → B → C)
	orderedTransitions: string[]; // tokenized transition sequence (A→B, B→C)
	interactionProfile: {
		duration: number; // ms
		eventDensity: number; // events / (duration+1s)
		navigationRate: number; // navigations / events
		interactionRate: number; // interactions / events
	};
	entryOrigin?: string; // first origin
	exitOrigin?: string; // last origin
}

export interface Memory {
	id: string; // `${firstContextId}-${lastContextId}`
	kind: "single" | "recurrent";

	startTimestamp: number; // first occurrence
	endTimestamp: number; // last occurrence

	// Behavioral identity (V7)
	signature: string; // legacy diagnostic — top-6 domain signature (NOT the primary identity)
	fingerprint: BehaviorFingerprint; // the behavioral pattern
	sequence?: string[]; // ordered merged pageKey sequence (first-occurrence)

	// Recurrence evidence (§19, §22)
	occurrences: MemoryOccurrence[]; // individual occurrences, preserved (§22)
	contextIds: string[]; // supporting contexts (evidence)
	contextCount: number;
	firstContextId: string;
	lastContextId: string;

	// Consolidation stats
	totalSessionCount: number;
	totalEventCount: number;

	// Value/retention signals
	lastSeen: number;
	firstSeen: number;
	staleness: number; // now - lastSeen
	strength: number; // evidence-derived (§23)

	// Confidence + evidence (§24)
	confidence: number;
	evidence: {
		occurrenceCount: number;
		temporalSpreadMs: number;
		similarityScores: number[]; // pairwise similarity of occurrences to the pattern
		sharedSequenceTokens: number; // distinct shared origin tokens
		sharedDomains: number; // distinct shared domains
	};

	observation: string; // evidence summary, never intent (§25)
	inference: null; // always null (no LLM, no intent)
}

export interface MemoryOccurrence {
	contextId: string;
	startTimestamp: number;
	endTimestamp: number;
	domains: string[]; // the occurrence's domains
	sequence: string[]; // the occurrence's ordered pageKeys
}

export interface MemoryDomain {
	domain: string;
	eventCount: number;
	contextCount: number;
	contextIds: string[];
	firstSeen: number;
	lastSeen: number;
}

export const MEMORY_THRESHOLDS = {
	MEMORY_MIN_CONTEXTS: 2, // contexts needed for a recurrent memory
	MEMORY_SINGLE_CONTEXT_MIN_EVENTS: 500, // events for a single-context memory
	MEMORY_MAX_SIGNATURE_DOMAINS: 6, // legacy diagnostic signature cap
	MEMORY_STALE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
	MEMORY_MAX_MEMORIES: 50,
	// V7 — behavioral similarity thresholds
	SIMILARITY_MERGE_THRESHOLD: 0.65, // min combined similarity to consolidate
	SEQUENCE_WEIGHT: 0.2, // ordered-origin sequence similarity weight
	DOMAIN_WEIGHT: 0.4, // domain Jaccard weight (primary for reorder tolerance)
	TRANSITION_WEIGHT: 0.1, // transition similarity (set = same trail reordered)
	ENTRY_EXIT_WEIGHT: 0.05, // entry/exit origin match weight
	INTERACTION_WEIGHT: 0.25, // interaction-profile similarity weight
	RECURRENCE_MIN_GAP_MS: 30 * 60 * 1000, // min separation between occurrences
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

// §15 — compact behavioral fingerprint from a context's episode anchors.
export const fingerprintOf = (context: BrowserContext): BehaviorFingerprint => {
	const domains = context.domains.map((d) => ({
		domain: d.domain,
		weight: d.eventCount,
	}));

	// ordered origins: from the context's sequence (pageKeys with origins) or
	// the episodes' domains. Tokenized (origin only, no path) per §17.
	const orderedOrigins: string[] = [];
	const pageKeys: string[] = [];
	for (const key of context.sequence ?? []) {
		if (!pageKeys.includes(key)) pageKeys.push(key);
		const origin = originOf(key);
		if (origin !== "" && !orderedOrigins.includes(origin))
			orderedOrigins.push(origin);
	}
	// fallback: episodes' primary domains in chronological order
	if (orderedOrigins.length === 0) {
		for (const ep of context.episodes ?? []) {
			for (const d of ep.domains) {
				if (!orderedOrigins.includes(d)) orderedOrigins.push(d);
			}
		}
	}
	// last resort: context domains by firstSeen
	if (orderedOrigins.length === 0) {
		for (const d of [...context.domains].sort(
			(a, b) => a.firstSeen - b.firstSeen,
		)) {
			if (!orderedOrigins.includes(d.domain)) orderedOrigins.push(d.domain);
		}
	}

	const orderedTransitions: string[] = [];
	for (let i = 0; i < orderedOrigins.length - 1; i++) {
		orderedTransitions.push(`${orderedOrigins[i]}→${orderedOrigins[i + 1]}`);
	}

	const duration = Math.max(1, context.duration);
	const events = Math.max(1, context.totalEventCount);

	return {
		domains,
		pageKeys,
		orderedOrigins,
		orderedTransitions,
		interactionProfile: {
			duration,
			eventDensity: events / (duration / 1000 + 1),
			navigationRate: context.totalNavigationCount / events,
			interactionRate: context.totalInteractionCount / events,
		},
		entryOrigin: orderedOrigins[0],
		exitOrigin: orderedOrigins[orderedOrigins.length - 1],
	};
};

const originOf = (pageKey: string): string => {
	try {
		return new URL(pageKey).origin;
	} catch {
		return "";
	}
};

// --- Similarity (§17, §18) ---

const jaccard = <T>(a: T[], b: T[]): number => {
	if (a.length === 0 && b.length === 0) return 1;
	const setB = new Set(b);
	const intersection = a.filter((x) => setB.has(x)).length;
	const union = new Set([...a, ...b]).size;
	return union === 0 ? 1 : intersection / union;
};

// §17 — normalized Levenshtein over a TOKENIZED origin sequence. The prompt
// says tokenize first (origin tokens, not URL characters): each origin is one
// token, so a shifted/reordered trail scores partial similarity instead of 0.
// fastest-levenshtein operates on strings char-by-char, which is wrong for
// token sequences ("deepseek\u0000google" vs "google\u0000amboras" would score
// 0 despite one shared token). This is the standard token-level Levenshtein DP
// over the already-tokenized origins.
const tokenLevenshtein = (a: string[], b: string[]): number => {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		new Array<number>(n + 1).fill(0),
	);
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(
				dp[i - 1][j] + 1, // deletion
				dp[i][j - 1] + 1, // insertion
				dp[i - 1][j - 1] + cost, // substitution
			);
		}
	}
	return dp[m][n];
};

const sequenceSimilarity = (a: string[], b: string[]): number => {
	if (a.length === 0 || b.length === 0) return a.length === b.length ? 1 : 0;
	const maxLen = Math.max(a.length, b.length);
	const dist = tokenLevenshtein(a, b);
	return Math.max(0, 1 - dist / maxLen);
};

const close = (a: number, b: number): number =>
	1 - Math.min(1, Math.abs(a - b));

// §18 — combined behavioral similarity, components independently inspectable.
export const behavioralSimilarity = (
	a: BehaviorFingerprint,
	b: BehaviorFingerprint,
): number => {
	const aDomains = a.domains.map((d) => d.domain);
	const bDomains = b.domains.map((d) => d.domain);
	const domainSim = jaccard(aDomains, bDomains);

	// domain-containment guard (§31): a strict superset with a substantial extra
	// domain is a DIFFERENT behavior (e.g. github+slack vs github+slack+jira —
	// the jira session is not the same pattern). Identical/near-identical sets
	// pass; only a strict superset with >=1 extra domain blocks.
	const smaller = aDomains.length <= bDomains.length ? aDomains : bDomains;
	const larger = aDomains.length <= bDomains.length ? bDomains : aDomains;
	const extraDomains = larger.filter((d) => !smaller.includes(d)).length;
	const containmentBlock =
		extraDomains > 0 &&
		extraDomains / larger.length >= 0.25 &&
		larger.length > smaller.length;

	const seqSim = sequenceSimilarity(a.orderedOrigins, b.orderedOrigins);
	// transition similarity: ordered (positional) + set (reordering-tolerant —
	// the same discovery trail in a different order is behaviorally similar
	// even though the ordered Levenshtein scores it low, §13).
	const transitionOrderedSim = sequenceSimilarity(
		a.orderedTransitions,
		b.orderedTransitions,
	);
	const transitionSetSim = jaccard(a.orderedTransitions, b.orderedTransitions);
	const transitionSim = transitionOrderedSim * 0.5 + transitionSetSim * 0.5;
	const entryExitSim =
		(a.entryOrigin === b.entryOrigin ? 0.5 : 0) +
		(a.exitOrigin === b.exitOrigin ? 0.5 : 0);
	const interactionSim =
		close(
			a.interactionProfile.navigationRate,
			b.interactionProfile.navigationRate,
		) *
			0.5 +
		close(
			a.interactionProfile.interactionRate,
			b.interactionProfile.interactionRate,
		) *
			0.5;

	const T = MEMORY_THRESHOLDS;
	const raw =
		seqSim * T.SEQUENCE_WEIGHT +
		domainSim * T.DOMAIN_WEIGHT +
		transitionSim * T.TRANSITION_WEIGHT +
		entryExitSim * T.ENTRY_EXIT_WEIGHT +
		interactionSim * T.INTERACTION_WEIGHT;

	// same-trail rule: when the ordered origin sequences are (nearly) identical,
	// the behavior IS the same pattern — interaction/rate differences are just
	// reading-depth noise (a 2-event glance vs a 70-event deep read of the same
	// site). Floor the result so identical trails always consolidate (§14:
	// sequence similarity is the strongest behavioral evidence).
	if (seqSim >= 0.9) return Math.max(raw, 0.75);

	return containmentBlock ? Math.min(raw, 0.5) : raw;
};

// §21 — hard invariant: a fingerprint with no behavioral identity creates no
// memory.
const hasIdentity = (fp: BehaviorFingerprint): boolean =>
	fp.domains.length > 0 || fp.orderedOrigins.length > 0;

// §16 — low-information memory guard: a memory must represent a RECURRING
// BEHAVIOR, not repeated presence of a common site. Reject candidates that are:
//  - a single generic origin (Google / ChatGPT / Yahoo / newtab / …)
//  - a single origin with no transition structure
//  - empty identity (already caught by hasIdentity)
// A single origin IS acceptable when it is a distinctive (non-generic) site
// with meaningful volume — e.g. a localhost app the user actually works in.
const GENERIC_SITES = new Set([
	"www.google.com",
	"google.com",
	"www.google.co.in",
	"chatgpt.com",
	"www.chatgpt.com",
	"search.yahoo.com",
	"www.youtube.com",
	"youtube.com",
	"newtab",
	"",
]);

// origins/domains are full URLs (https://www.google.com) — compare hostname
const hostOf = (origin: string): string => {
	try {
		const u = new URL(origin);
		return u.hostname;
	} catch {
		return origin.replace(/^https?:\/\//, "");
	}
};

const isMeaningfulBehavior = (fp: BehaviorFingerprint): boolean => {
	const origins = fp.orderedOrigins;
	if (origins.length === 0 && fp.domains.length === 0) return false; // empty
	if (origins.length === 1 && fp.orderedTransitions.length === 0) {
		// single-token pattern — only meaningful if the site is NOT generic
		const only = origins[0];
		if (GENERIC_SITES.has(hostOf(only))) return false;
	}
	// multi-token patterns pass (a Google→GitHub→YC→Amboras trail is behavior)
	return true;
};

// §19 — recurrence requires separate temporal occurrences: a candidate must be
// separated from AT LEAST ONE existing occurrence by the min gap (not from the
// last one — a dense cluster of visits today plus a visit last week is still
// recurrence; the dense pair alone must not block the cluster).
const isSeparateOccurrence = (
	candidate: BrowserContext,
	cluster: BrowserContext[],
): boolean =>
	cluster.some(
		(member) =>
			Math.abs(candidate.startTimestamp - member.startTimestamp) >=
			MEMORY_THRESHOLDS.RECURRENCE_MIN_GAP_MS,
	);

// --- Build (§20) ---

export const buildMemories = (
	contexts: BrowserContext[],
	now = Date.now(),
): Memory[] => {
	// group candidate occurrences by behavioral similarity (not exact signature)
	const clusters: BrowserContext[][] = [];
	const contextWithFp = contexts.map((c) => ({ c, fp: fingerprintOf(c) }));

	for (const { c, fp } of contextWithFp) {
		if (!hasIdentity(fp)) continue; // §21: no identity → no memory
		if (!isMeaningfulBehavior(fp)) continue; // §16: low-info → no memory

		// find the best-matching existing cluster
		let bestCluster: BrowserContext[] | null = null;
		let bestScore = 0;
		for (const cluster of clusters) {
			// representative: average similarity to the cluster's members
			const sims = cluster.map((member) =>
				behavioralSimilarity(fp, fingerprintOf(member)),
			);
			const avg = sims.reduce((s, x) => s + x, 0) / sims.length;
			if (
				avg >= MEMORY_THRESHOLDS.SIMILARITY_MERGE_THRESHOLD &&
				avg > bestScore
			) {
				bestScore = avg;
				bestCluster = cluster;
			}
		}

		if (bestCluster && isSeparateOccurrence(c, bestCluster)) {
			bestCluster.push(c);
		} else if (bestCluster) {
			// same behavioral pattern, but NOT a separate temporal occurrence
			// (adjacent in time — the segmentation fragmented one occurrence into
			// several contexts). It still belongs to the memory; it just does not
			// add a NEW occurrence. We keep it in the cluster (finalizeMemory
			// folds temporally-adjacent members into one occurrence) — creating a
			// separate cluster would duplicate the same memory (§15).
			bestCluster.push(c);
		} else {
			clusters.push([c]);
		}
	}

	const memories: Memory[] = [];
	for (const cluster of clusters) {
		const sorted = [...cluster].sort(
			(a, b) => a.startTimestamp - b.startTimestamp,
		);
		// one occurrence = one visit (fragmented contexts of the same visit are
		// temporally adjacent). A single visit must be dense to be remembered
		// (§MEMORY_SINGLE_CONTEXT_MIN_EVENTS); a 2-event linkedin glance is not
		// a memory.
		const span =
			sorted[sorted.length - 1].endTimestamp - sorted[0].startTimestamp;
		const singleOccurrence = span < MEMORY_THRESHOLDS.RECURRENCE_MIN_GAP_MS;
		const totalEvents = sorted.reduce((s, c) => s + c.totalEventCount, 0);
		if (
			singleOccurrence &&
			totalEvents < MEMORY_THRESHOLDS.MEMORY_SINGLE_CONTEXT_MIN_EVENTS
		) {
			continue; // one thin visit — too weak to remember
		}
		memories.push(finalizeMemory(sorted, now));
	}

	return memories.sort((a, b) => b.strength - a.strength);
};

const finalizeMemory = (contexts: BrowserContext[], now: number): Memory => {
	const first = contexts[0];
	const last = contexts[contexts.length - 1];

	// primary fingerprint = the first occurrence's (the pattern's canonical form)
	const primaryFp = fingerprintOf(first);

	const contextIds = contexts.map((c) => c.id);

	// §22 — occurrences preserved individually, but temporally-adjacent members
	// (within RECURRENCE_MIN_GAP_MS) of the same pattern are ONE occurrence —
	// the segmentation fragmented a single visit into several contexts. Fold
	// them so occurrence count reflects true recurrences, not fragments.
	const rawOccurrences: Array<{
		c: BrowserContext;
		start: number;
		end: number;
	}> = contexts.map((c) => ({
		c,
		start: c.startTimestamp,
		end: c.endTimestamp,
	}));
	const occurrences: MemoryOccurrence[] = [];
	const occContexts: BrowserContext[][] = [];
	for (const occ of rawOccurrences) {
		const prev = occContexts[occContexts.length - 1];
		if (
			prev &&
			occ.start - (prev[prev.length - 1].endTimestamp ?? occ.start) <
				MEMORY_THRESHOLDS.RECURRENCE_MIN_GAP_MS
		) {
			prev.push(occ.c);
		} else {
			occContexts.push([occ.c]);
		}
	}
	for (const group of occContexts) {
		const firstC = group[0];
		const lastC = group[group.length - 1];
		const doms = new Set<string>();
		const seq: string[] = [];
		for (const c of group) {
			for (const d of c.domains) doms.add(d.domain);
			for (const s of c.sequence ?? []) if (!seq.includes(s)) seq.push(s);
		}
		occurrences.push({
			contextId: `${firstC.id}..${lastC.id}`,
			startTimestamp: firstC.startTimestamp,
			endTimestamp: lastC.endTimestamp,
			domains: [...doms],
			sequence: seq,
		});
	}

	// §15 — recurrence requires SEPARATE OCCURRENCES. Fragmented contexts of the
	// same visit fold into one occurrence; a memory with a single occurrence is
	// single, not recurrent (regardless of how many context fragments it has).
	const kind = occurrences.length > 1 ? "recurrent" : "single";

	// merged ordered sequence (first-occurrence, deduped)
	const sequence: string[] = [];
	for (const c of contexts) {
		for (const key of c.sequence ?? []) {
			if (!sequence.includes(key)) sequence.push(key);
		}
	}

	// §24 — confidence + evidence
	const similarityScores = occurrences.slice(1).map((o) => {
		const occContext = contexts.find((c) =>
			o.contextId.startsWith(c.id.split("..")[0]),
		);
		return behavioralSimilarity(
			primaryFp,
			fingerprintOf(occContext ?? contexts[0]),
		);
	});
	const sharedSequenceTokens = new Set(
		primaryFp.orderedOrigins.filter((o) =>
			contexts.some((c) => fingerprintOf(c).orderedOrigins.includes(o)),
		),
	).size;
	const sharedDomains = new Set(
		primaryFp.domains
			.map((d) => d.domain)
			.filter((d) =>
				contexts.some((c) => c.domains.some((cd) => cd.domain === d)),
			),
	).size;

	const temporalSpread = last.startTimestamp - first.startTimestamp;
	const confidence = Math.min(
		1,
		(contextIds.length / MEMORY_THRESHOLDS.MEMORY_MIN_CONTEXTS) * 0.5 +
			(similarityScores.length > 0
				? (similarityScores.reduce((s, x) => s + x, 0) /
						similarityScores.length) *
					0.5
				: 0.5),
	);

	// §23 — strength = recurrenceEvidence × similarityConfidence × recencyFactor
	const recurrenceEvidence = Math.min(1, contextIds.length / 4);
	const similarityConfidence = confidence;
	const recencyFactor = Math.max(
		0.1,
		1 - stalenessOf(last, now) / (30 * 24 * 60 * 60 * 1000),
	);
	const strength = recurrenceEvidence * similarityConfidence * recencyFactor;

	const observation = buildObservation(
		primaryFp,
		occurrences,
		similarityScores,
	);

	const memory: Memory = {
		id: memoryId(contextIds),
		kind,
		startTimestamp: first.startTimestamp,
		endTimestamp: last.endTimestamp,
		signature: signatureOf(first),
		fingerprint: primaryFp,
		occurrences,
		contextIds,
		contextCount: contextIds.length,
		firstContextId: first.id,
		lastContextId: last.id,
		totalSessionCount: contexts.reduce((sum, c) => sum + c.sessionCount, 0),
		totalEventCount: contexts.reduce((sum, c) => sum + c.totalEventCount, 0),
		lastSeen: last.endTimestamp,
		firstSeen: first.startTimestamp,
		staleness: stalenessOf(last, now),
		strength,
		confidence,
		evidence: {
			occurrenceCount: occurrences.length,
			temporalSpreadMs: temporalSpread,
			similarityScores,
			sharedSequenceTokens,
			sharedDomains,
		},
		observation,
		inference: null,
	};
	if (sequence.length > 0) memory.sequence = sequence;
	return memory;
};

const stalenessOf = (context: BrowserContext, now: number): number =>
	Math.max(0, now - context.endTimestamp);

// §25 — observation is an evidence summary, never intent.
const buildObservation = (
	fp: BehaviorFingerprint,
	occurrences: MemoryOccurrence[],
	similarityScores: number[],
): string => {
	const seqStr =
		fp.orderedOrigins.length > 0
			? fp.orderedOrigins.map((o) => o.replace(/^https?:\/\//, "")).join(" → ")
			: "";
	const parts: string[] = [];
	if (seqStr) parts.push(`Recurring sequence: ${seqStr}`);
	parts.push(
		`Observed in: ${occurrences.length} separate activity ${occurrences.length === 1 ? "period" : "periods"}`,
	);
	if (fp.orderedTransitions.length > 0) {
		parts.push(
			`Common transitions: ${fp.orderedTransitions.slice(0, 3).join(", ")}`,
		);
	}
	const confidence =
		similarityScores.length > 0
			? Math.min(
					1,
					similarityScores.reduce((s, x) => s + x, 0) / similarityScores.length,
				)
			: 0.5;
	parts.push(`Confidence: ${confidence.toFixed(2)}`);
	return parts.join("\n");
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
