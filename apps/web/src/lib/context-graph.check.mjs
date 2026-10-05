import { strict as assert } from "node:assert";
import {
	ago,
	contextTitle,
	faviconOf,
	graphData,
	humanDuration,
	matchesQuery,
	memoryTitle,
	originOf,
	prettySite,
} from "./context-graph-data.ts";

const contexts = [
	{
		id: "1",
		endTimestamp: 1,
		primaryDomain: "site-one.test",
		domains: [{ domain: "site-one.test" }],
	},
	{
		id: "2",
		endTimestamp: 2,
		primaryDomain: "site-two.test",
		domains: [{ domain: "site-two.test" }],
	},
];
const memories = [{ id: "recurrence", kind: "recurrent", contextIds: ["1"] }];
const { nodes, edges } = graphData(contexts, memories);
assert.equal(nodes.length, 5);
assert.deepEqual(edges, [
	{ source: "c:2", target: "s:site-two.test", kind: "observed" },
	{ source: "c:1", target: "s:site-one.test", kind: "observed" },
	{ source: "m:recurrence", target: "c:1", kind: "pattern" },
]);
assert.equal(graphData([], []).nodes.length, 0);

// Human-facing labels: schemes, www and browser-internal pages never reach the UI.
assert.equal(prettySite("https://www.linkedin.com/feed"), "Linkedin");
assert.equal(prettySite("chrome://newtab"), "New tab");
assert.equal(
	prettySite("chrome-extension://abc/options.html"),
	"Extension page",
);
assert.equal(prettySite("localhost:3000"), "Local preview");
assert.equal(
	contextTitle({
		domains: [{ domain: "https://www.linkedin.com", eventCount: 1 }],
	}),
	"Linkedin",
);
assert.equal(
	memoryTitle({
		fingerprint: { domains: [{ domain: "https://www.linkedin.com" }] },
	}),
	"Mostly Linkedin",
);
assert.equal(
	memoryTitle({ fingerprint: { domains: [] } }),
	"A recurring pattern",
);

// Copy helpers: users read sentences, never raw counters.
assert.equal(humanDuration(33_000), "less than a minute");
assert.equal(humanDuration(60_000), "about a minute");
assert.equal(humanDuration(12 * 60_000), "about 12 minutes");
assert.equal(humanDuration(70 * 60_000), "about an hour");
assert.equal(humanDuration(5 * 3_600_000), "about 5 hours");
assert.equal(ago(10_000), "just now");
assert.equal(ago(4 * 60_000), "4m ago");
assert.equal(ago(120 * 60_000), "2h ago");
assert.equal(ago(3 * 86_400_000), "3d ago");

// Every node is drawable: the canvas painter needs a numeric radius and a label.
for (const node of nodes) {
	assert.equal(typeof node.id, "string");
	assert.equal(typeof node.label, "string");
	assert.ok(node.label.length > 0);
}
const kinds = nodes.map((node) => node.kind).sort();
assert.deepEqual(kinds, ["context", "context", "memory", "site", "site"]);

// Search: exact, typo-tolerant and negative cases.
const siteNode = nodes.find((node) => node.kind === "site");
assert.equal(matchesQuery(siteNode, ""), true);
assert.equal(matchesQuery(siteNode, siteNode.label.toLowerCase()), true);
assert.equal(matchesQuery(siteNode, "zzzq"), false);
assert.equal(matchesQuery(siteNode, "no such place"), false);
assert.equal(matchesQuery({ ...siteNode, label: "Linkedin" }, "lnkdn"), true);
assert.equal(matchesQuery({ ...siteNode, label: "Linkedin" }, "github"), false);
const memoryNode = nodes.find((node) => node.kind === "memory");
assert.equal(matchesQuery(memoryNode, "pattern"), true);
assert.equal(matchesQuery(memoryNode, "habit"), true);
assert.equal(matchesQuery(memoryNode, "github"), false);
assert.equal(
	matchesQuery(
		nodes.find((node) => node.kind === "context"),
		"browsing",
	),
	true,
);
assert.equal(
	matchesQuery(
		nodes.find((node) => node.kind === "site"),
		"place",
	),
	true,
);

// Favicon: derived locally from a real origin, never via a third-party service.
// Internal pages and scheme-less domains get no icon (the canvas draws a dot).
assert.equal(faviconOf("https://github.com"), "https://github.com/favicon.ico");
assert.equal(
	faviconOf("http://localhost:3000"),
	"http://localhost:3000/favicon.ico",
);
assert.equal(
	faviconOf("https://github.com/"),
	"https://github.com/favicon.ico",
);
assert.equal(faviconOf("chrome://newtab"), undefined);
assert.equal(faviconOf("chrome-extension://abc/options.html"), undefined);
assert.equal(faviconOf("site-one.test"), undefined);
const originGraph = graphData(
	[
		{
			id: "1",
			endTimestamp: 1,
			primaryDomain: "https://github.com",
			domains: [{ domain: "https://github.com" }],
		},
	],
	[],
);
assert.equal(
	originGraph.nodes.find((node) => node.kind === "site")?.favicon,
	"https://github.com/favicon.ico",
);
// A favicon captured from the tab beats the derived /favicon.ico guess.
assert.equal(originOf("https://github.com/a/b?c=1"), "https://github.com");
assert.equal(originOf("not a url"), undefined);
assert.equal(
	graphData(
		[
			{
				id: "1",
				endTimestamp: 1,
				primaryDomain: "https://github.com",
				domains: [{ domain: "https://github.com" }],
			},
		],
		[],
		undefined,
		new Map([["https://github.com", "https://github.com/icon.svg"]]),
	).nodes.find((node) => node.kind === "site")?.favicon,
	"https://github.com/icon.svg",
);
