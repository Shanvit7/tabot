// packages/shared/src/checks/privacy.check.ts
// Privacy boundary validation: OpenRedaction redaction primitives + the
// sanitized-export path (docs/tech.md §1 "raw events are immutable source data").
// Run: node --import ./resolve-hook.mjs src/checks/privacy.check.ts

import assert from "node:assert/strict";
import type { BrowserContext } from "../contexts/contexts.ts";
import type { StoredTabEvent } from "../events/db.ts";
import { logger } from "../lib/logger.ts";
import type { Memory } from "../memories/memories.ts";
import { piiRedactor } from "../privacy/pii-redactor.ts";
import { sanitizeDerived } from "../privacy/sanitize.ts";
import { buildExportJsonl, derive } from "../share/export.ts";

const MIN = 60_000;
const T0 = 1_700_000_000_000;

const ev = (
	timestamp: number,
	type: StoredTabEvent["type"],
	tabId: number,
	url?: string,
): StoredTabEvent => ({
	id: `${timestamp}-${tabId}`,
	type,
	tabId,
	windowId: 1,
	timestamp,
	url,
});

const redact = async (input: string): Promise<string> =>
	(await piiRedactor.redact(input)).redacted;

// --- 1. primitives ---

{
	const out = await redact("john@example.com");
	assert.ok(!out.includes("john@example.com"), `email survived: ${out}`);
	assert.match(out, /\[EMAIL_[^\]]+\]/, `expected typed placeholder: ${out}`);
}

{
	// international-style (UK mobile) + national format
	const intl = await redact("Call +44 7700 900123");
	assert.ok(!intl.includes("900123"), `intl phone survived: ${intl}`);
	assert.match(intl, /\[PHONE_[^\]]+\]/);

	const local = await redact("Call 07700900123");
	assert.ok(!local.includes("07700900123"), `local phone survived: ${local}`);
}

{
	const out = await redact(
		"Contact John at john@example.com about the project.",
	);
	assert.ok(!out.includes("john@example.com"), `email survived: ${out}`);
	assert.ok(out.includes("Contact John at"), `context lost: ${out}`);
	assert.ok(out.includes("about the project."), `context lost: ${out}`);
}

{
	// multiple distinct PII values in one string
	const out = await redact(
		"email jane.doe@acme-corp.io, card 4532 0151 1283 0366, phone 07700900123",
	);
	for (const secret of [
		"jane.doe@acme-corp.io",
		"4532 0151 1283 0366",
		"07700900123",
	]) {
		assert.ok(!out.includes(secret), `${secret} survived: ${out}`);
	}
}

{
	// non-PII browser content must survive byte-for-byte
	const clean = [
		"GitHub - microsoft/TypeScript",
		"node_modules/react/index.js",
		"localhost:5173/dashboard",
	];
	for (const input of clean) {
		assert.equal(await redact(input), input, `non-PII mutated: ${input}`);
	}
}

{
	// findings never carry the detected value
	const res = await piiRedactor.redact("john@example.com");
	assert.ok(res.findings.length > 0, "expected a finding");
	assert.ok(
		!JSON.stringify(res.findings).includes("john@example.com"),
		"finding leaked the original value",
	);
	for (const f of res.findings) {
		assert.equal(typeof f.type, "string");
		assert.equal(typeof f.start, "number");
		assert.equal(typeof f.end, "number");
	}
}

// --- 2. URL field redaction (structure preserved, only values rewritten) ---

const urlOf = async (raw: string): Promise<string> => {
	const d = await sanitizeDerived(derive([ev(T0, "NAVIGATION", 1, raw)]));
	const url = d.events[0]?.url ?? "";
	assert.ok(url !== "", `url dropped for ${raw}`);
	return url;
};

{
	const out = await urlOf("https://example.com/search?q=john@example.com");
	assert.ok(!out.includes("john@example.com"), `query PII survived: ${out}`);
	assert.ok(
		out.startsWith("https://example.com/search?q="),
		`structure lost: ${out}`,
	);
	assert.ok(out.includes("EMAIL_"), `no typed placeholder: ${out}`);
}

{
	// percent-encoded PII is decoded before matching
	const out = await urlOf(
		"https://example.com/search?q=john%40example.com&p=1",
	);
	assert.ok(
		!out.includes("john%40example.com"),
		`encoded PII survived: ${out}`,
	);
	assert.ok(out.includes("&p=1"), `other params lost: ${out}`);
}

{
	// PII inside a path segment
	const out = await urlOf("https://app.example.com/u/john@example.com/profile");
	assert.ok(!out.includes("john@example.com"), `path PII survived: ${out}`);
	assert.ok(
		out.startsWith("https://app.example.com/u/"),
		`structure lost: ${out}`,
	);
	assert.ok(out.endsWith("/profile"), `structure lost: ${out}`);
}

{
	// non-PII URL untouched, including protocol/host/query shape
	const clean = [
		"https://github.com/microsoft/TypeScript",
		"https://example.com/a/b?x=1&y=2#top",
		"https://example.com/docs/setup.md",
	];
	for (const url of clean) {
		assert.equal(await urlOf(url), url, `non-PII URL mutated: ${url}`);
	}
}

{
	// hostname/origin are the analytic key and are NEVER redacted — see the
	// sanitize.ts header. PII-pattern types cannot be a DNS label.
	const out = await urlOf("https://app.example.com/u/john@example.com/profile");
	assert.ok(
		out.includes("app.example.com"),
		`hostname was redacted (breaks domain aggregates): ${out}`,
	);
	const ctx = await sanitizeDerived(
		derive([ev(T0, "NAVIGATION", 1, "https://app.example.com/u/john@x.com")]),
	);
	const domains = ctx.sessions.flatMap((s) => s.domains.map((d) => d.domain));
	assert.ok(
		domains.includes("app.example.com"),
		`sessions[].domains lost the hostname: ${domains.join()}`,
	);
}

// --- 3. export boundary: sanitized JSONL, raw events untouched ---

{
	const events: StoredTabEvent[] = [
		ev(T0, "TAB_CREATED", 1, "https://example.com/search?q=john@example.com"),
		ev(
			T0 + 1000,
			"TAB_ACTIVATED",
			1,
			"https://example.com/search?q=john@example.com",
		),
		ev(
			T0 + 30 * MIN,
			"NAVIGATION",
			1,
			"https://github.com/microsoft/TypeScript",
		),
		ev(
			T0 + 31 * MIN,
			"NAVIGATION",
			1,
			"https://app.example.com/u/john@example.com",
		),
	];
	const rawBefore = structuredClone(events);

	const sanitized = await sanitizeDerived(derive(events));
	const jsonl = buildExportJsonl(sanitized);

	assert.ok(!jsonl.includes("john@example.com"), "export leaked PII");
	assert.ok(!jsonl.includes("john%40example.com"), "export leaked encoded PII");
	assert.ok(
		jsonl.includes("https://github.com/microsoft/TypeScript"),
		"non-PII event url was dropped/rewritten",
	);
	assert.ok(jsonl.includes('"record":"event"'), "export record shape changed");

	// raw evidence must not be mutated by producing the sanitized export
	assert.deepEqual(events, rawBefore, "raw events were mutated");

	// session-level event copies are sanitized too
	for (const s of sanitized.sessions) {
		for (const e of s.eventSequence) {
			assert.ok(
				!(e.url ?? "").includes("john@example.com"),
				"sessions[].eventSequence leaked PII",
			);
		}
	}

	// provenance: manifest carries type + count, never a value
	assert.equal(sanitized.privacy?.redacted, true, "provenance not flagged");
	const piiTypes = (sanitized.privacy?.findings ?? []).map((f) => f.type);
	assert.ok(piiTypes.length > 0, "provenance carried no findings");
	assert.ok(
		piiTypes.every((t) => typeof t === "string" && !t.includes("@")),
		`provenance findings look like values: ${piiTypes.join()}`,
	);
	assert.ok(
		!JSON.stringify(sanitized.privacy).includes("john@example.com"),
		"provenance leaked the original value",
	);
	assert.ok(jsonl.includes('"privacy"'), "manifest omitted provenance");
}

{
	// no PII → provenance present but not flagged
	const clean = await sanitizeDerived(
		derive([
			ev(T0, "NAVIGATION", 1, "https://github.com/microsoft/TypeScript"),
		]),
	);
	assert.equal(
		clean.privacy?.redacted,
		false,
		"clean export flagged as redacted",
	);
	assert.deepEqual(clean.privacy?.findings, [], "clean export had findings");
}

// --- 4. memory observation (free-form derived text) ---

{
	const fake = {
		observation: "Recurring sequence: mail.google.com → john@example.com",
		sequence: ["https://app.example.com/u/john@example.com"],
		fingerprint: {
			pageKeys: ["https://app.example.com/u/john@example.com"],
		},
		occurrences: [
			{
				contextId: "c1",
				sequence: ["https://app.example.com/u/john@example.com"],
			},
		],
	} as unknown as Memory;

	const d = await sanitizeDerived({
		events: [],
		sessions: [],
		contexts: [],
		memories: [fake],
		live: null,
	});
	const m = d.memories[0];
	assert.ok(
		!m.observation.includes("john@example.com"),
		"observation leaked PII",
	);
	assert.ok(
		!(m.sequence ?? []).some((k) => k.includes("john@example.com")),
		"memory.sequence leaked PII",
	);
	assert.ok(
		!m.fingerprint.pageKeys.some((k) => k.includes("john@example.com")),
		"fingerprint.pageKeys leaked PII",
	);
	assert.ok(
		!m.occurrences.some((o) =>
			o.sequence.some((k) => k.includes("john@example.com")),
		),
		"occurrence sequence leaked PII",
	);
}

// --- 5. context fields (sequence / transitions / excursions) ---
// Hand-built: the real derivation rarely emits excursions from a small fixture,
// so exercising sanitizeContext directly covers the paths the export emits
// (`record:"context"` carries sequence + excursions).
{
	const ref = (pathname: string) => ({
		origin: "https://app.example.com",
		pathname,
		exactUrl: `https://app.example.com${pathname}`,
	});
	const fake = {
		id: "c1",
		startTimestamp: T0,
		endTimestamp: T0 + MIN,
		duration: MIN,
		sessionIds: ["s1"],
		sessionCount: 1,
		domains: [],
		totalEventCount: 2,
		totalInteractionCount: 0,
		totalNavigationCount: 2,
		totalTabSwitchCount: 0,
		recurrenceCount: 1,
		primaryDomain: "app.example.com",
		sequence: ["https://app.example.com/u/john@example.com/p1"],
		transitions: [
			{
				from: "https://app.example.com/u/john@example.com/p1",
				to: "https://app.example.com/q/jane@acme.io",
				gapMs: 10,
			},
		],
		excursions: [
			{
				type: "excursion",
				start: T0,
				end: T0 + 1000,
				fromActivity: ref("/u/john@example.com/p1"),
				returnActivity: ref("/u/john@example.com/p2"),
				activities: [ref("/q/jane@acme.io")],
				evidence: ["return-transition"],
			},
		],
	} as unknown as BrowserContext;

	const d = await sanitizeDerived({
		events: [],
		sessions: [],
		contexts: [fake],
		memories: [],
		live: null,
	});
	const json = JSON.stringify(d.contexts);
	for (const secret of ["john@example.com", "jane@acme.io"]) {
		assert.ok(!json.includes(secret), `context leaked ${secret}`);
	}
	const c = d.contexts[0];
	assert.equal(c.primaryDomain, "app.example.com", "host was rewritten");
	assert.ok(
		(c.sequence ?? []).every((k) => k.startsWith("https://app.example.com/")),
		"context sequence lost its origin",
	);
	assert.equal(c.excursions?.[0]?.evidence[0], "return-transition");
}

// --- 6. explicit disable ---

{
	const events = [
		ev(T0, "NAVIGATION", 1, "https://example.com/?q=john@example.com"),
	];
	const off = await sanitizeDerived(derive(events), {
		piiRedactionEnabled: false,
	});
	assert.ok(
		(off.events[0]?.url ?? "").includes("john@example.com"),
		"disable switch did not bypass redaction",
	);
}

logger.info("privacy.check: all assertions passed ✔");
