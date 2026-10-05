import type { StoredTabEvent } from "@tabot/shared";
import { deriveMeaningfulEvents, deriveTransitions } from "@tabot/shared";
import {
	type ActivityStats,
	computeActivityStats,
	computePlaceStats,
	type RefSample,
} from "~/lib/activity-flow-stats";
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
	const inRange = events.filter((event) => event.timestamp >= from);
	const meaningful = deriveMeaningfulEvents(inRange);
	const transitions = deriveTransitions(meaningful);

	const samples: RefSample[] = [];
	const byOrigin = new Map<string, FlowNode>();
	for (const event of meaningful) {
		const origin = event.ref?.origin;
		if (!origin) continue;
		samples.push({ origin, timestamp: event.timestamp });
		const node = byOrigin.get(origin);
		if (node) {
			node.events++;
			node.lastSeen = Math.max(node.lastSeen, event.timestamp);
			node.favicon ??= event.favicon;
		} else {
			byOrigin.set(origin, {
				id: origin,
				label: prettySite(origin),
				events: 1,
				activeMs: 0,
				visits: 0,
				days: 0,
				lastSeen: event.timestamp,
				favicon: event.favicon ?? faviconOf(origin),
			});
		}
	}

	const byLink = new Map<string, FlowLink>();
	for (const transition of transitions) {
		const source = transition.from.origin;
		const target = transition.to.origin;
		if (!source || !target || source === target) continue;
		const key = `${source}\u0000${target}`;
		const link = byLink.get(key);
		if (link) {
			link.count++;
			link.lastAt = Math.max(link.lastAt, transition.lastAt);
		} else {
			byLink.set(key, {
				source,
				target,
				count: 1,
				lastAt: transition.lastAt,
			});
		}
	}

	const placeStats = computePlaceStats(samples);
	let totalMs = 0;
	for (const [origin, place] of placeStats) {
		totalMs += place.activeMs;
		Object.assign(byOrigin.get(origin) ?? {}, place);
	}

	const nodes = [...byOrigin.values()]
		.sort(
			(a, b) =>
				b.activeMs - a.activeMs ||
				b.events - a.events ||
				b.lastSeen - a.lastSeen,
		)
		.slice(0, maxNodes);
	const kept = new Set(nodes.map((node) => node.id));
	const links = [...byLink.values()]
		.filter((link) => kept.has(link.source) && kept.has(link.target))
		.sort((a, b) => b.count - a.count);

	return { totalMs, nodes, links, stats: computeActivityStats(samples, now) };
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
