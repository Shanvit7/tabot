import type { BrowserContext, Memory } from "@tabot/shared";

type NodeBase = { id: string; label: string; kind: string };

// "chrome-extension://abc/options.html" → "Extension page"; strips scheme + www.
export const ago = (msAgo: number): string => {
	const minutes = Math.round(msAgo / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

export const humanDuration = (ms: number): string => {
	if (ms < 45_000) return "less than a minute";
	const minutes = Math.round(ms / 60_000);
	if (minutes < 2) return "about a minute";
	if (minutes < 60) return `about ${minutes} minutes`;
	const hours = Math.round(minutes / 60);
	return hours < 2 ? "about an hour" : `about ${hours} hours`;
};

export const prettySite = (domain: string): string => {
	const bare = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
	if (bare.startsWith("chrome-extension://")) return "Extension page";
	if (bare.startsWith("chrome://")) {
		const name = bare.slice("chrome://".length);
		return name === "newtab" ? "New tab" : `Chrome ${name}`;
	}
	if (bare.startsWith("localhost")) return "Local preview";
	const host = bare.split("/")[0];
	const word = host.split(".")[0];
	return word ? word.charAt(0).toUpperCase() + word.slice(1) : host;
};

export type ContextNode = NodeBase & {
	kind: "context";
	context: BrowserContext;
	places: number;
	sharedPlaces: number;
};
export type SiteNode = NodeBase & {
	kind: "site";
	domain: string;
	contextCount: number;
	eventCount: number;
	sessionCount: number;
	firstSeen: number;
	lastSeen: number;
	contextIds: string[];
};
export type MemoryNode = NodeBase & { kind: "memory"; memory: Memory };
export type GraphNode = ContextNode | SiteNode | MemoryNode;

// Typo-tolerant subsequence match: "lnkdn" finds "Linkedin", "gh" finds "Github".
const fuzzy = (haystack: string, query: string): boolean => {
	let i = 0;
	for (const char of haystack) if (char === query[i]) i += 1;
	return i === query.length;
};

// What a node can be found by: its own label plus the places behind it.
export const nodeHaystack = (node: GraphNode): string => {
	const extra =
		node.kind === "site"
			? [node.domain, "place"]
			: node.kind === "context"
				? [
						...node.context.domains.map((site) => prettySite(site.domain)),
						"stretch",
						"browsing",
					]
				: [
						...(node.memory.fingerprint?.domains ?? []).map((entry) =>
							prettySite(entry.domain),
						),
						"pattern",
						node.memory.kind === "recurrent" ? "habit" : "one-off",
					];
	return [node.label, ...extra].join(" ").toLowerCase();
};

export const matchesQuery = (node: GraphNode, query: string): boolean => {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!terms.length) return true;
	const haystack = nodeHaystack(node);
	return terms.every(
		(term) => haystack.includes(term) || fuzzy(haystack, term),
	);
};
type Edge = { source: string; target: string; kind: "observed" | "pattern" };

// A context is named after wherever the most activity happened in it.
export const contextTitle = (context: BrowserContext): string => {
	if (!context.domains.length) return "A moment of browsing";
	const top = context.domains.toSorted(
		(a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0),
	)[0];
	return prettySite(top.domain);
};

// A pattern is named after the places it tends to happen in.
export const memoryTitle = (memory: Memory): string => {
	const [first, second] = (memory.fingerprint?.domains ?? []).map((entry) =>
		prettySite(entry.domain),
	);
	if (!first) return "A recurring pattern";
	return second ? `${first} → ${second}` : `Mostly ${first}`;
};

// Dense maps hang each stretch off its three main places only; drawing every
// spoke turns the whole thing into a mesh you cannot read.
const placementSites = (
	context: BrowserContext,
	keptDomains: Set<string>,
	limits: GraphLimits,
) => {
	const inRange = context.domains.filter((site) =>
		keptDomains.has(site.domain),
	);
	if (limits.sites <= 7) return inRange;
	return inRange
		.toSorted(
			(a, b) =>
				(b.eventCount ?? 0) - (a.eventCount ?? 0) ||
				a.domain.localeCompare(b.domain),
		)
		.slice(0, 3);
};

// Links mean actual context membership or memory.contextIds, never inferred similarity.
// Limits keep the picture readable as the range widens.
export type GraphLimits = { contexts: number; sites: number; memories: number };
export const GRAPH_LIMITS: Record<string, GraphLimits> = {
	"5m": { contexts: 20, sites: 10, memories: 3 },
	"1h": { contexts: 40, sites: 20, memories: 5 },
	"6h": { contexts: 60, sites: 30, memories: 6 },
	today: { contexts: 60, sites: 30, memories: 6 },
	"7d": { contexts: 120, sites: 45, memories: 10 },
	"30d": { contexts: 200, sites: 70, memories: 14 },
	all: { contexts: 300, sites: 100, memories: 18 },
};

type SiteStat = Omit<SiteNode, "id" | "label" | "kind">;

const clockOf = (ms: number) =>
	new Date(ms).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});

export const graphData = (
	contexts: BrowserContext[],
	memories: Memory[],
	limits: GraphLimits = { contexts: 5, sites: 7, memories: 2 },
) => {
	const recent = contexts
		.toSorted((a, b) => b.endTimestamp - a.endTimestamp)
		.slice(0, limits.contexts);
	const sites = new Map<string, SiteStat>();
	for (const context of recent)
		for (const site of context.domains) {
			const current = sites.get(site.domain);
			sites.set(site.domain, {
				domain: site.domain,
				contextCount: (current?.contextCount ?? 0) + 1,
				eventCount: (current?.eventCount ?? 0) + (site.eventCount ?? 0),
				sessionCount: (current?.sessionCount ?? 0) + (site.sessionCount ?? 0),
				firstSeen: Math.min(
					current?.firstSeen ?? Number.POSITIVE_INFINITY,
					site.firstSeen ?? Number.POSITIVE_INFINITY,
				),
				lastSeen: Math.max(current?.lastSeen ?? 0, site.lastSeen ?? 0),
				contextIds: [...(current?.contextIds ?? []), context.id],
			});
		}
	const wide = limits.sites > 7;
	// Wide ranges only keep places you actually came back to, otherwise every
	// one-off visit draws another spoke and the map turns into a hairball.
	const keptSites = [...sites.values()]
		.filter((site) => !wide || site.contextCount >= 2)
		.toSorted(
			(a, b) => b.contextCount - a.contextCount || b.eventCount - a.eventCount,
		)
		.slice(0, limits.sites);
	const keptDomains = new Set(keptSites.map((site) => site.domain));
	const recentIds = new Set(recent.map((context) => context.id));
	const matching = memories
		.filter(
			(memory) =>
				memory.kind === "recurrent" &&
				memory.contextIds.some((id) => recentIds.has(id)),
		)
		.slice(0, limits.memories);
	const nodes: GraphNode[] = [];
	const edges: Edge[] = [];
	for (const context of recent) {
		const places = context.domains.filter((site) =>
			keptDomains.has(site.domain),
		);
		nodes.push({
			id: `c:${context.id}`,
			label: clockOf(context.endTimestamp),
			kind: "context",
			context,
			places: places.length,
			sharedPlaces: places.filter(
				(site) => (sites.get(site.domain)?.contextCount ?? 1) > 1,
			).length,
		});
		for (const site of placementSites(context, keptDomains, limits))
			edges.push({
				source: `c:${context.id}`,
				target: `s:${site.domain}`,
				kind: "observed",
			});
	}
	for (const site of keptSites)
		nodes.push({
			id: `s:${site.domain}`,
			label: prettySite(site.domain),
			kind: "site",
			...site,
			firstSeen: Number.isFinite(site.firstSeen) ? site.firstSeen : 0,
		});
	matching.forEach((memory, index) => {
		nodes.push({
			id: `m:${memory.id}`,
			label: `Pattern ${index + 1}`,
			kind: "memory",
			memory,
		});
		for (const id of memory.contextIds)
			if (recentIds.has(id))
				edges.push({
					source: `m:${memory.id}`,
					target: `c:${id}`,
					kind: "pattern",
				});
	});
	return { nodes, edges };
};
