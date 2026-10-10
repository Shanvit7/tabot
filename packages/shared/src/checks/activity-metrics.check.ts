import assert from "node:assert/strict";
import {
	activityMetricsResponse,
	buildActivityMetrics,
	parseActivityMetricsInput,
} from "../activities/metrics";
import type { StoredTabEvent } from "../events/db";
import { activityMetricsPrompt, chatGptPromptUrl } from "../share/targets";

const from = new Date(2026, 0, 15, 9).getTime();
const to = from + 5 * 60_000;
const event = (index: number, url: string): StoredTabEvent => ({
	id: `event-${index}`,
	type: "NAVIGATION",
	tabId: 1,
	windowId: 1,
	timestamp: from + index * 60_000,
	url,
	favicon: "https://secret.test/john@example.com.png",
});
const events = [
	event(-1, "https://outside.test"),
	...[0, 1, 2, 3, 4].map((index) =>
		event(
			index,
			index % 2
				? "https://b.test/private?q=john@example.com"
				: "https://user:password@a.test/private#secret",
		),
	),
	event(5, "https://outside.test"),
];
const before = JSON.stringify(events);
const metrics = buildActivityMetrics(events, from, to);
const response = activityMetricsResponse(metrics);
assert.equal(response.summary.estimatedActiveMs, 4 * 60_000);
assert.equal(response.summary.activeDays, 1);
assert.equal(response.summary.distinctSites, 2);
assert.equal(response.summary.visits, 5);
assert.equal(response.summary.transitionCount, 4);
assert.equal(
	response.transitions.find((link) => link.source === "https://a.test")?.count,
	2,
	"count repeated transitions, not only distinct page pairs",
);
const scoped = activityMetricsResponse(metrics, "https://a.test");
assert.equal(scoped.sites.length, 1);
assert.equal(
	scoped.sites[0].estimatedActiveMs,
	2 * 60_000,
	"site filter applied after time attribution",
);
assert.deepEqual(
	scoped.summary,
	response.summary,
	"summary remains whole-period",
);
assert.equal(
	activityMetricsResponse(metrics, "https://missing.test").sites.length,
	0,
);
assert.equal(JSON.stringify(events), before, "raw source remains unchanged");
assert.doesNotMatch(
	JSON.stringify(response),
	/password|private|secret|john@|favicon|event-/,
);
assert.equal(response.estimated, true);
assert.equal(response.range.endExclusive, true);
assert.equal(
	buildActivityMetrics(events, from + 60_000, from + 4 * 60_000).sites.some(
		(site) => site.origin === "https://outside.test",
	),
	false,
);
assert.equal(
	activityMetricsResponse(buildActivityMetrics([], from, to)).summary
		.estimatedActiveMs,
	0,
);
assert.equal(
	buildActivityMetrics(
		[event(0, "https://a.test"), event(10, "https://b.test")],
		from,
		from + 11 * 60_000,
	).totalMs,
	5 * 60_000,
	"idle gap capped",
);
assert.equal(
	buildActivityMetrics(
		[event(0, "file:///secret"), event(1, "chrome-extension://abc/private")],
		from,
		to,
	).sites.length,
	0,
);

const many = buildActivityMetrics(
	Array.from({ length: 120 }, (_, index) =>
		event(index, `https://site-${index}.test/private`),
	),
	from,
	from + 121 * 60_000,
);
const bounded = activityMetricsResponse(many);
assert.equal(bounded.sites.length, 50);
assert.equal(bounded.transitions.length, 100);
assert.deepEqual(bounded.truncated, { sites: true, transitions: true });
assert.equal(
	bounded.summary.distinctSites,
	120,
	"summary includes omitted sites",
);
assert.equal(
	activityMetricsResponse(many, "https://site-119.test").sites.length,
	1,
	"explicit origin lookup not limited to top sites",
);
const longHosts = Array.from({ length: 120 }, (_, index) =>
	event(
		index,
		`https://s-${index}.${"a".repeat(60)}.${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(48)}.test/private`,
	),
);
const sizeBound = activityMetricsResponse(
	buildActivityMetrics(longHosts, from, from + 121 * 60_000),
);
assert.ok(
	JSON.stringify(sizeBound).length <= 60_000,
	"response fits WebSocket message budget even with long origins",
);
assert.equal(sizeBound.truncated.transitions, true);
assert.equal(sizeBound.summary.distinctSites, 120);

assert.deepEqual(
	parseActivityMetricsInput({ from, to, origin: "https://a.test" }, to),
	{ from, to, origin: "https://a.test" },
);
for (const input of [
	null,
	{},
	{ from: to, to: from },
	{ from, to: to + 1 },
	{ from: -1, to },
	{ from: NaN, to },
	{ from, to: Infinity },
	{ from: from + 0.5, to },
	...[
		"https://a.test/",
		"https://a.test/path",
		"https://a.test?q=x",
		"https://user@a.test",
		"file:///private",
		"a.test",
	].map((origin) => ({ from, to, origin })),
]) {
	assert.throws(() => parseActivityMetricsInput(input, to));
}
const prompt = activityMetricsPrompt(from, to, "https://a.test");
assert.ok(
	prompt.includes(JSON.stringify({ from, to, origin: "https://a.test" })),
);
assert.ok(prompt.includes("get_activity_metrics"));
assert.equal(new URL(chatGptPromptUrl(prompt)).searchParams.get("q"), prompt);
assert.doesNotMatch(activityMetricsPrompt(from, to), /"origin"/);
console.log(
	"Activity metrics checks passed: bounds, attribution, transition counts, privacy, caps, inputs, prompts.",
);
