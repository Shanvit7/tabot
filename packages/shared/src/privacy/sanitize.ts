// packages/shared/src/privacy/sanitize.ts
// The privacy boundary: local evidence in → externally-safe copy out. Deriving a
// sanitized representation keeps the raw store intact (docs/tech.md §1: raw
// events are immutable source data); the source object is never mutated and
// nothing is persisted here.
//
// Only KNOWN textual fields are rewritten. IDs, timestamps, counts, hostnames,
// origins and relationships pass through untouched, so the export stays
// structurally valid and the dashboard's aggregates stay usable.
//
// Hostnames/origins are DELIBERATELY never redacted. They are the analytic key
// (context sequence = origin+pathname, memories weight domains 0.4, sessions
// aggregate domains) and they carry no PII-pattern shape: DNS labels are
// [a-z0-9-], so an EMAIL/PHONE/card match cannot be a hostname. `origin` is a
// separate field on ActivityRef that is also preserved, so redacting the host
// inside `url` would shred domain joins for zero privacy gain.
// ponytail: identifying enterprise subdomains (john.doe.corp.internal) are left
// alone; add per-domain policy only when a user actually asks for it.
import type { ActivityRef } from "../activities/meaningful-events";
import type { BrowserContext } from "../contexts/contexts";
import type { StoredTabEvent } from "../events/db";
import { logger } from "../lib/logger";
import type { Memory } from "../memories/memories";
import type { LiveBrowserContext } from "../recall/live-context";
import type { Derived, PrivacyProvenance } from "../share/export";
import { piiRedactor } from "./pii-redactor";
import type { PiiFinding, PiiRedactionOptions } from "./types";

export const PII_REDACTION_DEFAULT_ENABLED = true;

interface RedactionRun {
	findings: PiiFinding[];
}

// Sequential on purpose: one shared detector instance, and duplicates in an
// export then hit its cache instead of racing it. Redaction only runs at the
// export boundary, so this never touches the capture path.
const mapAsync = async <T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
): Promise<R[]> => {
	const out: R[] = [];
	for (const item of items) out.push(await fn(item));
	return out;
};

// Redact one text unit; returns the input object-identical when nothing matched
// so untouched content is byte-for-byte unchanged downstream.
// Pattern type → occurrence count. Never carries the matched value.
const summarize = (findings: PiiFinding[]): PrivacyProvenance["findings"] => {
	const counts = new Map<string, number>();
	for (const f of findings) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
	return [...counts].map(([type, count]) => ({ type, count }));
};

const redactText = async (
	input: string,
	run: RedactionRun,
): Promise<string> => {
	const { redacted, findings } = await piiRedactor.redact(input);
	if (redacted === input) return input;
	run.findings.push(...findings);
	return redacted;
};

// Redact one URL path/query/fragment segment. Decoded first so percent-encoded
// PII (q=john%40example.com) is caught; an untouched segment keeps its raw bytes
// so non-PII URLs survive byte-identical.
const redactSegment = async (
	raw: string,
	run: RedactionRun,
): Promise<string> => {
	let value = raw;
	try {
		value = decodeURIComponent(raw);
	} catch {
		// malformed escape — redact the raw form as-is
	}
	if (value === "") return raw;
	const redacted = await redactText(value, run);
	if (redacted === value) return raw;
	return encodeURIComponent(redacted)
		.replace(/%5B/gi, "[")
		.replace(/%5D/gi, "]");
};

// "/a/b/c" → each segment redacted, separators preserved verbatim.
const redactPathLike = async (
	value: string,
	run: RedactionRun,
): Promise<string> => {
	if (value === "") return value;
	return (await mapAsync(value.split("/"), (p) => redactSegment(p, run))).join(
		"/",
	);
};

// "?a=1&b=2" → keys and "&" preserved, values redacted individually.
const redactQuery = async (
	query: string,
	run: RedactionRun,
): Promise<string> => {
	const pairs = query.slice(1).split("&");
	const out = await mapAsync(pairs, async (pair) => {
		const eq = pair.indexOf("=");
		if (eq === -1) return redactSegment(pair, run);
		return `${pair.slice(0, eq)}=${await redactSegment(pair.slice(eq + 1), run)}`;
	});
	return `?${out.join("&")}`;
};

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

// Structure-preserving URL redaction — protocol, host, path shape, query keys
// and separators survive; only userinfo, path/fragment segments and query values
// are rewritten. Unparseable URLs fall back to whole-string redaction.
const redactUrl = async (raw: string, run: RedactionRun): Promise<string> => {
	const prefix = raw.match(SCHEME)?.[0];
	if (!prefix) return redactText(raw, run);

	const rest = raw.slice(prefix.length);
	const splitAt = rest.search(/[/?#]/);
	const authority = splitAt === -1 ? rest : rest.slice(0, splitAt);
	const tail = splitAt === -1 ? "" : rest.slice(splitAt);

	// userinfo (user:pass@host) — one opaque unit, not URL-shaped
	const at = authority.lastIndexOf("@");
	const hostPart =
		at === -1
			? authority
			: `${await redactText(authority.slice(0, at), run)}@${authority.slice(at + 1)}`;

	return `${prefix}${hostPart}${await redactUrlTail(tail, run)}`;
};

const redactUrlTail = async (
	tail: string,
	run: RedactionRun,
): Promise<string> => {
	if (tail === "") return tail;
	const hashAt = tail.indexOf("#");
	const hash = hashAt === -1 ? "" : tail.slice(hashAt + 1);
	const beforeHash = hashAt === -1 ? tail : tail.slice(0, hashAt);
	const queryAt = beforeHash.indexOf("?");
	const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
	const query = queryAt === -1 ? "" : beforeHash.slice(queryAt);

	let out = await redactPathLike(path, run);
	if (query !== "") out += await redactQuery(query, run);
	if (hash !== "") out += `#${await redactPathLike(hash, run)}`;
	return out;
};

// --- per-type sanitizers ---

const sanitizeEvent = async (
	event: StoredTabEvent,
	run: RedactionRun,
): Promise<StoredTabEvent> =>
	event.url ? { ...event, url: await redactUrl(event.url, run) } : event;

// ActivityRef carries the raw URL twice (exactUrl + pathname); origin is
// scheme+host and stays.
const sanitizeRef = async (
	ref: ActivityRef,
	run: RedactionRun,
): Promise<ActivityRef> => ({
	...ref,
	pathname: await redactPathLike(ref.pathname, run),
	exactUrl: await redactUrl(ref.exactUrl, run),
});

const sanitizeContext = async (
	context: BrowserContext,
	run: RedactionRun,
): Promise<BrowserContext> => {
	const next: BrowserContext = { ...context };
	// sequence/transition keys are "origin+pathname" — parseable as URLs
	if (context.sequence) {
		next.sequence = await mapAsync(context.sequence, (k) => redactUrl(k, run));
	}
	if (context.transitions) {
		next.transitions = await mapAsync(context.transitions, async (t) => ({
			...t,
			from: await redactUrl(t.from, run),
			to: await redactUrl(t.to, run),
		}));
	}
	if (context.excursions) {
		next.excursions = await mapAsync(context.excursions, async (x) => ({
			...x,
			fromActivity: await sanitizeRef(x.fromActivity, run),
			returnActivity: await sanitizeRef(x.returnActivity, run),
			activities: await mapAsync(x.activities, (a) => sanitizeRef(a, run)),
		}));
	}
	return next;
};

const sanitizeMemory = async (
	memory: Memory,
	run: RedactionRun,
): Promise<Memory> => {
	const next: Memory = {
		...memory,
		observation: await redactText(memory.observation, run),
		fingerprint: {
			...memory.fingerprint,
			pageKeys: await mapAsync(memory.fingerprint.pageKeys, (k) =>
				redactUrl(k, run),
			),
		},
		occurrences: await mapAsync(memory.occurrences, async (o) => ({
			...o,
			sequence: await mapAsync(o.sequence, (k) => redactUrl(k, run)),
		})),
	};
	if (memory.sequence) {
		next.sequence = await mapAsync(memory.sequence, (k) => redactUrl(k, run));
	}
	return next;
};

const sanitizeLive = async (
	live: LiveBrowserContext,
	run: RedactionRun,
): Promise<LiveBrowserContext> => {
	const next: LiveBrowserContext = {
		...live,
		recentNavigations: await mapAsync(live.recentNavigations, (u) =>
			redactUrl(u, run),
		),
		relatedContexts: await mapAsync(live.relatedContexts, async (r) => ({
			...r,
			context: await sanitizeContext(r.context, run),
		})),
		relatedMemories: await mapAsync(live.relatedMemories, async (r) => ({
			...r,
			memory: await sanitizeMemory(r.memory, run),
		})),
	};
	if (live.currentUrl) {
		next.currentUrl = await redactUrl(live.currentUrl, run);
	}
	if (live.currentContext) {
		next.currentContext = await sanitizeContext(live.currentContext, run);
	}
	return next;
};

/**
 * Build a sanitized copy of a derived bundle for external consumers (JSONL
 * export, chat prefill, future APIs). Never mutates `derived`. Throws if the
 * redactor fails — callers must abort rather than emit unsanitized data.
 */
export const sanitizeDerived = async (
	derived: Derived,
	options: PiiRedactionOptions = {},
): Promise<Derived> => {
	if (!(options.piiRedactionEnabled ?? PII_REDACTION_DEFAULT_ENABLED)) {
		return derived;
	}

	const run: RedactionRun = { findings: [] };
	const events = await mapAsync(derived.events, (e) => sanitizeEvent(e, run));
	const sessions = await mapAsync(derived.sessions, async (s) => ({
		...s,
		eventSequence: await mapAsync(s.eventSequence, (e) =>
			sanitizeEvent(e, run),
		),
	}));
	const contexts = await mapAsync(derived.contexts, (c) =>
		sanitizeContext(c, run),
	);
	const memories = await mapAsync(derived.memories, (m) =>
		sanitizeMemory(m, run),
	);
	const live = derived.live ? await sanitizeLive(derived.live, run) : null;

	const privacy: PrivacyProvenance = {
		redacted: run.findings.length > 0,
		findings: summarize(run.findings),
	};
	if (privacy.redacted) {
		logger.info("pii: sanitized export", {
			redactions: run.findings.length,
			types: privacy.findings.map((f) => f.type),
		});
	}

	return { events, sessions, contexts, memories, live, privacy };
};
