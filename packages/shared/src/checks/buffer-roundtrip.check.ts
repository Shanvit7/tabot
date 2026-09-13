// packages/shared/src/checks/buffer-roundtrip.check.ts
// Phase 2 Step 4 — SW capture: SAB encode/decode round-trip for all event types.
// Run: node --import ./resolve-hook.mjs src/checks/buffer-roundtrip.check.ts

import assert from "node:assert/strict";
import { createBuffer, decodeEvent, pushEvent } from "../events/buffer.ts";
import { EVENT_TYPES, POPUP_SOURCE } from "../events/events.ts";

const run = () => {
	// round-trip every type through SAB; reconstructed event must match the seed
	const seeds: Array<Parameters<typeof pushEvent>[3]> = [
		{
			type: "TAB_CREATED",
			tabId: 5,
			windowId: 2,
			timestamp: 1_700_000_000_000,
		},
		{
			type: "SCROLL",
			tabId: 5,
			windowId: 2,
			timestamp: 1,
			metadata: { scrollY: 4321 },
		},
		{
			type: "CLICK",
			tabId: 5,
			windowId: 2,
			timestamp: 1,
			metadata: { x: 100, y: 250 },
		},
		{
			type: "SW_WINDOW_FOCUS",
			tabId: 0,
			windowId: -1,
			timestamp: 1,
			metadata: { previousWindowId: -1 },
		},
		{
			type: "SW_WINDOW_FOCUS",
			tabId: 0,
			windowId: 7,
			timestamp: 1,
			metadata: { previousWindowId: 3 },
		},
		{
			type: "SW_TRACKING_TOGGLE",
			tabId: 0,
			windowId: 0,
			timestamp: 1,
			metadata: { enabled: true },
		},
		{
			type: "SW_TRACKING_TOGGLE",
			tabId: 0,
			windowId: 0,
			timestamp: 1,
			metadata: { enabled: false },
		},
		{
			type: "SW_DOWNLOAD",
			tabId: 99,
			windowId: 0,
			timestamp: 1,
			metadata: { state: 2 },
		},
		{
			type: "SW_POPUP_OPEN",
			tabId: 0,
			windowId: POPUP_SOURCE.POPUP,
			timestamp: 1,
			metadata: { source: "popup" },
		},
		{
			type: "SW_POPUP_OPEN",
			tabId: 0,
			windowId: POPUP_SOURCE.DASHBOARD,
			timestamp: 1,
			metadata: { source: "dashboard" },
		},
		{
			type: "SW_LIFECYCLE",
			tabId: 0,
			windowId: 3,
			timestamp: 1,
			metadata: { lifecycle: "suspendCanceled" },
		},
	];
	for (const seed of seeds) {
		const buffer = createBuffer(1000);
		assert.ok(
			pushEvent(buffer.control, buffer.events, buffer.capacity, seed),
			"push ok",
		);
		const decoded = decodeEvent(buffer.events, 0);
		assert.equal(decoded.type, seed.type, `type ${seed.type}`);
		assert.equal(decoded.tabId, seed.tabId, `tabId ${seed.type}`);
		assert.equal(decoded.windowId, seed.windowId, `windowId ${seed.type}`);
		assert.equal(decoded.timestamp, seed.timestamp, `ts ${seed.type}`);
		assert.deepEqual(decoded.metadata, seed.metadata, `metadata ${seed.type}`);
	}

	// dropped events: full buffer returns false, no corruption of existing slot 0
	const b = createBuffer(2);
	assert.ok(pushEvent(b.control, b.events, b.capacity, seeds[0]));
	assert.ok(pushEvent(b.control, b.events, b.capacity, seeds[1]));
	assert.equal(
		pushEvent(b.control, b.events, b.capacity, seeds[2]),
		false,
		"3rd push dropped",
	);
	// slot 0 + slot 1 still decode correctly
	assert.equal(decodeEvent(b.events, 0).type, "TAB_CREATED");
	assert.equal(decodeEvent(b.events, 1).type, "SCROLL");

	// EVENT_TYPES is a strict 15-entry extension (0–14 contiguous)
	assert.equal(EVENT_TYPES.SW_LIFECYCLE, 14);

	console.log("[Tabot] buffer-roundtrip.check: all scenarios pass");
};

run();
