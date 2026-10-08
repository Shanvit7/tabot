import assert from "node:assert/strict";
import { isForegroundTab, startForegroundTracking } from "./foreground";

const savedNow = Date.now;
let now = 1_700_000_000_000;
Date.now = () => now;
let focused = true;
let idle = "active";
let tabId = 1;
let fail = false;
const store: Record<string, unknown> = {};
const emitted: { type: string; tabId: number; timestamp: number }[] = [];
const alarms: { name: string; periodInMinutes: number }[] = [];
const activated: (() => void)[] = [];
const focusChanged: (() => void)[] = [];
const idleChanged: (() => void)[] = [];
const alarmListeners: ((alarm: { name: string }) => void)[] = [];
const tab = () => ({
	id: tabId,
	windowId: 1,
	active: true,
	incognito: false,
	url: `https://site${tabId}.com`,
});

globalThis.chrome = {
	storage: {
		session: {
			get: async (key: string) => ({ [key]: store[key] }),
			set: async (values: Record<string, unknown>) => {
				Object.assign(store, values);
			},
			remove: async (key: string) => {
				delete store[key];
			},
		},
	},
	tabs: {
		get: async (id: number) => ({ ...tab(), active: id === tabId }),
		onActivated: {
			addListener: (listener: () => void) => activated.push(listener),
		},
	},
	windows: {
		get: async () => ({ focused, state: "normal" }),
		getAll: async () => {
			if (fail) throw new Error("browser state unavailable");
			return [{ focused, state: "normal", tabs: [tab()] }];
		},
		onFocusChanged: {
			addListener: (listener: () => void) => focusChanged.push(listener),
		},
	},
	idle: {
		queryState: async () => idle,
		setDetectionInterval: (seconds: number) => assert.equal(seconds, 60),
		onStateChanged: {
			addListener: (listener: () => void) => idleChanged.push(listener),
		},
	},
	alarms: {
		create: async (name: string, options: { periodInMinutes: number }) => {
			alarms.push({ name, ...options });
		},
		onAlarm: {
			addListener: (listener: (alarm: { name: string }) => void) =>
				alarmListeners.push(listener),
		},
	},
} as unknown as typeof chrome;

try {
	const emit = async (
		type: string,
		state: { tabId: number; timestamp: number },
	) => {
		emitted.push({ type, ...state });
	};
	const sample = startForegroundTracking(emit);
	await sample();
	assert.equal(emitted.at(-1)?.type, "PAGE_VISIBLE");
	assert.equal(alarms[0].periodInMinutes, 0.5);
	assert.ok(
		activated.length &&
			focusChanged.length &&
			idleChanged.length &&
			alarmListeners.length,
	);
	assert.equal(await isForegroundTab(1), true);
	assert.equal(await isForegroundTab(2), false);

	// Last sample survives a fresh tracker (MV3 service-worker restart).
	now += 30_000;
	const restarted = startForegroundTracking(emit);
	await restarted();
	assert.equal(emitted.at(-1)?.timestamp, now);
	const lastSeen = now;

	// Switch tabs: close old tab before starting new tab.
	tabId = 2;
	now += 30_000;
	await restarted();
	assert.deepEqual(
		emitted.slice(-2).map((event) => [event.type, event.tabId]),
		[
			["PAGE_HIDDEN", 1],
			["PAGE_VISIBLE", 2],
		],
	);
	assert.equal(emitted.at(-2)?.timestamp, now);

	// Browser focus loss and idle/lock stop counting despite an open tab.
	focused = false;
	now += 30_000;
	await restarted();
	assert.equal(await isForegroundTab(2), false);
	assert.equal(emitted.at(-1)?.type, "PAGE_HIDDEN");
	assert.deepEqual(store, {});
	focused = true;
	idle = "locked";
	const count = emitted.length;
	await restarted();
	assert.equal(emitted.length, count);
	assert.equal(await isForegroundTab(2), false);
	idle = "active";
	await restarted();
	assert.equal(emitted.at(-1)?.type, "PAGE_VISIBLE");

	// Sleep/delayed alarm: close at last observation, not 91 minutes later.
	const beforeSleep = now;
	now += 91 * 60_000;
	await restarted();
	assert.deepEqual(
		emitted.slice(-2).map((event) => [event.type, event.timestamp]),
		[
			["PAGE_HIDDEN", beforeSleep],
			["PAGE_VISIBLE", now],
		],
	);
	assert.ok(beforeSleep > lastSeen);

	// Tracking pause emits a terminal boundary before capture is disabled.
	await restarted(false);
	assert.equal(emitted.at(-1)?.type, "PAGE_HIDDEN");
	assert.deepEqual(store, {});
	await restarted();
	assert.equal(emitted.at(-1)?.type, "PAGE_VISIBLE");

	// API failure cannot turn into a positive foreground observation.
	fail = true;
	const warn = console.warn;
	console.warn = () => {};
	try {
		const beforeFailure = emitted.length;
		await restarted();
		assert.equal(emitted.length, beforeFailure);
	} finally {
		console.warn = warn;
	}
	console.log("foreground capture: all assertions passed");
} finally {
	Date.now = savedNow;
}
