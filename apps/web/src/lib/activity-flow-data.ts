import type { StoredTabEvent } from "@tabot/shared";
import { type ActivityStats, buildActivityMetrics } from "@tabot/shared";
import { faviconOf, prettySite } from "~/lib/context-graph-data";

export interface FlowNode {
	id: string; // origin (scheme + host)
	label: string; // prettySite
	events: number; // raw tab events — sizes the dot, never shown to people
	activeMs: number; // estimated time spent here
	visits: number;
	days: number;
	lastSeen: number;
	favicon?: string; // captured favicon, else derived from origin
}

export interface FlowLink {
	source: string; // origin
	target: string; // origin
	count: number;
	lastAt: number;
}

export interface ActivityFlow {
	from: number;
	to: number;
	totalMs: number; // estimated time across every place (not just kept nodes)
	nodes: FlowNode[];
	links: FlowLink[];
	stats: ActivityStats;
}

// A readable flow graph: places you moved between, weighted by how often you
// moved. Origins (not full URLs) keep the node count small; self-hops are
// folded away. Nodes are capped so a wide period stays legible.
export const buildActivityFlow = (
	events: StoredTabEvent[],
	from: number,
	now: number = Date.now(),
	maxNodes = 22,
): ActivityFlow => {
	const metrics = buildActivityMetrics(events, from, now);
	const nodes: FlowNode[] = metrics.sites
		.slice(0, maxNodes)
		.map(({ origin, ...site }) => ({
			...site,
			id: origin,
			label: prettySite(origin),
			favicon: site.favicon ?? faviconOf(origin),
		}));
	const kept = new Set(nodes.map((node) => node.id));
	const links = metrics.transitions.filter(
		(link) => kept.has(link.source) && kept.has(link.target),
	);

	return {
		from,
		to: now,
		totalMs: metrics.totalMs,
		nodes,
		links,
		stats: metrics.stats,
	};
};

// Origins connected to the given origin (either direction) — the detail panel
// lists where a place leads and where it is reached from.
export const connectedTo = (
	flow: ActivityFlow,
	origin: string,
): Array<{ label: string; count: number; outgoing: boolean }> => {
	const byId = new Map(flow.nodes.map((node) => [node.id, node.label]));
	const out: Array<{ label: string; count: number; outgoing: boolean }> = [];
	for (const link of flow.links) {
		if (link.source === origin && byId.has(link.target))
			out.push({
				label: byId.get(link.target) ?? "",
				count: link.count,
				outgoing: true,
			});
		if (link.target === origin && byId.has(link.source))
			out.push({
				label: byId.get(link.source) ?? "",
				count: link.count,
				outgoing: false,
			});
	}
	return out.sort((a, b) => b.count - a.count).slice(0, 8);
};

// Plain-language label for how a place fits into your routine.
export const habitOf = (node: FlowNode, activeDays: number): string => {
	if (activeDays >= 3) {
		const share = node.days / activeDays;
		if (share >= 0.7) return "Daily go-to";
		if (share >= 0.35) return "Regular";
		return "Occasional";
	}
	return node.visits >= 3 ? "Frequent stop" : "Quick stop";
};
