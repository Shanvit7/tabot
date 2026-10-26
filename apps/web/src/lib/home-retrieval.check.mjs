import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
	configFile: false,
	cacheDir: "node_modules/.vite-home-check",
	root: fileURLToPath(new URL("../../", import.meta.url)),
	resolve: { alias: { "~": fileURLToPath(new URL("../", import.meta.url)) } },
	server: { middlewareMode: true },
	appType: "custom",
});
try {
	const { activitySummaries, findActivities, siteSummaries } =
		await server.ssrLoadModule("/src/lib/home-retrieval.ts");
	const context = (id, endTimestamp, domains) => ({
		id,
		startTimestamp: endTimestamp - 1000,
		endTimestamp,
		domains: domains.map((domain, index) => ({
			domain,
			eventCount: 10 - index,
		})),
	});
	const source = [
		context("old", 10, ["https://www.notion.so", "https://github.com"]),
		context("browser", 100, [
			"chrome://newtab",
			"chrome-extension://id/options.html",
		]),
		context("new", 30, ["https://mail.google.com", "https://example.test"]),
		context("unsafe", 20, [
			"javascript:alert(1)",
			"file:///secret",
			"not a url",
			"data:text/html,test",
		]),
		context("ports", 15, ["http://localhost:3000", "http://localhost:3001"]),
		context("duplicate", 12, [
			"https://example.test/path?private=yes",
			"https://user:secret@example.test/other",
		]),
	];
	const snapshot = JSON.stringify(source);
	const activities = activitySummaries(source);
	assert.deepEqual(
		activities.map((activity) => activity.id),
		["browser", "new", "unsafe", "ports", "duplicate", "old"],
	);
	assert.equal(
		JSON.stringify(source),
		snapshot,
		"projection cannot mutate derived evidence",
	);
	const old = activities.find((activity) => activity.id === "old");
	assert.ok(old, "old activity exists");
	assert.equal(old?.title, "Notion + Github");
	assert.equal(old?.sites[0].host, "notion.so");
	assert.equal(
		activities.find((activity) => activity.id === "browser")?.sites.length,
		0,
	);
	assert.equal(
		activities.find((activity) => activity.id === "unsafe")?.sites.length,
		0,
	);
	assert.equal(
		activities.find((activity) => activity.id === "ports")?.sites.length,
		2,
		"different ports remain distinct",
	);
	const duplicate = activities.find((activity) => activity.id === "duplicate");
	assert.ok(duplicate, "duplicate activity exists");
	assert.equal(duplicate?.sites.length, 1);
	assert.equal(
		duplicate.sites[0].origin,
		"https://example.test",
		"links contain no credentials, paths or query strings",
	);
	assert.deepEqual(
		findActivities(activities, "  NOTION   github  ").map(
			(activity) => activity.id,
		),
		["old"],
		"search spans all dates and matches every word",
	);
	assert.deepEqual(
		findActivities(activities, "n").map((activity) => activity.id),
		["old"],
		"single letters search too",
	);
	assert.deepEqual(findActivities(activities, "notion unknown"), []);
	assert.deepEqual(
		findActivities(activities, "secret"),
		[],
		"private URL parts never become search evidence",
	);
	assert.deepEqual(findActivities(activities, "   "), activities);
	assert.deepEqual(activitySummaries([]), []);
	assert.deepEqual(
		siteSummaries([
			{ url: "https://example.test/other", timestamp: 30 },
			{ url: "https://www.example.test/private?q=secret", timestamp: 10 },
			{ url: "https://ignored.test", timestamp: Number.NaN },
			{ url: "javascript:alert(1)", timestamp: 20 },
			{ url: "not a url", timestamp: 40 },
		]),
		[
			{
				origin: "https://example.test",
				host: "example.test",
				lastSeen: 30,
			},
		],
		"only safe origins appear; private URL parts are discarded",
	);
	const tied = activitySummaries([
		context("b", 5, ["https://b.test"]),
		context("a", 5, ["https://a.test"]),
	]);
	assert.deepEqual(
		tied.map((activity) => activity.id),
		["a", "b"],
	);

	const { EMPTY_TRAILBOOK, parseTrailbook, toggleSavedTrail } =
		await server.ssrLoadModule("/src/lib/trailbook.ts");
	assert.deepEqual(parseTrailbook(null), EMPTY_TRAILBOOK);
	for (const broken of [
		"{",
		"null",
		"[]",
		'{"savedIds":[1],"viewed":false,"followed":false}',
		'{"savedIds":[],"viewed":"yes","followed":false}',
	]) {
		assert.equal(
			parseTrailbook(broken),
			null,
			"invalid collections must not be overwritten",
		);
	}
	const initial = { savedIds: ["old", "old"], viewed: true, followed: false };
	const parsed = parseTrailbook(JSON.stringify(initial));
	assert.deepEqual(parsed.savedIds, ["old"]);
	const collected = toggleSavedTrail(parsed, "new");
	assert.deepEqual(collected.savedIds, ["new", "old"]);
	assert.deepEqual(
		parsed.savedIds,
		["old"],
		"saving must not mutate previous state",
	);
	assert.deepEqual(toggleSavedTrail(collected, "old").savedIds, ["new"]);
	assert.deepEqual(
		parseTrailbook(JSON.stringify(collected)),
		collected,
		"collection survives persistence",
	);
	assert.equal(collected.viewed, true);
	assert.equal(
		collected.followed,
		false,
		"saving cannot pretend a website was opened",
	);

	const workspace = await readFile(
		new URL("../components/activity-workspace.tsx", import.meta.url),
		"utf8",
	);
	const route = await readFile(
		new URL("../routes/home.tsx", import.meta.url),
		"utf8",
	);
	assert.match(
		workspace,
		/ActivityTrailMap/,
		"home is the real-data trail map",
	);
	assert.match(
		workspace,
		/ActivityTimeline/,
		"timeline is available from real data",
	);
	assert.match(
		workspace,
		/ActivityPatterns/,
		"recurrences use real derived evidence",
	);
	assert.match(
		workspace,
		/useHomeData/,
		"screens read extension-local activity",
	);
	assert.match(
		workspace,
		/Activity could not be loaded/,
		"read failure is not an empty history",
	);
	assert.doesNotMatch(
		workspace,
		/prototype-data|sampleEvents|busySampleEvents/,
		"production screens never import demo records",
	);
	assert.match(
		route,
		/ActivityWorkspace view="map"/,
		"home opens the map screen",
	);
	console.log("home-retrieval.check: passed");
} finally {
	await server.close();
}
