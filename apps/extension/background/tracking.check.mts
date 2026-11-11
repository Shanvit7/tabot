// Actual internal/external listeners + real foreground sampler and ingestion pipeline.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import * as shared from "@tabot/shared";

const rows: shared.StoredIngestRecord[] = [];
const savedNotes = [
	{
		id: "note-1",
		text: "Project notes",
		createdAt: 123,
		title: "Project guide",
		host: "example.com",
		url: "https://example.com/guide?secret=hidden",
		tabId: 12,
	},
	{
		id: "note-2",
		text: "Project notes elsewhere",
		createdAt: 124,
		title: "Other guide",
		host: "other.example",
		url: "https://other.example/guide",
		tabId: 13,
	},
];
mock.module("@tabot/shared", {
	namedExports: {
		...shared,
		prunePageObservations: async () => ({ more: false }),
		bulkInsertIngestRecords: async (
			_db: unknown,
			batch: shared.StoredIngestRecord[],
		) => {
			rows.push(...batch);
			return { inserted: batch.length, duplicates: 0 };
		},
	},
});
mock.module("../storage/client", {
	namedExports: {
		getStorageDb: async () => ({
			findEvent: async () => undefined,
			advanceWorkflowTrainingGeneration: async () => 0,
			searchNotes: async (query: string, options?: { domain?: string }) =>
				shared.searchNoteRows(savedNotes, query, options),
		}),
	},
});
mock.module("../relay/relay", {
	namedExports: {
		startRelay: () => {},
		approveAuthorizationTransaction: async () => {},
		getAssistantConnections: async () => [],
		getRelayStatus: () => ({}),
		runRelaySanityCheck: async () => ({}),
	},
});

type Listener = (
	message: unknown,
	sender: unknown,
	reply: (response: unknown) => void,
) => boolean;
let internal: Listener;
let external: Listener;
let committed: (details: {
	frameId: number;
	tabId: number;
	url: string;
	timeStamp: number;
}) => void;
const event = () => ({ addListener: () => {} });
const local: Record<string, unknown> = { tabot_tracking_enabled: true };
const session: Record<string, unknown> = {};
const tab = {
	id: 1,
	windowId: 1,
	active: true,
	incognito: false,
	url: "https://example.com/",
};
let failWrite = false;
let holdWrites = false;
const writes: (() => void)[] = [];
let foregroundWait: Promise<void> | undefined;
let foregroundStarted = false;
const originalChrome = globalThis.chrome;
globalThis.chrome = {
	runtime: {
		id: "a".repeat(32),
		onMessage: {
			addListener: (listener: Listener) => {
				internal = listener;
			},
		},
		onMessageExternal: {
			addListener: (listener: Listener) => {
				external = listener;
			},
		},
	},
	storage: {
		local: {
			get: async () => ({ ...local }),
			remove: async () => {},
			set: async (values: Record<string, unknown>) => {
				if (failWrite) throw new Error("storage-write-failed");
				if (holdWrites)
					await new Promise<void>((resolve) => writes.push(resolve));
				Object.assign(local, values);
			},
		},
		session: {
			get: async () => ({ ...session }),
			set: async (values: Record<string, unknown>) =>
				Object.assign(session, values),
			remove: async (key: string) => {
				delete session[key];
			},
		},
	},
	alarms: { clear: async () => {}, create: async () => {}, onAlarm: event() },
	tabs: {
		get: async () => {
			foregroundStarted = true;
			await foregroundWait;
			return tab;
		},
		onCreated: event(),
		onUpdated: event(),
		onRemoved: event(),
		onActivated: event(),
	},
	webNavigation: {
		onCommitted: {
			addListener: (listener: typeof committed) => {
				committed = listener;
			},
		},
		onHistoryStateUpdated: event(),
	},
	windows: {
		get: async () => ({ focused: true, state: "normal" }),
		getAll: async () => [{ focused: true, state: "normal", tabs: [tab] }],
		onFocusChanged: event(),
	},
	idle: {
		queryState: async () => "active",
		setDetectionInterval: () => {},
		onStateChanged: event(),
	},
} as unknown as typeof chrome;
const send = (message: unknown, outside = false, sender: unknown = {}) =>
	new Promise<unknown>((resolve) => {
		assert.equal(
			(outside ? external : internal)(
				message,
				outside ? { url: "http://localhost:3000/home" } : sender,
				resolve,
			),
			true,
		);
	});
const toggle = (enabled: boolean, outside = false) =>
	send({ type: "SET_TRACKING", enabled }, outside);
const pageEvent = (timestamp: number) => {
	const instanceId = crypto.randomUUID();
	return send(
		{
			kind: "TABOT_PAGE_EVENT",
			version: shared.PAGE_PROTOCOL_VERSION,
			id: `${instanceId}:1`,
			instanceId,
			sequence: 1,
			type: "CLICK",
			timestamp,
			documentUrl: tab.url,
			metadata: { x: 1, y: 1 },
		},
		false,
		{
			id: chrome.runtime.id,
			frameId: 0,
			documentId: "document-1",
			url: tab.url,
			tab,
		},
	);
};
try {
	await import("../background");
	const popup = {
		id: chrome.runtime.id,
		url: `chrome-extension://${chrome.runtime.id}/popup.html`,
	};
	assert.equal(
		internal(
			{ type: "SEARCH_NOTES", query: "Project" },
			{ id: chrome.runtime.id, url: tab.url },
			() => {},
		),
		false,
	);
	assert.deepEqual(
		await send({ type: "SEARCH_NOTES", query: " " }, false, popup),
		{ ok: false, code: "invalid-query" },
	);
	assert.deepEqual(
		await send({ type: "SEARCH_NOTES", query: "x".repeat(201) }, false, popup),
		{ ok: false, code: "invalid-query" },
	);
	assert.deepEqual(
		await send(
			{ type: "SEARCH_NOTES", query: "Project", origin: "https://example.com" },
			false,
			popup,
		),
		{
			notes: [
				{
					id: "note-1",
					text: "Project notes",
					createdAt: 123,
					title: "Project guide",
					host: "example.com",
					url: "https://example.com/guide",
				},
			],
		},
	);
	assert.deepEqual(
		await send(
			{ type: "SEARCH_NOTES", query: "missing", origin: "https://example.com" },
			false,
			popup,
		),
		{ notes: [] },
	);
	for (let i = 0; i < 30; i++) await nextTurn();
	assert.ok(rows.some((row) => "type" in row && row.type === "PAGE_VISIBLE"));
	const beforePause = rows.length;
	assert.deepEqual(await toggle(false), { enabled: false });
	assert.ok(
		rows
			.slice(beforePause)
			.some((row) => "type" in row && row.type === "PAGE_HIDDEN"),
	);
	assert.deepEqual(await pageEvent(Date.now()), {
		status: "ignored",
		code: "capture-policy",
	});

	// Popup and dashboard changes serialize through one preference writer.
	holdWrites = true;
	const resume = toggle(true);
	const pause = toggle(false, true);
	await nextTurn();
	assert.equal(writes.length, 1);
	writes.shift()?.();
	assert.deepEqual(await resume, { enabled: true });
	await nextTurn();
	assert.equal(writes.length, 1);
	writes.shift()?.();
	assert.deepEqual(await pause, { enabled: false });
	holdWrites = false;
	assert.equal(local.tabot_tracking_enabled, false);
	assert.deepEqual(await send({ type: "GET_TRACKING" }, true), {
		enabled: false,
	});
	// A status read waits for an in-flight preference write and reports committed value.
	holdWrites = true;
	const pendingResume = toggle(true);
	await nextTurn();
	let statusResolved = false;
	let externalStatusResolved = false;
	const pendingStatus = send({ type: "GET_TRACKING" }).then((status) => {
		statusResolved = true;
		return status;
	});
	const pendingExternalStatus = send({ type: "GET_TRACKING" }, true).then(
		(status) => {
			externalStatusResolved = true;
			return status;
		},
	);
	await nextTurn();
	assert.equal(statusResolved, false);
	assert.equal(externalStatusResolved, false);
	writes.shift()?.();
	assert.deepEqual(await pendingResume, { enabled: true });
	assert.deepEqual(await pendingStatus, { enabled: true });
	assert.deepEqual(await pendingExternalStatus, { enabled: true });
	holdWrites = false;

	await toggle(false);
	await toggle(true, true);
	assert.deepEqual(
		await pageEvent((local.tabot_tracking_resumed_at as number) - 1),
		{ status: "ignored", code: "capture-policy" },
	);

	// Pause while a content message awaits Chrome foreground proof.
	foregroundStarted = false;
	let releaseForeground: () => void = () => {};
	foregroundWait = new Promise<void>((resolve) => {
		releaseForeground = resolve;
	});
	const crossingPause = pageEvent(Date.now());
	for (let i = 0; i < 100 && !foregroundStarted; i++) await nextTurn();
	assert.equal(foregroundStarted, true);
	await toggle(false);
	releaseForeground();
	foregroundWait = undefined;
	assert.deepEqual(await crossingPause, {
		status: "ignored",
		code: "capture-policy",
	});

	// Native navigation must also recheck tracking AFTER asynchronous focus proof.
	await toggle(true);
	foregroundStarted = false;
	foregroundWait = new Promise<void>((resolve) => {
		releaseForeground = resolve;
	});
	committed({ frameId: 0, tabId: tab.id, url: tab.url, timeStamp: Date.now() });
	for (let i = 0; i < 100 && !foregroundStarted; i++) await nextTurn();
	assert.equal(foregroundStarted, true);
	await toggle(false);
	releaseForeground();
	foregroundWait = undefined;
	for (let i = 0; i < 100; i++) {
		await nextTurn();
		const stats = await new Promise<shared.StatsSnapshot>((resolve) => {
			internal({ type: "GET_STATS" }, {}, (value) =>
				resolve(value as shared.StatsSnapshot),
			);
		});
		if (stats.outstandingRows === 0) break;
	}
	assert.equal(
		rows.some((row) => "type" in row && row.type === "NAVIGATION"),
		false,
	);

	failWrite = true;
	assert.deepEqual(await toggle(true, true), {
		ok: false,
		code: "tracking-update-failed",
	});
	assert.deepEqual(await send({ type: "GET_TRACKING" }), { enabled: false });
	assert.deepEqual(await send({ type: "GET_TRACKING" }, true), {
		enabled: false,
	});
	failWrite = false;
	assert.deepEqual(await toggle(true, true), { enabled: true });
	assert.equal(local.tabot_tracking_enabled, true);
	console.log(
		"tracking control: pause boundary, serialized toggles, delayed capture, rollback and resume passed",
	);
} finally {
	globalThis.chrome = originalChrome;
	mock.reset();
}
