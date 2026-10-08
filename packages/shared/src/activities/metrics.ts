import type { StoredTabEvent } from "../events/db";
import {
	computeActivityStats,
	computePlaceStats,
	type PlaceStats,
	type RefSample,
} from "./activity-stats";
import { deriveMeaningfulEvents, deriveTransitions } from "./meaningful-events";

export interface ActivityMetricsInput {
	from: number;
	to: number;
	origin?: string;
}

const httpOrigin = (value: string): string | undefined => {
	try {
		const url = new URL(value);
		return (url.protocol === "https:" || url.protocol === "http:") &&
			url.origin.length <= 256
			? url.origin
			: undefined;
	} catch {
		return undefined;
	}
};

/** Validate again on-device: a relay request is still an untrusted input. */
export const parseActivityMetricsInput = (
	params: unknown,
	now = Date.now(),
): ActivityMetricsInput => {
	if (!params || typeof params !== "object")
		throw new Error("from and to must be Unix timestamps in milliseconds.");
	const { from, to, origin } = params as Partial<ActivityMetricsInput>;
	if (
		typeof from !== "number" ||
		!Number.isSafeInteger(from) ||
		from < 0 ||
		typeof to !== "number" ||
		!Number.isSafeInteger(to) ||
		to <= from ||
		to > now
	) {
		throw new Error(
			"Use a past time range with 0 <= from < to, in Unix milliseconds.",
		);
	}
	if (
		origin !== undefined &&
		(typeof origin !== "string" ||
			origin.length > 256 ||
			httpOrigin(origin) !== origin)
	) {
		throw new Error(
			"origin must be an HTTP(S) origin, without credentials, path, query, or fragment.",
		);
	}
	return { from, to, ...(origin !== undefined ? { origin } : {}) };
};

export interface MetricSite extends PlaceStats {
	origin: string;
	events: number;
	lastSeen: number;
	favicon?: string; // local UI only; excluded by the external projection below
}

export interface MetricTransition {
	source: string;
	target: string;
	count: number;
	lastAt: number;
}

/** Local, rebuildable aggregates. Bounds are [from, to); no extrapolation to now. */
export const buildActivityMetrics = (
	events: StoredTabEvent[],
	from: number,
	to: number,
) => {
	const meaningful = deriveMeaningfulEvents(
		events.filter((event) => event.timestamp >= from && event.timestamp < to),
	);
	const samples: RefSample[] = [];
	const sites = new Map<string, MetricSite>();
	for (const event of meaningful) {
		const origin = event.ref && httpOrigin(event.ref.origin);
		if (!origin) continue;
		samples.push({ origin, timestamp: event.timestamp });
		const site = sites.get(origin);
		if (site) {
			site.events++;
			site.lastSeen = Math.max(site.lastSeen, event.timestamp);
			site.favicon ??= event.favicon;
		} else {
			sites.set(origin, {
				origin,
				events: 1,
				lastSeen: event.timestamp,
				activeMs: 0,
				visits: 0,
				days: 0,
				favicon: event.favicon,
			});
		}
	}
	for (const [origin, stats] of computePlaceStats(samples))
		Object.assign(sites.get(origin) ?? {}, stats);

	const links = new Map<string, MetricTransition>();
	for (const transition of deriveTransitions(meaningful)) {
		const source = httpOrigin(transition.from.origin);
		const target = httpOrigin(transition.to.origin);
		if (!source || !target || source === target) continue;
		const key = `${source}\u0000${target}`;
		const link = links.get(key);
		if (link) {
			link.count += transition.count;
			link.lastAt = Math.max(link.lastAt, transition.lastAt);
		} else {
			links.set(key, {
				source,
				target,
				count: transition.count,
				lastAt: transition.lastAt,
			});
		}
	}
	const places = [...sites.values()].sort(
		(a, b) =>
			b.activeMs - a.activeMs || b.events - a.events || b.lastSeen - a.lastSeen,
	);
	return {
		from,
		to,
		totalMs: places.reduce((sum, site) => sum + site.activeMs, 0),
		sites: places,
		transitions: [...links.values()].sort((a, b) => b.count - a.count),
		stats: computeActivityStats(samples, to),
	};
};

/** Privacy boundary: whitelist numbers and HTTP(S) origins; never raw URLs or favicons. */
export const activityMetricsResponse = (
	metrics: ReturnType<typeof buildActivityMetrics>,
	origin?: string,
) => {
	const sites = metrics.sites.filter(
		(site) => !origin || site.origin === origin,
	);
	const transitions = metrics.transitions.filter(
		(link) => !origin || link.source === origin || link.target === origin,
	);
	const stats = metrics.stats;
	const response = {
		range: {
			from: metrics.from,
			to: metrics.to,
			endExclusive: true,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
		origin: origin ?? null,
		estimated: true,
		estimation:
			"Time between consecutive site observations, capped at five minutes per gap. No time added after the final observation; not a measure of attention or productivity.",
		// Summary always describes the entire period, even when one site is selected.
		summary: {
			estimatedActiveMs: metrics.totalMs,
			visits: metrics.sites.reduce((sum, site) => sum + site.visits, 0),
			activeDays: stats.activeDays,
			distinctSites: stats.distinctSites,
			streakDays: stats.streakDays,
			returningSites: stats.returningSites,
			longestFocusMs: stats.focusMs,
			longestFocusOrigin: stats.focusOrigin || null,
			busiestHour: stats.busiestHour,
			transitionCount: metrics.transitions.reduce(
				(sum, link) => sum + link.count,
				0,
			),
		},
		sites: sites.slice(0, 50).map((site) => ({
			origin: site.origin,
			estimatedActiveMs: site.activeMs,
			visits: site.visits,
			activeDays: site.days,
			lastSeen: site.lastSeen,
		})),
		transitions: transitions
			.slice(0, 100)
			.map(({ source, target, count, lastAt }) => ({
				source,
				target,
				count,
				lastAt,
			})),
		truncated: {
			sites: sites.length > 50,
			transitions: transitions.length > 100,
		},
	};
	// Leave room for the WebSocket envelope under the relay's 64,000-character cap.
	// ponytail: reserialize at most 150 capped entries; use streaming if response limits grow.
	while (JSON.stringify(response).length > 60_000) {
		if (response.transitions.length) response.transitions.pop();
		else response.sites.pop();
	}
	response.truncated.sites = sites.length > response.sites.length;
	response.truncated.transitions =
		transitions.length > response.transitions.length;
	return response;
};
