// packages/shared/src/checks/privacy.check.ts
// Sensitive-data boundary validation: OpenRedaction credential patterns + the
// sanitized-export path (docs/tech.md §1 "raw events are immutable source data").
// Run: node --import ./resolve-hook.mjs src/checks/privacy.check.ts

import assert from "node:assert/strict";
import type { BrowserContext } from "../contexts/contexts.ts";
import type { StoredTabEvent } from "../events/db.ts";
import { logger } from "../lib/logger.ts";
import type { Memory } from "../memories/memories.ts";
import {
	sanitizeEventForIngestion,
	sanitizeUrlForIngestion,
} from "../privacy/ingest.ts";
import { sanitizeDerived } from "../privacy/sanitize.ts";
import { sensitiveDataRedactor } from "../privacy/sensitive-data.ts";
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
	(await sensitiveDataRedactor.redact(input)).redacted;

// Ingest transport identity is local-only; source.documentUrl must not bypass URL redaction.
{
	const event = {
		...ev(T0, "NAVIGATION", 1, "https://example.com/"),
		source: {
			instanceId: "12345678-1234-1234-1234-123456789012",
			sequence: 1,
			documentUrl:
				"https://example.com/?q=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		},
	};
	const clean = await sanitizeDerived(derive([event]));
	assert.equal(clean.events[0].source, undefined);
	assert.ok(
		!JSON.stringify(clean).includes(
			"ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		),
	);
	assert.ok(
		event.source.documentUrl.includes(
			"ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		),
		"source mutated",
	);
}

// Ingestion sanitizes before the TalaDB write boundary.
{
	const event = {
		...ev(
			T0,
			"NAVIGATION",
			1,
			"https://example.com/users/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB?token=secret#private",
		),
		favicon:
			"https://example.com/favicon.ico?user=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		source: {
			instanceId: "12345678-1234-1234-1234-123456789012",
			sequence: 1,
			documentUrl:
				"https://example.com/?q=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		},
	};
	const clean = await sanitizeEventForIngestion(event);
	const serialized = JSON.stringify(clean);
	assert.ok(!serialized.toLowerCase().includes("john"));
	assert.ok(!serialized.includes("secret"));
	assert.ok(!serialized.includes("private"));
	assert.equal(clean.favicon, "https://example.com/favicon.ico");
	assert.equal(new URL(clean.url as string).search, "");
	assert.equal(new URL(clean.url as string).hash, "");
	const externalIcon = await sanitizeEventForIngestion({
		...event,
		favicon: "https://cdn.example.net/favicon.ico?token=secret",
	});
	assert.equal(externalIcon.favicon, "https://cdn.example.net/favicon.ico");
	const google = await sanitizeEventForIngestion({
		...ev(
			T0,
			"NAVIGATION",
			1,
			"https://www.google.com/search?q=database&client=chrome&token=secret#fragment",
		),
	});
	assert.equal(
		google.url,
		"https://www.google.com/search?q=database",
		"retain only Google search text, not unrelated query params",
	);
	const redactedGoogle = await sanitizeEventForIngestion({
		...ev(
			T0 + 1,
			"NAVIGATION",
			1,
			"https://www.google.com/search?q=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		),
	});
	assert.ok(!redactedGoogle.url?.includes("john"));
	assert.match(
		new URL(redactedGoogle.url as string).searchParams.get("q") ?? "",
		/GITHUB_TOKEN_/,
	);
	const retainedEmail = await sanitizeEventForIngestion({
		...ev(
			T0 + 2,
			"NAVIGATION",
			1,
			"https://www.google.com/search?q=john%40example.com",
		),
	});
	assert.equal(
		new URL(retainedEmail.url as string).searchParams.get("q"),
		"john@example.com",
		"email search query must not be redacted",
	);
	const nonSearchGoogle = await sanitizeUrlForIngestion(
		"https://www.google.com/?q=database",
		{ retainSearchQuery: true },
	);
	assert.equal(nonSearchGoogle, "https://www.google.com/");
	const bing = await sanitizeUrlForIngestion(
		"https://www.bing.com/search?q=database&form=QBLH",
		{ retainSearchQuery: true },
	);
	assert.equal(bing, "https://www.bing.com/search?q=database");
	const duckDuckGo = await sanitizeUrlForIngestion(
		"https://duckduckgo.com/?q=database&t=ffab",
		{ retainSearchQuery: true },
	);
	assert.equal(duckDuckGo, "https://duckduckgo.com/?q=database");
	const yahoo = await sanitizeUrlForIngestion(
		"https://search.yahoo.com/search?p=database&fr=top",
		{ retainSearchQuery: true },
	);
	assert.equal(yahoo, "https://search.yahoo.com/search?p=database");
}

// --- 1. sensitive-data detector ---

{
	const email = "john@example.com";
	assert.equal(await redact(email), email, "email must not be redacted");
	assert.equal(
		await sanitizeUrlForIngestion(`https://example.com/users/${email}`),
		`https://example.com/users/${email}`,
		"email in URL path must not be redacted",
	);
}

{
	const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
	const out = await redact(`GitHub token: ${token}`);
	assert.ok(!out.includes(token), `GitHub token survived: ${out}`);
	assert.match(out, /\[GITHUB_TOKEN_[^\]]+\]/);
}

{
	const input = "password=correcthorsebatterystaple";
	const out = await redact(input);
	assert.notEqual(out, input, "credential-like secret survived");
	assert.match(out, /\[SECRET_[^\]]+\]/);
}

{
	const input = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345";
	const out = await redact(input);
	assert.ok(!out.includes("abcdefghijklmnopqrstuvwxyz012345"));
	assert.match(out, /\[BEARER_[^\]]+\]/);
}

{
	const input =
		"Debit PAN: 4532015112830366; credit card: 6011111111111117; CVV: 123; valid thru: 10/28; account: 12345678; SWIFT: DEUTDEFF500; VAT: GB123456789";
	const result = await sensitiveDataRedactor.redact(input);
	for (const value of [
		"4532015112830366",
		"6011111111111117",
		"123",
		"10/28",
		"12345678",
		"DEUTDEFF500",
		"GB123456789",
	]) {
		assert.ok(
			!result.redacted.includes(value),
			`${value} survived: ${result.redacted}`,
		);
	}
	for (const type of [
		"CREDIT_CARD",
		"CVV",
		"CARD_EXPIRY",
		"BANK_ACCOUNT_UK",
		"SWIFT_BIC",
		"VAT_NUMBER",
	]) {
		assert.ok(
			result.findings.some((finding) => finding.type === type),
			`missing ${type}`,
		);
	}
}

{
	const input = "GitHub - microsoft/TypeScript; john@example.com";
	assert.equal(await redact(input), input, "ordinary text/email changed");
}

{
	const secret = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
	const res = await sensitiveDataRedactor.redact(secret);
	assert.ok(res.findings.length > 0, "expected a finding");
	assert.ok(
		!JSON.stringify(res.findings).includes(secret),
		"finding leaked the original value",
	);
	assert.equal("original" in res, false, "redactor returned raw input");
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
	const out = await urlOf(
		"https://example.com/search?q=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
	);
	assert.ok(
		!out.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
		`query secret survived: ${out}`,
	);
	assert.ok(
		out.startsWith("https://example.com/search?q="),
		`structure lost: ${out}`,
	);
	assert.ok(out.includes("GITHUB_TOKEN_"), `no typed placeholder: ${out}`);
}

{
	// percent-encoded secrets are decoded before matching
	const out = await urlOf(
		"https://example.com/search?q=ghp%5F1234567890abcdefghijklmnopqrstuvwxyzAB&p=1",
	);
	assert.ok(
		!out.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
		`encoded secret survived: ${out}`,
	);
	assert.ok(out.includes("&p=1"), `other params lost: ${out}`);
}

{
	// secrets inside a path segment
	const out = await urlOf(
		"https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB/profile",
	);
	assert.ok(
		!out.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
		`path secret survived: ${out}`,
	);
	assert.ok(
		out.startsWith("https://app.example.com/u/"),
		`structure lost: ${out}`,
	);
	assert.ok(out.endsWith("/profile"), `structure lost: ${out}`);
}

{
	// non-sensitive URL untouched, including protocol/host/query shape
	const clean = [
		"https://github.com/microsoft/TypeScript",
		"https://example.com/a/b?x=1&y=2#top",
		"https://example.com/docs/setup.md",
	];
	for (const url of clean) {
		assert.equal(await urlOf(url), url, `non-sensitive URL mutated: ${url}`);
	}
}

{
	// hostname/origin are the analytic key and are NEVER redacted — see the
	// sanitize.ts header. secret-pattern types cannot be a DNS label.
	const out = await urlOf(
		"https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB/profile",
	);
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
		ev(
			T0,
			"TAB_CREATED",
			1,
			"https://example.com/search?q=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		),
		ev(
			T0 + 1000,
			"TAB_ACTIVATED",
			1,
			"https://example.com/search?q=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
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
			"https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		),
	];
	const rawBefore = structuredClone(events);

	const sanitized = await sanitizeDerived(derive(events));
	const jsonl = buildExportJsonl(sanitized);

	assert.ok(
		!jsonl.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
		"export leaked a secret",
	);
	assert.ok(
		!jsonl.includes("ghp%5F1234567890abcdefghijklmnopqrstuvwxyzAB"),
		"export leaked encoded secret",
	);
	assert.ok(
		jsonl.includes("https://github.com/microsoft/TypeScript"),
		"non-sensitive event url was dropped/rewritten",
	);
	assert.ok(jsonl.includes('"record":"event"'), "export record shape changed");

	// raw evidence must not be mutated by producing the sanitized export
	assert.deepEqual(events, rawBefore, "raw events were mutated");

	// session-level event copies are sanitized too
	for (const s of sanitized.sessions) {
		for (const e of s.eventSequence) {
			assert.ok(
				!(e.url ?? "").includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
				"sessions[].eventSequence leaked a secret",
			);
		}
	}

	// provenance: manifest carries type + count, never a value
	assert.equal(sanitized.privacy?.redacted, true, "provenance not flagged");
	const sensitiveTypes = (sanitized.privacy?.findings ?? []).map((f) => f.type);
	assert.ok(sensitiveTypes.length > 0, "provenance carried no findings");
	assert.ok(
		sensitiveTypes.every((t) => typeof t === "string" && !t.includes("@")),
		`provenance findings look like values: ${sensitiveTypes.join()}`,
	);
	assert.ok(
		!JSON.stringify(sanitized.privacy).includes(
			"ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		),
		"provenance leaked the original value",
	);
	assert.ok(jsonl.includes('"privacy"'), "manifest omitted provenance");
}

{
	// no sensitive data → provenance present but not flagged
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
		observation:
			"Recurring sequence: mail.google.com → ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		sequence: [
			"https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		],
		fingerprint: {
			pageKeys: [
				"https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
			],
		},
		occurrences: [
			{
				contextId: "c1",
				sequence: [
					"https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
				],
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
		!m.observation.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
		"observation leaked a secret",
	);
	assert.ok(
		!(m.sequence ?? []).some((k) =>
			k.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
		),
		"memory.sequence leaked a secret",
	);
	assert.ok(
		!m.fingerprint.pageKeys.some((k) =>
			k.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
		),
		"fingerprint.pageKeys leaked a secret",
	);
	assert.ok(
		!m.occurrences.some((o) =>
			o.sequence.some((k) =>
				k.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"),
			),
		),
		"occurrence sequence leaked a secret",
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
		sequence: [
			"https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB/p1",
		],
		transitions: [
			{
				from: "https://app.example.com/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB/p1",
				to: "https://app.example.com/q/ghp_1122334455abcdefghijklmnopqrstuvwxyzAB",
				gapMs: 10,
			},
		],
		excursions: [
			{
				type: "excursion",
				start: T0,
				end: T0 + 1000,
				fromActivity: ref("/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB/p1"),
				returnActivity: ref("/u/ghp_1234567890abcdefghijklmnopqrstuvwxyzAB/p2"),
				activities: [ref("/q/ghp_1122334455abcdefghijklmnopqrstuvwxyzAB")],
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
	for (const secret of [
		"ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
		"ghp_1122334455abcdefghijklmnopqrstuvwxyzAB",
	]) {
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

logger.info("privacy.check: all assertions passed ✔");
