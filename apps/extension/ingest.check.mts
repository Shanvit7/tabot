import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mock } from "node:test";
import { eventIdentity, orderEvents, type StoredTabEvent } from "@tabot/shared";
import { createEventPipeline } from "./event-pipeline";
import { ingestPageMessage } from "./page-ingress";
import { createPageOutbox } from "./page-outbox";

const instanceId = "12345678-1234-1234-1234-123456789012";
const row = (
	sequence: number,
	type: StoredTabEvent["type"] = "CLICK",
): StoredTabEvent => ({
	id: `${instanceId}:${sequence}`,
	type,
	tabId: 1,
	windowId: 1,
	timestamp: Date.now(),
	url: "https://example.com/old",
	source: { instanceId, sequence },
	...(type === "CLICK" ? { metadata: { x: 0, y: 0.25 } } : {}),
});
const microtasks = async () => {
	for (let i = 0; i < 30; i++) await Promise.resolve();
};
mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const tick = async (ms: number) => {
	mock.timers.tick(ms);
	await microtasks();
};
const commits: StoredTabEvent[][] = [];
const pipeline = createEventPipeline({
	now: Date.now,
	commit: async (rows) => {
		commits.push(rows);
		return { inserted: rows.length, duplicates: 0 };
	},
});
// Continuous sub-capacity arrivals must not restart first-item deadline.
const acks = [pipeline.ingest(row(1))];
await microtasks();
for (let i = 2; i <= 5; i++) {
	await tick(5);
	acks.push(pipeline.ingest(row(i)));
	await microtasks();
}
assert.equal(commits.length, 0);
await tick(5);
assert.equal(commits.length, 1);
assert.equal(commits[0].length, 5);
assert.ok((await Promise.all(acks)).every((ack) => ack.status === "persisted"));
const sparse = pipeline.ingest(row(6));
await microtasks();
await tick(24);
assert.equal(commits.length, 1);
await tick(1);
assert.equal((await sparse).status, "persisted");
const full = Array.from({ length: 128 }, (_, i) => pipeline.ingest(row(i + 7)));
await microtasks();
assert.equal(commits.at(-1)?.length, 128);
await Promise.all(full);
const click = pipeline.ingest(row(200));
const hidden = pipeline.ingest(row(201, "PAGE_HIDDEN"));
await microtasks();
assert.deepEqual(
	commits.at(-1)?.map((r) => r.type),
	["CLICK", "PAGE_HIDDEN"],
);
await Promise.all([click, hidden]);
await tick(100);
assert.equal(pipeline.stats().outstandingRows, 0);
// Late timer/admission flush and next deadline cannot inherit an old boundary timer.
{
	const batches: StoredTabEvent[][] = [];
	const p = createEventPipeline({
		now: Date.now,
		commit: async (rows) => {
			batches.push(rows);
			return { inserted: rows.length, duplicates: 0 };
		},
	});
	const first = p.ingest(row(250));
	await microtasks();
	mock.timers.setTime(Date.now() + 100);
	assert.equal(p.stats().persisted, 0, "late clock is not commit");
	const second = p.ingest(row(251));
	await microtasks();
	assert.equal(batches[0].length, 2);
	await Promise.all([first, second]);
	const boundary = p.ingest(row(252, "PAGE_HIDDEN"));
	await microtasks();
	await boundary;
	await tick(10);
	const next = p.ingest(row(253));
	await microtasks();
	await tick(15);
	assert.equal(batches.length, 2, "stale boundary timer flushed new batch");
	await tick(10);
	await next;
	assert.equal(batches.length, 3);
}
// A transient storage failure recovers inside the same immutable writer task.
{
	let attempts = 0;
	const p = createEventPipeline({
		now: Date.now,
		retryWait: 100,
		commit: async () => {
			if (++attempts === 1)
				throw Object.assign(new Error("abort"), { name: "AbortError" });
			return { inserted: 1, duplicates: 0 };
		},
	});
	const ack = p.ingest(row(260, "PAGE_HIDDEN"));
	await microtasks();
	assert.equal(p.stats().health, "retrying");
	await tick(1000);
	assert.equal((await ack).status, "persisted");
	assert.equal(attempts, 2);
}
// A late timer / slow commit cannot imply an ACK. Snapshot survives caller mutation.
let finish!: (counts: { inserted: number; duplicates: number }) => void;
let writes = 0;
const slowSnapshots: StoredTabEvent[][] = [];
const slow = createEventPipeline({
	now: Date.now,
	limits: { rows: 3, reserveRows: 1, bytes: 5000, reserveBytes: 1000 },
	commit: async (rows) => {
		slowSnapshots.push(rows);
		writes++;
		return new Promise((resolve) => {
			finish = resolve;
		});
	},
});
const original = row(300);
const replay = structuredClone(original);
let acked = false;
const first = slow.ingest(original).then((ack) => {
	acked = true;
	return ack;
});
original.url = "https://example.com/new";
await microtasks();
await tick(25);
assert.equal(acked, false);
assert.equal(slow.stats().activeRows, 1);
assert.equal(slowSnapshots[0][0].url, replay.url, "queued event re-enriched");
const duplicate = slow.ingest(replay);
assert.equal(
	(await slow.ingest({ ...row(300), timestamp: 1 })).status,
	"rejected",
);
const second = slow.ingest(row(301));
await microtasks();
assert.equal((await slow.ingest(row(302))).status, "retryable");
const boundary = slow.ingest(row(303, "PAGE_HIDDEN"));
await microtasks();
assert.equal(slow.stats().outstandingRows, 3);
assert.equal((await slow.ingest(row(304, "PAGE_HIDDEN"))).status, "retryable");
assert.equal(writes, 1);
finish({ inserted: 1, duplicates: 0 });
await microtasks();
assert.equal((await first).status, "persisted");
assert.equal((await duplicate).status, "persisted");
assert.equal(writes, 2);
finish({ inserted: 2, duplicates: 0 });
await Promise.all([second, boundary]);
// Exhaustion holds immutable work; new starts stop; explicit recovery runs held first.
let failing = true;
const fifo: string[] = [];
const blocked = createEventPipeline({
	now: Date.now,
	retryWait: 1,
	commit: async (rows) => {
		fifo.push(rows[0].id);
		if (failing)
			throw Object.assign(new Error("injected"), { name: "UnknownError" });
		return { inserted: rows.length, duplicates: 0 };
	},
});
const failed = blocked.ingest(row(400, "PAGE_HIDDEN"));
await microtasks();
const waiting = blocked.ingest(row(401, "PAGE_HIDDEN"));
await microtasks();
await tick(10);
await tick(10);
assert.equal((await failed).status, "retryable");
assert.equal((await waiting).status, "retryable");
assert.equal(blocked.stats().heldRows, 1);
assert.equal(blocked.stats().pendingRows, 1);
assert.equal(blocked.stats().outstandingRows, 2);
assert.equal(blocked.stats().retryCount, 2);
assert.equal(blocked.retry(), false);
failing = false;
assert.equal(blocked.retry(true), true);
await microtasks();
assert.deepEqual(fifo.slice(-2), [row(400).id, row(401).id]);
assert.equal(blocked.stats().outstandingRows, 0);
let attempts = 0;
const permanent = createEventPipeline({
	now: Date.now,
	commit: async () => {
		attempts++;
		throw Object.assign(new Error("private"), { name: "QuotaExceededError" });
	},
});
await permanent.ingest(row(500, "PAGE_HIDDEN"));
await tick(100_000);
assert.equal(attempts, 1);
assert.equal(permanent.stats().health, "blocked");
assert.equal(permanent.retry(), false);
assert.equal(permanent.stats().lastErrorCode, "QuotaExceededError");
const byteBound = createEventPipeline({
	now: Date.now,
	limits: { bytes: 1, reserveBytes: 0 },
	commit: async () => assert.fail("over byte budget"),
});
assert.equal((await byteBound.ingest(row(501))).status, "retryable");
assert.equal(byteBound.stats().pendingBytes, 0);
// Untrusted protocol + sender, delayed policy, committed replay while paused.
let enabled = true;
const history = new Map<string, StoredTabEvent>(); // Scheduler/contract test only, NOT browser durability proof.
const pages = createEventPipeline({
	now: Date.now,
	commit: async (rows) => {
		for (const r of rows) history.set(r.id, r);
		return { inserted: rows.length, duplicates: 0 };
	},
});
const sender = {
	id: "extension",
	frameId: 0,
	url: "https://example.com/old",
	tab: { id: 1, windowId: 1 },
};
const message = {
	...row(600, "PAGE_VISIBLE"),
	kind: "TABOT_PAGE_EVENT",
	version: 1,
	instanceId,
	sequence: 600,
	documentUrl: sender.url,
};
const deps = {
	extensionId: "extension",
	pipeline: pages,
	find: async (id: string) => history.get(id),
	eligible: async () => enabled,
	captureIdentity: async (value: unknown) =>
		createHmac("sha256", "test-install-key")
			.update(JSON.stringify(value))
			.digest("hex"),
};
assert.equal(
	(await ingestPageMessage({ ...message, version: 0 }, sender, deps)).status,
	"rejected",
);
assert.equal(
	(await ingestPageMessage(message, { ...sender, id: "foreign" }, deps)).status,
	"rejected",
);
assert.equal(
	(
		await ingestPageMessage(
			{ ...message, timestamp: Date.now() + 6000 },
			sender,
			deps,
		)
	).status,
	"rejected",
);
assert.equal(
	(await ingestPageMessage(message, sender, deps)).status,
	"persisted",
);
enabled = false;
assert.equal(
	(
		await ingestPageMessage(
			message,
			{ ...sender, url: "https://example.com/new" },
			deps,
		)
	).status,
	"persisted",
);
assert.equal(history.get(message.id)?.url, sender.url);
assert.equal(
	(
		await ingestPageMessage(
			{ ...message, id: `${instanceId}:601`, sequence: 601 },
			sender,
			deps,
		)
	).status,
	"ignored",
);
enabled = true;
assert.equal(
	(
		await ingestPageMessage(
			{ ...message, id: `${instanceId}:603`, sequence: 603 },
			{ ...sender, url: "https://example.com/new" },
			deps,
		)
	).status,
	"ignored",
	"unseen retry cannot acquire new URL",
);
assert.equal(
	(
		await ingestPageMessage(
			{
				...message,
				id: `${instanceId}:602`,
				sequence: 602,
				timestamp: Date.now() - 11_000,
			},
			sender,
			deps,
		)
	).status,
	"ignored",
);
// Chrome's sender.url can stay old after SPA navigation; current top-frame tab URL is evidence.
const spaSender = {
	...sender,
	tab: { ...sender.tab, url: "https://example.com/new" },
};
const spaEvent = {
	...message,
	id: `${instanceId}:604`,
	sequence: 604,
	documentUrl: spaSender.tab.url,
};
assert.equal(
	(await ingestPageMessage(spaEvent, spaSender, deps)).status,
	"persisted",
);
assert.equal(history.get(spaEvent.id)?.url, spaSender.tab.url);
assert.equal(
	(
		await ingestPageMessage(
			{ ...message, id: `${instanceId}:605`, sequence: 605 },
			spaSender,
			deps,
		)
	).status,
	"ignored",
);
const privateUrl = "https://example.com/work?token=private#private";
const privateSender = {
	...sender,
	url: privateUrl,
	tab: { ...sender.tab, url: privateUrl },
};
const privateEvent = {
	...message,
	id: `${instanceId}:606`,
	sequence: 606,
	documentUrl: privateUrl,
};
assert.equal(
	(await ingestPageMessage(privateEvent, privateSender, deps)).status,
	"persisted",
);
assert.equal(new URL(history.get(privateEvent.id)?.url as string).search, "");
assert.match(
	history.get(privateEvent.id)?.source?.captureIdentity ?? "",
	/^[0-9a-f]{64}$/,
);
assert.equal(
	JSON.stringify(history.get(privateEvent.id)).includes("token=private"),
	false,
);
assert.equal(
	(await ingestPageMessage(privateEvent, privateSender, deps)).status,
	"persisted",
	"sanitized committed replay remains idempotent",
);
assert.equal(
	(
		await ingestPageMessage(privateEvent, privateSender, {
			...deps,
			captureIdentity: async (value) =>
				createHmac("sha256", "rotated-test-key")
					.update(JSON.stringify(value))
					.digest("hex"),
		})
	).status,
	"rejected",
	"changed keyed identity cannot replace committed event",
);
assert.equal(
	(
		await ingestPageMessage(privateEvent, privateSender, {
			...deps,
			captureIdentity: async () => {
				throw new Error("key unavailable");
			},
		})
	).code,
	"privacy-processing-failed",
	"key failure fails closed before persistence",
);
assert.equal(
	(await ingestPageMessage(message, spaSender, deps)).status,
	"persisted",
);
// Same-time order is source sequence, not PK UUID sorting; derivation uses this helper.
assert.deepEqual(
	orderEvents([row(2, "PAGE_HIDDEN"), row(1, "PAGE_VISIBLE")]).map(
		(r) => r.type,
	),
	["PAGE_VISIBLE", "PAGE_HIDDEN"],
);
assert.equal(
	eventIdentity(row(1)),
	eventIdentity({ ...row(1), url: "https://changed.invalid/" }),
);
// Transport retries retain identity, max concurrency/outbox memory stay bounded.
const sent: string[] = [];
const errors: string[] = [];
let transportCalls = 0;
const outbox = createPageOutbox({
	documentUrl: () => sender.url,
	retryWait: 1,
	onFailure: (code) => errors.push(code),
	send: async (m) => {
		sent.push(JSON.stringify(m));
		if (++transportCalls < 3) throw new Error("lost-ack");
		return { status: "persisted", id: m.id };
	},
});
outbox.add("CLICK", { x: 0, y: 0.5 });
await microtasks();
await tick(10);
await tick(10);
assert.equal(sent.length, 3);
assert.equal(new Set(sent).size, 1);
assert.equal(outbox.stats().rows, 0);
const saturation = createPageOutbox({
	documentUrl: () => sender.url,
	onFailure: (code) => errors.push(code),
	send: async () => new Promise(() => {}),
});
for (let i = 0; i < 300; i++) saturation.add("KEY_ACTIVITY");
assert.equal(saturation.stats().rows, 256);
assert.equal(saturation.stats().active, 4);
assert.ok(errors.includes("outbox-capacity"));
// Historical type names survive normalization; no retired production producer is restored.
const historical = [
	{ ...row(800, "SW_POPUP_OPEN"), metadata: { source: "popup" as const } },
	{ ...row(801, "SW_TRACKING_TOGGLE"), metadata: { enabled: false } },
	{ ...row(802, "SW_DOWNLOAD"), metadata: { state: 0 } },
	{ ...row(803, "SW_LIFECYCLE"), metadata: { lifecycle: "startup" as const } },
	{ ...row(804, "SCROLL"), metadata: { scrollY: 0 } },
];
const historicalAcks = historical.map((event) => pipeline.ingest(event));
await microtasks();
pipeline.flush();
await Promise.all(historicalAcks);
assert.deepEqual(commits.at(-1), historical);
mock.timers.reset();
console.log(
	"ingest: scheduler, ACK ownership, FIFO, limits, retries, replay/policy, protocol and outbox passed",
);
