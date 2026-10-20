import type { BrowserContext, StoredTabEvent } from "@tabot/shared";
import { prettySite } from "~/lib/context-graph-data";

export type SiteSummary = {
	origin: string;
	host: string;
	lastSeen: number;
};

export const siteSummaries = (events: StoredTabEvent[]): SiteSummary[] => {
	const sites = new Map<string, SiteSummary>();
	for (const event of events) {
		if (!event.url || !Number.isFinite(event.timestamp)) continue;
		try {
			const url = new URL(event.url);
			if (url.protocol !== "http:" && url.protocol !== "https:") continue;
			const host = url.host.replace(/^www\./, "");
			const current = sites.get(host);
			if (!current || event.timestamp >= current.lastSeen) {
				sites.set(host, {
					origin: url.origin,
					host,
					lastSeen: event.timestamp,
				});
			}
		} catch {
			// Invalid URLs are not displayed or linked.
		}
	}
	return [...sites.values()].toSorted(
		(a, b) => b.lastSeen - a.lastSeen || a.host.localeCompare(b.host),
	);
};

export type ActivitySummary = {
	id: string;
	startTimestamp: number;
	endTimestamp: number;
	title: string;
	sites: { origin: string; host: string; name: string }[];
};

// Only aggregate website evidence reaches Home. Browser internals and unsafe
// schemes are not destinations.
// ponytail: homepage links only; exact-page restore needs validated page-level summaries.
export const activitySummaries = (
	contexts: BrowserContext[],
): ActivitySummary[] =>
	contexts
		.map((context) => {
			const sites = new Map<string, ActivitySummary["sites"][number]>();
			for (const site of context.domains.toSorted(
				(a, b) => b.eventCount - a.eventCount,
			)) {
				try {
					const url = new URL(site.domain);
					if (!/^https?:$/.test(url.protocol)) continue;
					sites.set(url.origin, {
						origin: url.origin,
						host: url.host.replace(/^www\./, ""),
						name: prettySite(url.origin),
					});
				} catch {
					// Invalid domains cannot become links or meaningful search results.
				}
			}
			const destinations = [...sites.values()];
			return {
				id: context.id,
				startTimestamp: context.startTimestamp,
				endTimestamp: context.endTimestamp,
				title:
					destinations
						.slice(0, 2)
						.map((site) => site.name)
						.join(" + ") || "Browser activity",
				sites: destinations,
			};
		})
		.toSorted(
			(a, b) => b.endTimestamp - a.endTimestamp || a.id.localeCompare(b.id),
		);

// Unlike MCP's topic/path search, this field promises website names only.
// Every word must match; a single letter is valid too.
export const findActivities = (
	activities: ActivitySummary[],
	query: string,
): ActivitySummary[] => {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	return activities.filter((activity) => {
		const text = activity.sites
			.map((site) => `${site.name} ${site.host}`)
			.join(" ")
			.toLowerCase();
		return terms.every((term) => text.includes(term));
	});
};
