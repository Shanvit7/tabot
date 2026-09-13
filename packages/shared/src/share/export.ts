// packages/shared/src/share/export.ts
// Canonical Tabot export (docs/export-spec.md, Part C).
// Pure functions over derived layers — no I/O, no chrome APIs — so both the
// web dashboard and the extension popup "Share Context" feed from one builder.

import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "../activities/meaningful-events";
import { type BrowserContext, buildContexts } from "../contexts/contexts";
import type { StoredTabEvent } from "../events/db";
import { buildMemories, type Memory } from "../memories/memories";
import {
	buildLiveContext,
	type LiveBrowserContext,
} from "../recall/live-context";
import {
	findSimilarContextsCore,
	findSimilarMemoriesCore,
} from "../recall/retrieval";
import { type Session, sessionize } from "../sessions/sessions";

export interface Derived {
	events: StoredTabEvent[];
	sessions: Session[];
	contexts: BrowserContext[];
	memories: Memory[];
	live: LiveBrowserContext | null;
}

export const derive = (events: StoredTabEvent[]): Derived => {
	const sessions = sessionize(events);
	const transitions = deriveTransitions(deriveMeaningfulEvents(events));
	const contexts = buildContexts(sessions, transitions);
	const memories = buildMemories(contexts);

	// Live context: current context = most recent, similar = pure cores (no db)
	const currentContext = contexts[contexts.length - 1];
	const relatedContexts = currentContext
		? findSimilarContextsCore(currentContext, contexts, 3)
		: [];
	const relatedMemories = currentContext
		? findSimilarMemoriesCore(currentContext, memories, 3)
		: [];
	const live = buildLiveContext({
		currentContext,
		events,
		relatedContexts,
		relatedMemories,
	});

	return { events, sessions, contexts, memories, live };
};

export const fmtIso = (ts: number): string => new Date(ts).toISOString();

export const EXPORT_THRESHOLDS = {
	session: {
		inactivityThresholdMs: 300000,
		visibilityGapThresholdMs: 120000,
		tabAbsenceThresholdMs: 600000,
		windowCloseThresholdMs: 30000,
	},
	context: {
		gapThresholdMs: 1800000,
		excursionReturnWindowMs: 300000, // excursion bound
		excursionActivityMin: 2,
		consecutiveTransitionCount: 2,
		relationshipEvidenceCutoffMs: 900000,
		maxContextSpanMs: 5400000,
		episodeGapMs: 1800000, // V6: max gap between anchors within one episode
		strongWeight: 0.5, // V6: min edge weight for episode continuity
		// V7 — trajectory-coherence boundary scoring (§4, §8)
		boundary: {
			temporalScaleMs: 300000,
			splitThreshold: 0.5,
			weights: {
				temporal: 0.1,
				graph: 0.2,
				navigation: 0.1,
				interaction: 0.15,
				profile: 0.45,
			},
			minEpisodeDurationMs: 120000,
			minEpisodeEvents: 3,
		},
	},
	memory: {
		minContexts: 2,
		singleContextMinEvents: 500,
		maxSignatureDomains: 6,
		staleMs: 604800000,
		maxMemories: 50,
		// V5 — behavioral similarity (§17, §18) + low-info guard (§16)
		similarityMergeThreshold: 0.65,
		sequenceWeight: 0.2,
		domainWeight: 0.4,
		transitionWeight: 0.1,
		entryExitWeight: 0.05,
		interactionWeight: 0.25,
		recurrenceMinGapMs: 1800000,
	},
} as const;

// --- Export range filter (overlap semantics) ---
// from/to are inclusive epoch-ms bounds; undefined = unbounded.
const overlaps = (
	start: number,
	end: number,
	from?: number,
	to?: number,
): boolean =>
	(from === undefined || end >= from) && (to === undefined || start <= to);

export const filterDerived = (
	d: Derived,
	from?: number,
	to?: number,
): Derived => {
	if (from === undefined && to === undefined) return d;
	const events = d.events.filter((e) =>
		overlaps(e.timestamp, e.timestamp, from, to),
	);
	const sessions = d.sessions.filter((s) =>
		overlaps(s.startTimestamp, s.endTimestamp, from, to),
	);
	const contexts = d.contexts.filter((c) =>
		overlaps(c.startTimestamp, c.endTimestamp, from, to),
	);
	const memories = d.memories.filter((m) =>
		overlaps(m.startTimestamp, m.endTimestamp, from, to),
	);
	return { events, sessions, contexts, memories, live: d.live };
};

export const buildExportJsonl = (d: Derived): string => {
	const eventLines = d.events.map((e) =>
		JSON.stringify({
			record: "event",
			...e, // canonical StoredTabEvent (its own `type` is the event type)
		}),
	);
	const sessionLines = d.sessions.map((s) =>
		JSON.stringify({
			record: "session",
			...s,
		}),
	);
	const contextLines: string[] = [];
	const episodeLines: string[] = [];
	for (const c of d.contexts) {
		contextLines.push(
			JSON.stringify({
				record: "context",
				...c,
			}),
		);
		// V7 — episode records carry per-episode boundary diagnostics (§11) so
		// the evaluation can inspect WHY each boundary split/merged.
		for (const e of c.episodes ?? []) {
			episodeLines.push(
				JSON.stringify({
					record: "episode",
					...e,
				}),
			);
		}
	}
	const memoryLines = d.memories.map((m) =>
		JSON.stringify({
			record: "memory",
			...m, // canonical Memory (its own `kind` is single|recurrent)
		}),
	);

	const manifest = {
		manifest: {
			format: "tabot-export",
			version: 1,
			exportedAt: new Date().toISOString(),
			source: "tabot-web@0.1.0",
			telemetrySchemaVersion: 1,
			derivationSchemaVersion: 8,
			graph: {
				enabled: true,
				nodeGranularity: "activity-anchor",
				relationshipCutoffMs: 900000,
				algorithm: "trajectory-coherence-boundary",
			},
			segmentation: {
				enabled: true,
				signal: "local-trajectory-coherence",
				weights: {
					temporal: 0.1,
					graph: 0.2,
					navigation: 0.1,
					interaction: 0.15,
					profile: 0.45,
				},
				temporalScaleMs: 300000,
				splitThreshold: 0.5,
			},
			thresholds: EXPORT_THRESHOLDS,
			counts: {
				events: d.events.length,
				sessions: d.sessions.length,
				contexts: d.contexts.length,
				episodes: d.contexts.reduce(
					(sum, c) => sum + (c.episodes?.length ?? 0),
					0,
				),
				memories: d.memories.length,
			},
			coverage: {
				firstEventAt:
					d.events.length > 0 ? fmtIso(d.events[0].timestamp) : undefined,
				lastEventAt:
					d.events.length > 0
						? fmtIso(d.events[d.events.length - 1].timestamp)
						: undefined,
			},
		},
	};

	return [
		JSON.stringify(manifest),
		...eventLines,
		...sessionLines,
		...contextLines,
		...episodeLines,
		...memoryLines,
	].join("\n");
};
