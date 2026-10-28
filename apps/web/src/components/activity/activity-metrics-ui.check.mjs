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
	cacheDir: "node_modules/.vite-activity-check",
	root: fileURLToPath(new URL("../../../", import.meta.url)),
	resolve: { alias: { "~": fileURLToPath(new URL("../../", import.meta.url)) } },
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
							/import \{ useEffect, useState \} from ['"]react['"];/,
							"const { useEffect, useState } = globalThis.checkHomeHooks;",
						)
						.replace(
							/import \{ fetchEvents, fetchStats, fetchStorageCounts \} from ['"]~\/lib\/home-data['"];/,
							"const { fetchEvents, fetchStats, fetchStorageCounts } = globalThis.checkHomeTransport;",
						);
				}

				if (id.endsWith("/components/activity/export-disclosure.tsx?check-loading")) {
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
		const oldDocument = globalThis.document;
		globalThis.document = {
			hidden: false,
			addEventListener: () => {},
			removeEventListener: () => {},
		};
		const oldHooks = globalThis.checkHomeHooks;
		const oldTransport = globalThis.checkHomeTransport;
		const intervals = new Map();
		let cells;
		let cursor;
		let effect;
		let statsReplies;
		let countReplies;
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
			fetchStorageCounts: () =>
				read(countReplies).then((eventCount) =>
					eventCount === null ? null : { eventCount, pageCount: 0 },
				),
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
				countReplies = [];
				eventReplies = [];
				assert.equal(render().initialized, false);
				const cleanup = effect();
				assert.equal(statsReplies.length, 1);
				assert.equal(countReplies.length, 1, "initial reads start in parallel");
				assert.equal(eventReplies.length, 0, "full history waits for count");
				return cleanup;
			};
			const rows = [{ id: 1 }];
			let cleanup = start();
			statsReplies[0].resolve({ totalEvents: 1 });
			countReplies[0].resolve(1);
			await flush();
			assert.equal(
				render().initialized,
				false,
				"stats first must not expose empty UI",
			);
			assert.equal(eventReplies.length, 1);
			eventReplies[0].resolve(rows);
			await flush();
			assert.equal(render().initialized, true);
			assert.equal(render().events, rows);
			intervals.get(5000)();
			countReplies.at(-1).resolve(1);
			await flush();
			assert.equal(
				render().events,
				rows,
				"unchanged counts skip full history reads and preserve identity",
			);
			assert.equal(eventReplies.length, 1);
			intervals.get(5000)();
			countReplies.at(-1).resolve(2);
			await flush();
			const revised = [{ id: 1 }, { id: 2 }];
			eventReplies.at(-1).resolve(revised);
			await flush();
			assert.equal(render().events, revised, "new events refresh full history");
			intervals.get(5000)();
			countReplies.at(-1).resolve(0);
			await flush();
			eventReplies.at(-1).resolve([]);
			await flush();
			assert.deepEqual(
				render().events,
				[],
				"empty snapshots must clear stale activity",
			);
			assert.equal("derived" in render(), false);
			intervals.get(5000)();
			countReplies.at(-1).resolve(1);
			await flush();
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
			countReplies[0].resolve(0);
			await flush();
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
			countReplies[0].resolve(1);
			await flush();
			eventReplies[0].resolve(null);
			await flush();
			assert.equal(
				render().initialized,
				true,
				"a timed-out read completes setup without pretending history is empty",
			);
			assert.equal(render().events, null);
			intervals.get(5000)();
			countReplies.at(-1).resolve(0);
			await flush();
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
			countReplies[0].resolve(null);
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
			countReplies[0].resolve(1);
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
			if (oldDocument === undefined) delete globalThis.document;
			else globalThis.document = oldDocument;
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
	const { GraphLoading } = await server.ssrLoadModule(
		"/src/components/ui/work-panels.tsx",
	);
	for (const className of [undefined, "min-h-110"]) {
		const html = renderToStaticMarkup(
			createElement(GraphLoading, { className }),
		);
		assert.match(html, /role="status"/);
		assert.match(html, /aria-live="polite"/);
		assert.match(html, /aria-atomic="true"/);
		assert.ok(
			html.includes(className ?? "min-h-105"),
			"reserve the actual canvas height",
		);
		assert.match(html, /<svg aria-hidden="true"/);
		assert.match(html, /MAP IN PROGRESS/);
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
		assert.match(html, /<button type="button">Show all time<\/button>/);
		assert.doesNotMatch(
			html,
			/Connecting the dots|Your map is on its way|aria-busy="true"|progressbar/,
		);
	}
	const graphSources = await Promise.all(
		[
			"../../routes/home.tsx",
			"../../routes/activities.tsx",
			"../../routes/recurring-patterns.tsx",
		].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
	);
	for (const source of graphSources) {
		assert.doesNotMatch(
			source,
			/NetworkGraph|ContextGraph|ActivityFlowGraph|RecurrenceMap|<Suspense/,
			"heavy graph UI stays out of active routes",
		);
	}
	// The route must be importable on the server without loading window-only graph dependencies.
	const { Route } = await server.ssrLoadModule("/src/routes/activities.tsx");
	assert.ok(Route);
	assert.ok(
		(await server.ssrLoadModule("/src/routes/recurring-patterns.tsx")).Route,
	);
	const { RecurringPatternAssistant } = await server.ssrLoadModule(
		"/src/components/recurring-patterns/assistant.tsx",
	);
	const { CheckAssistantContext } = await server.ssrLoadModule(
		"/src/providers/assistant-connection.tsx",
	);
	for (const connection of [false, null, undefined, true]) {
		const connected = connection === true;
		const html = renderToStaticMarkup(
			createElement(RecurringPatternAssistant, { connected }),
		);
		if (!connected) {
			assert.match(html, /Ask AI/);
			assert.match(html, /href="\/home#connectors-heading"/);
		} else {
			assert.match(html, /Ask ChatGPT/);
			const prompt = linkUrl(html).searchParams.get("q");
			assert.match(prompt, /list_recurring_patterns/);
			assert.match(prompt, /\{"limit":10\}/);
			assert.match(prompt, /heuristic similarity/);
		}
		for (const memoryId of ["pattern-1", 'pattern-"2"']) {
			const selected = renderToStaticMarkup(
				createElement(
					CheckAssistantContext.Provider,
					{ value: { chatgpt: connected, claude: false } },
					createElement(RecurringPatternAssistant, { memoryId, connected }),
				),
			);
			assert.doesNotMatch(selected, /raw events stay local|mt-5|w-full/);
			assert.match(selected, /min-h-11/);
			assert.match(selected, /text-xs font-medium/);
			assert.match(selected, /mr-1\.5 size-3\.5/);
			assert.doesNotMatch(selected, /text-sm|font-semibold/);
			if (!connected) {
				assert.match(selected, /Ask AI/);
				assert.match(selected, /href="\/home#connectors-heading"/);
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
		"/src/components/recurring-patterns/map.tsx",
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
	for (const connection of [
		{ chatgpt: false, claude: false },
		{ chatgpt: true, claude: false },
		{ chatgpt: false, claude: true },
		{ chatgpt: true, claude: true },
	]) {
		for (const memory of memories) {
			const html = renderToStaticMarkup(
				createElement(RecurrenceMap, {
					memories,
					selectedId: memory.id,
					onSelect: () => {},
					rowActions: (memoryId) =>
						createElement(
							CheckAssistantContext.Provider,
							{ value: connection },
							createElement(RecurringPatternAssistant, {
								memoryId,
								connected: connection.chatgpt,
							}),
						),
				}),
			);
			const rows = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(
				(match) => match[1],
			);
			assert.equal(rows.length, 2);
			for (const [index, row] of rows.entries()) {
				const rowMemory = memories.at(index);
				assert.ok(rowMemory, "Each rendered row must belong to a memory");
				assert.match(row, /aria-label="[^"]+ actions"/);
				assert.ok(
					row.indexOf("</button>") < row.indexOf("<a "),
					"assistant links must be siblings, not nested inside row button",
				);
				if (rowMemory.id === memory.id) {
					assert.match(row, /aria-pressed="true"/);
				} else {
					assert.match(row, /aria-pressed="false"/);
				}
				const actions = [...row.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)];
				if (!connection.chatgpt && !connection.claude) {
					assert.equal(actions.length, 1);
					assert.match(actions[0]?.[1] ?? "", /Ask AI/);
					assert.match(
						actions[0]?.[0] ?? "",
						/href="\/home#connectors-heading"/,
					);
				} else {
					assert.equal(
						actions.length,
						Number(connection.chatgpt) + Number(connection.claude),
					);
					if (connection.chatgpt) assert.match(row, /Ask ChatGPT/);
					if (connection.claude) assert.match(row, /Ask Claude/);
					assert.ok(
						row.includes(
							encodeURIComponent(
								`get_memory with id ${JSON.stringify(rowMemory.id)}`,
							),
						),
					);
				}
				assert.doesNotMatch(row, /w-56/, "no fixed-width action column");
			}
		}
	}
	const [
		{ buildActivityFlow },
		{ AskChatGpt },
		{ Connectors },
		{ focusConnectorsHeading },
		{
			buildActivityMetrics,
			activityMetricsResponse,
			activityMetricsPrompt,
			chatGptPromptUrl,
		},
	] = await Promise.all([
		server.ssrLoadModule("/src/components/activity/activity-flow-data.ts"),
		server.ssrLoadModule("/src/components/assistant-connection/assistant-cta.tsx"),
		server.ssrLoadModule("/src/components/assistant-connection/connectors.tsx"),
		server.ssrLoadModule("/src/components/assistant-connection/connector-utils.ts"),
		server.ssrLoadModule(
			`/@fs${fileURLToPath(new URL("../../../../../packages/shared/src/index.ts", import.meta.url))}`,
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
	const overview = renderToStaticMarkup(
		createElement(AskChatGpt, {
			href: chatGptPromptUrl(activityMetricsPrompt(from, to)),
			connected: true,
		}),
	);
	assert.match(overview, /Ask ChatGPT/);
	assert.match(overview, /text-sm font-semibold/);
	assert.doesNotMatch(linkUrl(overview).searchParams.get("q"), /"origin"/);
	const disconnectedOverview = renderToStaticMarkup(
		createElement(
			CheckAssistantContext.Provider,
			{ value: { chatgpt: false, claude: false } },
			createElement(AskChatGpt, {
				href: chatGptPromptUrl(activityMetricsPrompt(from, to)),
				connected: false,
			}),
		),
	);
	const claudeConnectedOverview = renderToStaticMarkup(
		createElement(
			CheckAssistantContext.Provider,
			{ value: { chatgpt: false, claude: true } },
			createElement(AskChatGpt, {
				href: chatGptPromptUrl(activityMetricsPrompt(from, to)),
				connected: false,
			}),
		),
	);
	assert.match(claudeConnectedOverview, /Ask Claude/);
	assert.doesNotMatch(claudeConnectedOverview, /Ask AI/);
	assert.match(claudeConnectedOverview, /href="https:\/\/claude\.ai\/new\?q=/);
	assert.match(
		claudeConnectedOverview,
		/border-\[#476151\] bg-white text-preview-ink/,
	);
	assert.doesNotMatch(claudeConnectedOverview, /Ask ChatGPT/);
	assert.match(disconnectedOverview, /href="\/home#connectors-heading"/);
	assert.match(disconnectedOverview, /Ask AI/);
	assert.doesNotMatch(disconnectedOverview, /Ask Claude/);
	const bothConnectedOverview = renderToStaticMarkup(
		createElement(
			CheckAssistantContext.Provider,
			{ value: { chatgpt: true, claude: true, order: ["claude", "chatgpt"] } },
			createElement(AskChatGpt, {
				href: chatGptPromptUrl(activityMetricsPrompt(from, to)),
				connected: true,
			}),
		),
	);
	assert.match(bothConnectedOverview, /<summary[^>]*>.*?Ask AI/);
	assert.match(bothConnectedOverview, /Ask ChatGPT/);
	assert.match(bothConnectedOverview, /Ask Claude/);
	assert.ok(
		bothConnectedOverview.indexOf("Ask Claude") <
			bothConnectedOverview.indexOf("Ask ChatGPT"),
		"chooser lists first-connected assistant first",
	);
	assert.match(
		renderToStaticMarkup(createElement(Connectors)),
		/id="connectors-heading" tabindex="-1"/,
	);
	for (const connection of [
		{ chatgpt: false, claude: false },
		{ chatgpt: true, claude: false },
		{ chatgpt: false, claude: true },
		null,
		undefined,
	]) {
		const html = renderToStaticMarkup(
			createElement(
				CheckAssistantContext.Provider,
				{ value: connection },
				createElement(Connectors),
			),
		);
		assert.match(html, /role="status"/);
		assert.match(html, /grid-cols-1.*sm:grid-cols-2/);
		assert.match(html, /Gemini.*Coming soon/);
		assert.doesNotMatch(html, /tabot-mcp\.shanvit7\.workers\.dev\/mcp/);
		assert.match(html, /border-\(--work-ink\) bg-\(--work-ink\) text-white/);
		if (connection?.chatgpt !== true) {
			assert.match(html, /href="https:\/\/chatgpt\.com\/\?q=/);
			assert.match(html, /target="_blank"/);
			assert.match(html, /opens ChatGPT in a new tab/);
			assert.match(html, /hover:bg/);
			if (connection === null) assert.match(html, /Status unknown/);
			else if (connection === undefined) assert.match(html, /Checking…/);
		} else {
			assert.match(html, /cursor-default/);
			assert.match(html, /ChatGPT<\/span><span role="status"[^>]*>Connected/);
		}
		if (connection?.claude === true) {
			assert.match(html, /Claude/);
			assert.match(html, /Connected/);
			assert.doesNotMatch(html, /Connect Claude/);
			assert.doesNotMatch(
				html,
				/href="https:\/\/claude\.ai\/customize\/connectors/,
			);
		} else {
			assert.match(html, /Connect Claude/);
			assert.match(
				html,
				/href="https:\/\/claude\.ai\/customize\/connectors\?q=Tabot"/,
			);
			assert.match(html, /opens Claude connectors in a new tab/);
		}
	}
	const { ExportDisclosure } = await server.ssrLoadModule(
		"/src/components/activity/export-disclosure.tsx",
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
			"/src/components/activity/export-disclosure.tsx?check-loading",
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
		"Activity + recurring patterns UI passed: SSR, shared metrics, scoped prompts, provider-aware Ask AI actions.",
	);
} finally {
	await server.close();
}
