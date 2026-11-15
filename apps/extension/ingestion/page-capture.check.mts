import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
	PAGE_OBSERVATION_PROTOCOL_VERSION,
	type StoredIngestRecord,
	type StoredPageObservation,
} from "@tabot/shared";
import { createEventPipeline } from "./event-pipeline";
import { ingestPageObservationMessage } from "./page-ingress";

const url = "https://github.com/acme/project/pull/42?private=remove#discussion";
const sender = {
	id: "extension-id",
	frameId: 0,
	documentId: "document-id",
	url,
	tab: { id: 7, windowId: 2, url, incognito: false },
};
const records = new Map<string, StoredPageObservation>();
const pipeline = createEventPipeline<StoredIngestRecord>({
	commit: async (rows) => {
		const pages = rows.filter(
			(row): row is StoredPageObservation =>
				"kind" in row && row.kind === "page-observation",
		);
		for (const row of pages) records.set(row.id, row);
		return {
			inserted: rows.length - pages.length,
			duplicates: 0,
			insertedPages: pages.length,
		};
	},
});
const deps = {
	extensionId: "extension-id",
	pipeline,
	find: async (id: string) => records.get(id),
	eligible: async () => true,
	captureIdentity: async (value: unknown) =>
		createHmac("sha256", "test-install-key")
			.update(JSON.stringify(value))
			.digest("hex"),
};
const message = {
	kind: "TABOT_PAGE_OBSERVATION",
	version: PAGE_OBSERVATION_PROTOCOL_VERSION,
	id: "12345678-1234-4234-8234-123456789012",
	timestamp: Date.now(),
	documentUrl: url,
	trigger: "auto-dwell",
	title:
		"Pull request 42 — contact john@example.com; token ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
	segments: [
		"Pull request 42, contact john@example.com; token ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
	],
	truncated: false,
	partial: false,
};
const ackPromise = ingestPageObservationMessage(message, sender, deps);
await new Promise((resolve) => setTimeout(resolve, 40));
const ack = await ackPromise;
assert.deepEqual(ack, { status: "persisted", id: message.id });
const stored = records.get(message.id);
assert.ok(stored);
assert.equal(stored.url, "https://github.com/acme/project/pull/42");
assert.equal(stored.segments.join(" ").includes("john@example.com"), true);
assert.equal(stored.segments.join(" ").includes("ghp_1234567890"), false);
assert.equal(JSON.stringify(stored).includes("private=remove"), false);
assert.equal(stored.trigger, "auto-dwell");
assert.equal(stored.title?.includes("john@example.com"), true);
assert.equal(stored.title?.includes("ghp_1234567890"), false);
assert.equal(stored.privacy.redacted, true);
assert.match(stored.pageKey, /^[0-9a-f]{64}$/);
assert.deepEqual(await ingestPageObservationMessage(message, sender, deps), {
	status: "persisted",
	id: message.id,
});
assert.equal(records.size, 1, "replay wrote duplicate page evidence");
const secondCapture = await ingestPageObservationMessage(
	{ ...message, id: "12345678-1234-4234-8234-123456789013" },
	sender,
	deps,
);
assert.deepEqual(secondCapture, {
	status: "persisted",
	id: "12345678-1234-4234-8234-123456789013",
});
assert.equal(records.size, 2, "capture does not require per-origin consent");
assert.equal(
	(
		await ingestPageObservationMessage(
			{ ...message, extra: "untrusted" },
			sender,
			deps,
		)
	).status,
	"rejected",
);
assert.equal(
	(await ingestPageObservationMessage(message, { ...sender, frameId: 1 }, deps))
		.status,
	"rejected",
);
assert.equal(
	(
		await ingestPageObservationMessage(
			message,
			{ ...sender, tab: { ...sender.tab, incognito: true } },
			deps,
		)
	).status,
	"rejected",
);
console.log(
	"page-capture: automatic capture, redaction, replay and sender checks passed",
);
