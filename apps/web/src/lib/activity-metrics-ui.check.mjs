import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const linkUrl = (html) => {
	const [, href] = html.match(/<a\b[^>]*\bhref="([^"]+)"/) ?? [];
	assert.ok(href, "Expected an assistant link");
	return new URL(href.replaceAll("&amp;", "&"));
};

const server = await createServer({
	configFile: false,
	root: fileURLToPath(new URL("../../", import.meta.url)),
	resolve: { alias: { "~": fileURLToPath(new URL("../", import.meta.url)) } },
	ssr: { noExternal: ["@lobehub/icons"] },
	server: { middlewareMode: true },
	appType: "custom",
	plugins: [
		{
			name: "expose-assistant-context-for-check",
			transform: (source, id) => {
				if (id.endsWith("/hooks/use-home-data.ts?check-data")) {
					return source
						.replace(
							/import \{ useEffect, useMemo, useState \} from ['"]react['"];/,
							"const { useEffect, useMemo, useState } = globalThis.checkHomeHooks;",
						)
						.replace(
							/import \{ derive, fetchEvents, fetchStats \} from ['"]~\/lib\/home-data['"];/,
							"const { derive, fetchEvents, fetchStats } = globalThis.checkHomeTransport;",
						);
				}
				if (id.endsWith("/components/ui/work-panels.tsx?check-loader")) {
					const effect = source.match(
						/useEffect\(\(\) => \{([\s\S]*?)\n\t\}, \[\]\);/,
					)[1];
					return `${source}\nexport const checkLoaderAnimation = (element) => { const ref = { current: element }; return (() => {${effect}})(); };`;
				}
				if (id.endsWith("/components/export-disclosure.tsx?check-loading")) {
					const handler = source.match(
						/const download = (async \(\) => \{[\s\S]*?\n\t\});/,
					)[1];
					return `${source.replace("useState(false)", "useState(true)")}\nexport const checkDownload = (data, busy, setBusy, setError, setMessage) => (${handler})();`;
				}
				if (id.endsWith("/providers/assistant-connection.tsx")) {
					return `${source}\nexport { AssistantConnectionContext as CheckAssistantContext };`;
				}
			},
		},
	],
});
try {
	// Run the real data hook with controlled replies: loading must outlast either first reply.
	{
		const oldInterval = globalThis.setInterval;
		const oldClearInterval = globalThis.clearInterval;
		const oldHooks = globalThis.checkHomeHooks;
		const oldTransport = globalThis.checkHomeTransport;
		const intervals = new Map();
		let cells;
		let cursor;
		let effect;
		let statsReplies;
		let eventReplies;
		const deferred = () => {
			let resolve;
			const promise = new Promise((done) => {
				resolve = done;
			});
			return { promise, resolve };
		};
		const read = (replies) => {
			const reply = deferred();
			replies.push(reply);
			return reply.promise;
		};
		const flush = () => new Promise((resolve) => setImmediate(resolve));
		globalThis.setInterval = (callback, ms) => {
			intervals.set(ms, callback);
			return ms;
		};
		globalThis.clearInterval = (id) => intervals.delete(id);
		globalThis.checkHomeHooks = {
			useState: (initial) => {
				const index = cursor++;
				const current = cells;
				if (!(index in current)) current[index] = initial;
				return [
					current[index],
					(value) => {
						current[index] = value;
					},
				];
			},
			useEffect: (callback) => {
				effect ??= callback;
			},
			useMemo: (callback) => callback(),
		};
		globalThis.checkHomeTransport = {
			fetchStats: () => read(statsReplies),
			fetchEvents: () => read(eventReplies),
			derive: (events) => ({ events }),
		};
		try {
			const { useHomeData: checkHomeData } = await server.ssrLoadModule(
				"/src/hooks/use-home-data.ts?check-data",
			);
			const render = () => {
				cursor = 0;
				return checkHomeData();
			};
			const start = () => {
				cells = [];
				effect = null;
				statsReplies = [];
				eventReplies = [];
				assert.equal(render().initialized, false);
				const cleanup = effect();
				assert.equal(statsReplies.length, 1);
				assert.equal(eventReplies.length, 1, "initial reads start in parallel");
				return cleanup;
			};
			const rows = [{ id: 1 }];
			let cleanup = start();
			statsReplies[0].resolve({ totalEvents: 1 });
			await flush();
			assert.equal(
				render().initialized,
				false,
				"stats first must not expose empty UI",
			);
			eventReplies[0].resolve(rows);
			await flush();
			assert.equal(render().initialized, true);
			assert.equal(render().events, rows);
			intervals.get(5000)();
			eventReplies.at(-1).resolve([]);
			await flush();
			assert.deepEqual(
				render().events,
				[],
				"empty snapshots must clear stale activity",
			);
			assert.deepEqual(render().derived.events, []);
			intervals.get(5000)();
			eventReplies.at(-1).resolve(null);
			await flush();
			assert.deepEqual(
				render().events,
				[],
				"failed refresh must preserve the last valid snapshot",
			);
			cleanup();
			assert.equal(intervals.size, 0);

			cleanup = start();
			eventReplies[0].resolve([]);
			await flush();
			assert.equal(
				render().initialized,
				false,
				"events first must wait for the connection check",
			);
			statsReplies[0].resolve(null);
			await flush();
			assert.equal(
				render().initialized,
				true,
				"a real empty snapshot is ready, not still loading",
			);
			assert.equal(
				render().hasExtension,
				true,
				"a valid event reply also confirms the extension",
			);
			cleanup();

			cleanup = start();
			statsReplies[0].resolve({ totalEvents: 1 });
			eventReplies[0].resolve(null);
			await flush();
			assert.equal(
				render().initialized,
				false,
				"a timed-out read is not an empty history",
			);
			intervals.get(5000)();
			eventReplies.at(-1).resolve([]);
			await flush();
			assert.equal(
				render().initialized,
				true,
				"retry can finish loading with an empty snapshot",
			);
			cleanup();

			cleanup = start();
			statsReplies[0].resolve(null);
			eventReplies[0].resolve(null);
			await flush();
			assert.equal(
				render().initialized,
				true,
				"absent extension must still reach setup, not hang",
			);
			assert.equal(render().hasExtension, false);
			cleanup();

			cleanup = start();
			const beforeUnmount = [...cells];
			cleanup();
			statsReplies[0].resolve({ totalEvents: 1 });
			eventReplies[0].resolve(rows);
			await flush();
			assert.deepEqual(
				cells,
				beforeUnmount,
				"late replies must not update an unmounted hook",
			);
			assert.equal(intervals.size, 0);
		} finally {
			globalThis.setInterval = oldInterval;
			globalThis.clearInterval = oldClearInterval;
			globalThis.checkHomeHooks = oldHooks;
			globalThis.checkHomeTransport = oldTransport;
		}
		const { fetchEvents } = await server.ssrLoadModule("/src/lib/home-data.ts");
		const oldChrome = globalThis.chrome;
		try {
			const replies = [
				[],
				[{ id: 1 }],
				null,
				undefined,
				{ error: "unavailable" },
			];
			const queue = [...replies];
			globalThis.chrome = {
				runtime: { sendMessage: (...args) => args.at(-1)(queue.shift()) },
			};
			assert.deepEqual(
				await Promise.all(replies.map(() => fetchEvents())),
				replies.map((reply) => (Array.isArray(reply) ? reply : null)),
			);
		} finally {
			globalThis.chrome = oldChrome;
		}
	}
	const { GraphLoading, checkLoaderAnimation } = await server.ssrLoadModule(
		"/src/components/ui/work-panels.tsx?check-loader",
	);
	for (const className of [undefined, "min-h-110"]) {
		const html = renderToStaticMarkup(
			createElement(GraphLoading, { className }),
		);
		assert.match(html, /role="status"/);
		assert.match(html, /aria-live="polite"/);
		assert.match(html, /aria-atomic="true"/);
		assert.match(html, /data-animate="false"/);
		assert.ok(
			html.includes(className ?? "min-h-105"),
			"reserve the actual canvas height",
		);
		assert.match(html, /<svg aria-hidden="true"/);
		assert.equal(
			(html.match(/class="graph-loader-checkpoint"/g) ?? []).length,
			5,
		);
		assert.match(html, /graph-loader-marker/);
		assert.match(html, /Connecting the dots…/);
		assert.doesNotMatch(html, /<main|<button|<a |progressbar|\d+%|style=/);
	}
	for (const [title, message] of [
		[
			"Your first dot starts here",
			"No browsing here yet. Browse normally and your day will appear here.",
		],
		[
			"No browsing in these dates",
			"Try a wider date range to find your activity.",
		],
		[
			"No activity here yet",
			"Try All time, or browse normally to add your next dot.",
		],
		[
			"No repeated activity yet",
			"Browse normally. Similar visits at different times will show up here.",
		],
	]) {
		const html = renderToStaticMarkup(
			createElement(
				GraphLoading,
				{ title, message },
				createElement("button", { type: "button" }, "Show all time"),
			),
		);
		assert.ok(html.includes(title));
		assert.ok(html.includes(message));
		assert.match(html, /graph-loader-marker/);
		assert.equal(
			(html.match(/class="graph-loader-checkpoint"/g) ?? []).length,
			5,
		);
		assert.match(html, /<button type="button">Show all time<\/button>/);
		assert.doesNotMatch(
			html,
			/Connecting the dots|Your map is on its way|aria-busy="true"|progressbar/,
		);
	}
	const originalLoaderDocument = globalThis.document;
	const originalObserver = globalThis.IntersectionObserver;
	const visibilityListeners = new Set();
	let observeVisibility;
	let observed;
	let disconnected = false;
	globalThis.document = {
		hidden: false,
		addEventListener: (type, callback) => {
			assert.equal(type, "visibilitychange");
			visibilityListeners.add(callback);
		},
		removeEventListener: (type, callback) => {
			assert.equal(type, "visibilitychange");
			visibilityListeners.delete(callback);
		},
	};
	globalThis.IntersectionObserver = class {
		constructor(callback) {
			observeVisibility = callback;
		}
		observe(element) {
			observed = element;
		}
		disconnect() {
			disconnected = true;
		}
	};
	try {
		const element = { dataset: { animate: "false" } };
		const cleanup = checkLoaderAnimation(element);
		assert.equal(observed, element);
		observeVisibility([{ isIntersecting: true }]);
		assert.equal(element.dataset.animate, "true");
		globalThis.document.hidden = true;
		for (const listener of visibilityListeners) listener();
		assert.equal(
			element.dataset.animate,
			"false",
			"hidden tabs must pause animation",
		);
		globalThis.document.hidden = false;
		for (const listener of visibilityListeners) listener();
		assert.equal(element.dataset.animate, "true");
		observeVisibility([{ isIntersecting: false }]);
		assert.equal(
			element.dataset.animate,
			"false",
			"offscreen loaders must pause animation",
		);
		cleanup();
		assert.ok(disconnected);
		assert.equal(visibilityListeners.size, 0);
		assert.equal(checkLoaderAnimation(null), undefined);
	} finally {
		globalThis.document = originalLoaderDocument;
		globalThis.IntersectionObserver = originalObserver;
	}
	const workCss = await readFile(
		new URL("../styles/work.css", import.meta.url),
		"utf8",
	);
	assert.match(
		workCss,
		/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.graph-loader-marker/,
	);
	assert.match(workCss, /animation-play-state: paused/);
	const graphSources = await Promise.all(
		["../components/home-page.tsx", "../routes/activities.tsx"].map((path) =>
			readFile(new URL(path, import.meta.url), "utf8"),
		),
	);
	for (const source of graphSources) {
		assert.match(source, /<Suspense fallback=\{<GraphLoading/);
		assert.doesNotMatch(
			source,
			/<Loading|Drawing your last few hours|Nothing watched yet/,
		);
		assert.match(
			source,
			/title="(?:Your first dot starts here|No activity here yet)"/,
		);
		assert.match(
			source,
			/onClick=\{\(\) => set(?:Range|Period)\(['"]all['"]\)\}/,
		);
	}
	// The route must be importable on the server without loading window-only graph dependencies.
	const { Route } = await server.ssrLoadModule("/src/routes/activities.tsx");
	assert.ok(Route);
	assert.ok(
		(await server.ssrLoadModule("/src/routes/recurring-patterns.tsx")).Route,
	);
	const { RecurringPatternAssistant } = await server.ssrLoadModule(
		"/src/components/recurring-pattern-assistant.tsx",
	);
	for (const connection of [false, null, undefined, true]) {
		const connected = connection === true;
		const html = renderToStaticMarkup(
			createElement(RecurringPatternAssistant, { connected }),
		);
		if (!connected) {
			assert.equal(
				html,
				"",
				"page overview CTA appears only with verified connection",
			);
		} else {
			assert.match(html, /Ask ChatGPT about recurring patterns/);
			const prompt = linkUrl(html).searchParams.get("q");
			assert.match(prompt, /list_recurring_patterns/);
			assert.match(prompt, /\{"limit":10\}/);
			assert.match(prompt, /heuristic similarity/);
		}
		for (const memoryId of ["pattern-1", 'pattern-"2"']) {
			const selected = renderToStaticMarkup(
				createElement(RecurringPatternAssistant, { memoryId, connected }),
			);
			assert.doesNotMatch(selected, /raw events stay local|mt-5|w-full/);
			assert.match(selected, /min-h-11/);
			assert.match(selected, /text-xs font-medium/);
			assert.match(selected, /mr-1\.5 size-3\.5/);
			assert.doesNotMatch(selected, /text-sm|font-semibold/);
			if (!connected) {
				assert.match(selected, /href="\/home#connectors-heading"/);
				assert.doesNotMatch(selected, /target="_blank"/);
			} else {
				assert.match(selected, /Ask ChatGPT/);
				const prompt = linkUrl(selected).searchParams.get("q");
				assert.ok(
					prompt.includes(`get_memory with id ${JSON.stringify(memoryId)}`),
				);
				assert.match(prompt, /compare what stays similar/);
				assert.match(prompt, /truncated/);
			}
		}
	}
	const { RecurrenceMap } = await server.ssrLoadModule(
		"/src/lib/recurrence-map.tsx",
	);
	const memories = [1, 2].map((index) => ({
		id: `pattern-${index}`,
		firstSeen: Date.now() - 60_000,
		lastSeen: Date.now(),
		occurrences: [{ startTimestamp: Date.now() - 30_000 }],
		fingerprint: {
			orderedOrigins: [`https://site-${index}.test`],
			domains: [],
		},
	}));
	for (const connected of [false, true]) {
		for (const memory of memories) {
			const html = renderToStaticMarkup(
				createElement(RecurrenceMap, {
					memories,
					selectedId: memory.id,
					onSelect: () => {},
					selectedActions: createElement(RecurringPatternAssistant, {
						memoryId: memory.id,
						connected,
					}),
				}),
			);
			const rows = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(
				(match) => match[1],
			);
			assert.equal(rows.length, 2);
			for (const [index, row] of rows.entries()) {
				const rowMemory = memories.at(index);
				assert.ok(rowMemory, "Each rendered row must belong to a memory");
				if (rowMemory.id === memory.id) {
					assert.match(row, /aria-pressed="true"/);
					assert.match(row, /aria-label="Selected pattern actions"/);
					assert.ok(
						row.indexOf("</button>") < row.indexOf("<a "),
						"assistant link must be sibling, not nested inside row button",
					);
					if (connected) {
						const prompt = linkUrl(row).searchParams.get("q");
						assert.ok(
							prompt.includes(
								`get_memory with id ${JSON.stringify(memory.id)}`,
							),
						);
					} else assert.match(row, /Connect AI/);
				} else {
					assert.doesNotMatch(row, /<a |Selected pattern actions/);
					assert.match(
						row,
						/<\/button>\s*$/,
						"unselected rows must have no action placeholder",
					);
				}
				assert.doesNotMatch(row, /w-56/, "no fixed-width action column");
			}
		}
	}
	const [
		{ buildActivityFlow, connectedTo },
		{ PlaceCard },
		{ AskChatGpt },
		{ Connectors, focusConnectorsHeading },
		{
			buildActivityMetrics,
			activityMetricsResponse,
			activityMetricsPrompt,
			chatGptPromptUrl,
		},
	] = await Promise.all([
		server.ssrLoadModule("/src/lib/activity-flow-data.ts"),
		server.ssrLoadModule("/src/lib/place-card.tsx"),
		server.ssrLoadModule("/src/components/context-graph/assistant-cta.tsx"),
		server.ssrLoadModule("/src/components/connectors.tsx"),
		server.ssrLoadModule(
			`/@fs${fileURLToPath(new URL("../../../../packages/shared/src/index.ts", import.meta.url))}`,
		),
	]);
	const from = Date.now() - 60_000;
	const to = from + 50_000;
	const events = [0, 1, 2, 3, 4].map((index) => ({
		id: `raw-${index}`,
		type: "NAVIGATION",
		tabId: 1,
		windowId: 1,
		timestamp: from + index * 10_000,
		url: index % 2 ? "https://b.test/private" : "https://a.test/?q=secret",
	}));
	const flow = buildActivityFlow(events, from, to);
	const result = activityMetricsResponse(
		buildActivityMetrics(events, from, to),
	);
	assert.equal(flow.totalMs, result.summary.estimatedActiveMs);
	assert.deepEqual(flow.links, result.transitions);
	assert.deepEqual([flow.from, flow.to], [from, to]);
	const [node] = flow.nodes;
	assert.ok(node, "Fixture must produce an activity node");
	const href = chatGptPromptUrl(
		activityMetricsPrompt(flow.from, flow.to, node.id),
	);
	for (const assistantConnected of [false, true]) {
		const html = renderToStaticMarkup(
			createElement(PlaceCard, {
				node,
				rank: 1,
				total: flow.nodes.length,
				totalMs: flow.totalMs,
				activeDays: flow.stats.activeDays,
				connections: connectedTo(flow, node.id),
				assistantHref: href,
				assistantConnected,
			}),
		);
		assert.match(html, /Estimated time/);
		assert.match(html, /not page URLs or raw history/);
		if (assistantConnected) {
			assert.match(html, /Ask ChatGPT about this place/);
			const prompt = linkUrl(html).searchParams.get("q");
			assert.ok(prompt.includes(JSON.stringify({ from, to, origin: node.id })));
			assert.doesNotMatch(prompt, /private|secret|raw-/);
		} else {
			assert.match(html, /href="\/home#connectors-heading"/);
			assert.doesNotMatch(html, /target="_blank"/);
		}
	}
	const overview = renderToStaticMarkup(
		createElement(AskChatGpt, {
			href: chatGptPromptUrl(activityMetricsPrompt(from, to)),
			connected: true,
			label: "Ask ChatGPT about this period",
		}),
	);
	assert.match(overview, /Ask ChatGPT about this period/);
	assert.match(overview, /text-sm font-semibold/);
	assert.doesNotMatch(linkUrl(overview).searchParams.get("q"), /"origin"/);
	const disconnectedOverview = renderToStaticMarkup(
		createElement(AskChatGpt, {
			href: chatGptPromptUrl(activityMetricsPrompt(from, to)),
			connected: false,
			label: "Ask ChatGPT about this period",
		}),
	);
	assert.match(disconnectedOverview, /href="\/home#connectors-heading"/);
	assert.match(disconnectedOverview, /Ask an AI assistant/);
	assert.doesNotMatch(disconnectedOverview, /target="_blank"/);
	assert.match(
		renderToStaticMarkup(createElement(Connectors)),
		/id="connectors-heading" tabindex="-1"/,
	);
	const { CheckAssistantContext } = await server.ssrLoadModule(
		"/src/providers/assistant-connection.tsx",
	);
	for (const connection of [false, true, null, undefined]) {
		const html = renderToStaticMarkup(
			createElement(
				CheckAssistantContext.Provider,
				{ value: connection },
				createElement(Connectors),
			),
		);
		assert.match(html, /role="status"/);
		if (connection === false) {
			assert.match(
				html,
				/href="https:\/\/chatgpt\.com\/plugins\?search=Tabot"/,
			);
			assert.match(html, /target="_blank"/);
			assert.match(html, /opens ChatGPT in a new tab/);
			assert.match(html, /hover:bg/);
		} else {
			assert.doesNotMatch(
				html,
				/<a\b|href=|target=|tabindex="0"|hover:bg|opens ChatGPT/,
			);
			assert.match(html, /cursor-default/);
			assert.ok(
				html.includes(
					connection === true
						? "Connected"
						: connection === null
							? "Status unknown"
							: "Checking…",
				),
			);
		}
	}
	const { ExportDisclosure } = await server.ssrLoadModule(
		"/src/components/export-disclosure.tsx",
	);
	const { filterDerived, derive, buildExportJsonl } =
		await server.ssrLoadModule("/src/lib/home-data.ts");
	// Both original sessions cross date bounds; nested evidence and recurrence
	// must be rebuilt, not copied from overlapping all-time records.
	const rangeFrom = Date.UTC(2026, 9, 1);
	const rangeTo = rangeFrom + 62 * 60_000;
	const rangeEvents = [
		-1,
		0,
		60_000,
		120_000,
		60 * 60_000,
		61 * 60_000,
		62 * 60_000,
		62 * 60_000 + 1,
	].map((offset, index) => ({
		id: `range-${index}`,
		timestamp: rangeFrom + offset,
		tabId: 1,
		windowId: 1,
		type: "NAVIGATION",
		url: `https://chosen.test/${index === 0 ? "private-before" : index === 7 ? "private-after" : "work"}`,
	}));
	const fullRange = derive(rangeEvents);
	const originalRange = JSON.stringify(fullRange);
	assert.equal(fullRange.sessions.length, 2);
	assert.equal(fullRange.memories[0].kind, "recurrent");
	assert.equal(fullRange.live.currentUrl, "https://chosen.test/private-after");
	assert.equal(
		filterDerived(fullRange),
		fullRange,
		"all time must keep the complete bundle",
	);
	for (const [lower, upper] of [
		[rangeFrom, rangeTo],
		[rangeFrom, undefined],
		[undefined, rangeTo],
		[rangeFrom, rangeFrom],
		[rangeTo + 2, rangeTo + 3],
		[rangeTo, rangeFrom],
	]) {
		const selected = filterDerived(fullRange, lower, upper);
		const expected = rangeEvents.filter(
			(event) =>
				event.timestamp >= (lower ?? -Infinity) &&
				event.timestamp <= (upper ?? Infinity),
		);
		assert.deepEqual(
			selected.events,
			expected,
			"date bounds must be inclusive",
		);
		JSON.stringify(selected, (key, value) => {
			if (
				/^(timestamp|startTimestamp|endTimestamp|firstSeen|lastSeen|start|end|firstAt|lastAt|fromTs|toTs)$/.test(
					key,
				) &&
				typeof value === "number"
			) {
				assert.ok(
					value >= (lower ?? -Infinity) && value <= (upper ?? Infinity),
					`${key} escaped chosen dates`,
				);
			}
			return value;
		});
		if (expected.length === 0) {
			assert.deepEqual(
				[selected.sessions, selected.contexts, selected.memories],
				[[], [], []],
			);
			assert.equal(selected.live.currentUrl, undefined);
		}
	}
	const selectedRange = filterDerived(fullRange, rangeFrom, rangeTo);
	assert.equal(selectedRange.sessions.length, 2);
	assert.equal(selectedRange.contexts.length, 2);
	assert.equal(
		selectedRange.memories[0].kind,
		"recurrent",
		"in-range repetition must survive",
	);
	assert.equal(selectedRange.live.currentUrl, "https://chosen.test/work");
	const rangeFile = buildExportJsonl(selectedRange);
	assert.doesNotMatch(
		rangeFile,
		/private-before|private-after|range-0|range-7/,
	);
	assert.equal(JSON.parse(rangeFile.split("\n")[0]).manifest.counts.events, 6);
	assert.equal(
		filterDerived(fullRange, rangeFrom + 60 * 60_000, rangeTo).memories.length,
		0,
		"one in-range occurrence must not inherit all-time recurrence",
	);
	assert.equal(
		JSON.stringify(fullRange),
		originalRange,
		"date filtering must not mutate saved activity",
	);
	const exportStart = new Date(2026, 9, 1, 12).getTime();
	const exportEvents = [
		{
			type: "NAVIGATION",
			tabId: 1,
			timestamp: exportStart + 86_400_000 + 120_000,
			url: "https://b.test/",
		},
		{
			type: "NAVIGATION",
			tabId: 1,
			timestamp: exportStart,
			url: "https://a.test/?secret=local",
		},
		{
			type: "TAB_CREATED",
			tabId: 99,
			timestamp: exportStart + 30_000,
			url: "https://background.test/",
		},
		{
			type: "NAVIGATION",
			tabId: 1,
			timestamp: exportStart + 86_400_000,
			url: "https://b.test/",
		},
		{
			type: "NAVIGATION",
			tabId: 1,
			timestamp: exportStart + 60_000,
			url: "https://a.test/",
		},
	].map((event, index) => ({ ...event, id: `export-${index}`, windowId: 1 }));
	const exportData = {
		events: exportEvents,
		sessions: [],
		contexts: [
			{
				startTimestamp: exportStart,
				endTimestamp: exportStart + 86_400_000,
				domains: [{ domain: "https://context-only.test" }],
			},
		],
		memories: ["single", "recurrent"].map((kind) => ({
			kind,
			startTimestamp: exportStart,
			endTimestamp: exportStart + 86_400_000,
		})),
		live: null,
	};
	const emptyExport = {
		events: [],
		sessions: [],
		contexts: [],
		memories: [],
		live: null,
	};
	for (const [derived, expected] of [
		[exportData, ["8m 0s", "2", "2", "1"]],
		[
			filterDerived(exportData, exportStart, exportStart + 60_000),
			["1m 0s", "1", "1", "0"],
		],
		[emptyExport, ["0s", "0", "0", "0"]],
		[null, ["—", "—", "—", "—"]],
	]) {
		const html = renderToStaticMarkup(
			createElement(ExportDisclosure, { derived }),
		);
		assert.deepEqual(
			[...html.matchAll(/<dd\b[^>]*><span\b[^>]*>([^<]*)/g)].map(
				(match) => match[1],
			),
			expected,
		);
		assert.match(html, /Choose dates/);
		assert.match(html, /Your browsing/);
		assert.match(html, /Browsing time/);
		assert.match(html, /Days you browsed/);
		assert.match(html, /Websites visited/);
		assert.match(html, /Repeated activity/);
		assert.doesNotMatch(html, /activity outside your chosen dates/);
		assert.match(html, /<button[^>]*><span>Download<\/span><\/button>/);
		assert.doesNotMatch(
			html,
			/JSONL|Export preview|foreground observations|website origins|Recorded events|Saved patterns|Sessions|Things you did|<dt[^>]*>Habits|secret=local|background\.test|context-only\.test/,
		);
		if (!derived?.events.length)
			assert.match(
				html,
				/<button[^>]*disabled=""[^>]*><span>Download<\/span><\/button>/,
			);
	}
	const { ExportDisclosure: BusyExportDisclosure, checkDownload } =
		await server.ssrLoadModule(
			"/src/components/export-disclosure.tsx?check-loading",
		);
	const busyHtml = renderToStaticMarkup(
		createElement(BusyExportDisclosure, { derived: exportData }),
	);
	assert.match(busyHtml, /<button[^>]*aria-busy="true"[^>]*disabled=""/);
	assert.match(
		busyHtml,
		/<svg(?=[^>]*aria-hidden="true")(?=[^>]*motion-safe:animate-spin)[^>]*>/,
	);
	assert.match(busyHtml, /<span>Preparing…<\/span>/);
	assert.match(busyHtml, /<fieldset disabled=""/);
	const originalFrame = globalThis.requestAnimationFrame;
	const originalDocument = globalThis.document;
	const frames = [];
	const busyStates = [];
	const downloadCalls = [];
	const errors = [];
	try {
		globalThis.requestAnimationFrame = (callback) => {
			frames.push(callback);
			return frames.length;
		};
		globalThis.document = {
			body: { appendChild: () => {} },
			createElement: () => ({
				click: () => downloadCalls.push("download"),
				remove: () => {},
			}),
		};
		const input = { ...exportData, contexts: [], memories: [] };
		const run = (busy = false) =>
			checkDownload(
				input,
				busy,
				(value) => busyStates.push(value),
				(value) => errors.push(value),
				() => {},
			);
		await run(true);
		assert.deepEqual(frames, [], "busy clicks must not start another export");
		const pending = run();
		assert.deepEqual(busyStates, [true]);
		assert.equal(frames.length, 1);
		frames.shift()(0);
		assert.deepEqual(
			downloadCalls,
			[],
			"first frame must remain free for loading feedback to paint",
		);
		assert.equal(frames.length, 1);
		frames.shift()(16);
		await pending;
		assert.deepEqual(downloadCalls, ["download"]);
		assert.deepEqual(busyStates, [true, false]);
		globalThis.document.createElement = () => {
			throw new Error("download failed");
		};
		const failed = run();
		frames.shift()(32);
		frames.shift()(48);
		await failed;
		assert.deepEqual(
			busyStates,
			[true, false, true, false],
			"failed exports must clear loading too",
		);
		assert.equal(downloadCalls.length, 1);
		assert.match(errors.at(-1), /Nothing was downloaded/);
	} finally {
		if (originalFrame === undefined) delete globalThis.requestAnimationFrame;
		else globalThis.requestAnimationFrame = originalFrame;
		if (originalDocument === undefined) delete globalThis.document;
		else globalThis.document = originalDocument;
	}
	focusConnectorsHeading(null); // Detach must not access window.
	const originalWindow = globalThis.window;
	const calls = [];
	const heading = {
		scrollIntoView: () => calls.push("scroll"),
		focus: (options) => calls.push(options),
	};
	try {
		globalThis.window = { location: { hash: "#other-section" } };
		focusConnectorsHeading(heading);
		assert.deepEqual(
			calls,
			[],
			"ordinary Home visits must not scroll or steal focus",
		);
		globalThis.window.location.hash = "#connectors-heading";
		focusConnectorsHeading(heading);
		assert.deepEqual(
			calls,
			["scroll", { preventScroll: true }],
			"mounting a deep-link target scrolls then focuses it",
		);
	} finally {
		if (originalWindow === undefined) delete globalThis.window;
		else globalThis.window = originalWindow;
	}
	console.log(
		"Activity + recurring patterns UI passed: SSR, shared metrics, scoped prompts, connected-only overview and selected-pattern actions.",
	);
} finally {
	await server.close();
}
