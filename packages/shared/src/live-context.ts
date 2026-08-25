// packages/shared/src/liveContext.ts
// Phase 6 — Live Browser Context (docs/tech.md)
// A compact, continuously-updated snapshot of the user's current browser state.
// Combines the derived layer (current context, related contexts/memories) with the
// event stream (active tab/window, current URL, recent navigations). No LLM, no persistence.

import type { BrowserContext } from "./contexts";
import type { StoredTabEvent, TabotDatabase } from "./db";
import {
	findSimilarContexts,
	findSimilarMemories,
	getCurrentContext,
	type SimilarContextResult,
	type SimilarMemoryResult,
} from "./retrieval";

export interface LiveBrowserContext {
	// Current state
	currentContext?: BrowserContext; // most recent context (undefined if no contexts yet)
	activeTabId: number; // from last TAB_ACTIVATED event
	activeWindowId: number; // from last TAB_ACTIVATED event
	currentUrl?: string; // from last NAVIGATION event

	// Activity signals
	interactionIntensity: number; // events/min in current context (0 if no context)
	recentNavigations: string[]; // last N URLs (newest first)

	// Historical context
	relatedContexts: SimilarContextResult[]; // top-3 similar to current
	relatedMemories: SimilarMemoryResult[]; // top-3 similar to current

	// Evidence & confidence
	evidence: {
		eventCount: number; // total events in current context
		sessionCount: number; // sessions in current context
		staleness: number; // now - currentContext.endTimestamp (ms; 0 if no context)
	};

	// Metadata
	computedAt: number; // timestamp when this snapshot was computed
}

// --- Pure core (tech.md §5.1, testable without a db) ---

export const buildLiveContext = (params: {
	currentContext: BrowserContext | undefined;
	events: StoredTabEvent[];
	relatedContexts: SimilarContextResult[];
	relatedMemories: SimilarMemoryResult[];
	now?: number;
	navigationLimit?: number;
}): LiveBrowserContext => {
	const {
		currentContext,
		events,
		relatedContexts,
		relatedMemories,
		now = Date.now(),
		navigationLimit = 10,
	} = params;

	// Active tab/window from last TAB_ACTIVATED
	const lastActivated = events
		.filter((e) => e.type === "TAB_ACTIVATED")
		.sort((a, b) => b.timestamp - a.timestamp)[0];
	const activeTabId = lastActivated?.tabId ?? 0;
	const activeWindowId = lastActivated?.windowId ?? 0;

	// Current URL from last NAVIGATION
	const lastNavigation = events
		.filter((e) => e.type === "NAVIGATION" && e.url)
		.sort((a, b) => b.timestamp - a.timestamp)[0];
	const currentUrl = lastNavigation?.url;

	// Interaction intensity (events/min)
	const interactionIntensity =
		currentContext && currentContext.duration > 0
			? currentContext.totalInteractionCount / (currentContext.duration / 60000)
			: 0;

	// Recent navigations (newest first, bounded)
	const recentNavigations = events
		.filter((e) => e.type === "NAVIGATION" && e.url)
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, navigationLimit)
		.map((e) => e.url ?? "");

	return {
		currentContext,
		activeTabId,
		activeWindowId,
		currentUrl,
		interactionIntensity,
		recentNavigations,
		relatedContexts,
		relatedMemories,
		evidence: {
			eventCount: currentContext?.totalEventCount ?? 0,
			sessionCount: currentContext?.sessionCount ?? 0,
			staleness: currentContext ? now - currentContext.endTimestamp : 0,
		},
		computedAt: now,
	};
};

// --- Main entry point (tech.md §5.2, db adapter) ---

export const getCurrentBrowserContext = async (
	db: TabotDatabase,
	navigationLimit = 10,
): Promise<LiveBrowserContext> => {
	const currentContext = await getCurrentContext(db);
	const events = await db.events.toArray();
	const now = Date.now();

	const relatedContexts = currentContext
		? await findSimilarContexts(db, currentContext.id, 3)
		: [];
	const relatedMemories = currentContext
		? await findSimilarMemories(db, currentContext.id, 3)
		: [];

	return buildLiveContext({
		currentContext,
		events,
		relatedContexts,
		relatedMemories,
		now,
		navigationLimit,
	});
};

// --- Helper functions (tech.md §5.3) ---

export const getLiveInteractionIntensity = async (
	db: TabotDatabase,
): Promise<number> => {
	const live = await getCurrentBrowserContext(db);
	return live.interactionIntensity;
};

export const getLiveNavigationSequence = async (
	db: TabotDatabase,
	limit = 10,
): Promise<string[]> => {
	const live = await getCurrentBrowserContext(db, limit);
	return live.recentNavigations;
};
