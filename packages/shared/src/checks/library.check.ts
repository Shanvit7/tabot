import assert from "node:assert/strict";
import { type StoredTabEvent, TabotDatabase } from "../events/db";
import {
	browseLibrary,
	isLibraryRequest,
	isLibraryResponse,
	type LibraryRequest,
} from "../library";
import type { PageNote } from "../notes/notes";
import type { StoredPageObservation } from "../pages/observations";
import { searchHistory } from "../recall/history-search";

const event = (url: string, timestamp = 100): StoredTabEvent => ({
	id: url,
	type: "NAVIGATION",
	tabId: 1,
	windowId: 1,
	timestamp,
	url,
});
const note = (
	id: string,
	url: string,
	createdAt: number,
	updatedAt: number,
	text = "Saffron note",
): PageNote => ({
	id,
	url,
	text,
	createdAt,
	updatedAt,
	origin: "https://incorrect.test",
	host: "incorrect.test",
	site: "incorrect.test",
	title: "Saved title",
	favicon: "javascript:alert(1)",
	pageKey: id,
	tabId: 2,
	windowId: 1,
	eventId: null,
});
const base = "https://docs.example.com/page-0";
const events = [
	...Array.from({ length: 25 }, (_, index) =>
		event(`https://docs.example.com/page-${index}`, 100 + index),
	),
	event(`${base}?secret=one#private`, 150.25),
	event("http://example.com:8080/other", 160),
	event("https://alice.github.io/guide", 170),
	event("https://bob.github.io/guide", 180),
	event("https://docs.example.co.uk/guide", 190),
	...Array.from({ length: 23 }, (_, index) =>
		event(`https://site-${index}.test/page`, 200 + index),
	),
	event("javascript:alert(1)"),
	event("file:///private"),
	event("https://user:pass@unsafe.test/"),
];
const capture: StoredPageObservation = {
	kind: "page-observation",
	id: "capture",
	url: base,
	timestamp: 155,
	tabId: 1,
	windowId: 1,
	pageKey: "a".repeat(64),
	captureIdentity: "b".repeat(64),
	title: "Quartz reference",
	trigger: "interaction",
	segments: ["Amethyst retained page text"],
	privacy: { policyVersion: 1, redacted: true, findings: [] },
	coverage: { partial: false, truncated: false },
};
const notes = [
	note("n1", `${base}?private=yes`, 110, 310),
	note("n2", `${base}#fragment`, 120, 320, "Second note"),
	note("n3", "https://example.com/note-only", 130, 330),
	note("n4", "https://orphan.test/no-capture", 140, 340),
	note("bad", "javascript:alert(1)", 100, 350),
];
const browse = (request: LibraryRequest) =>
	browseLibrary(
		events,
		[capture, { ...capture, id: "capture-2", timestamp: 156 }],
		notes,
		request,
	);
const sites = await browse({ level: "sites" });
assert.equal(isLibraryResponse(JSON.parse(JSON.stringify(sites))), true);
assert.equal(sites.sites.length, 20);
assert.equal(sites.total, 28);
assert.equal(sites.hasMore, true);
assert.deepEqual(sites.pages, []);
assert.deepEqual(sites.notes, []);
const example = sites.sites.find((site) => site.site === "example.com");
assert.ok(example);
assert.equal(
	example.pageCount,
	27,
	"all distinct URLs counted, not loaded cards or captures",
);
assert.equal(example.noteCount, 3);
assert.equal(example.lastSeen, 330);
const nextSites = await browse({ level: "sites", offset: 20 });
assert.equal(nextSites.total, 28);
assert.equal(nextSites.sites.length, 8);
assert.equal(nextSites.hasMore, false);
assert.equal(
	new Set([...sites.sites, ...nextSites.sites].map((site) => site.site)).size,
	28,
);
const pages = await browse({ level: "pages", site: "example.com" });
assert.equal(pages.pages.length, 20);
assert.equal(pages.total, 27);
assert.equal(pages.hasMore, true);
const first = pages.pages.find((page) => page.url === base);
assert.ok(first);
assert.equal(first.eventCount, 2);
assert.equal(first.pageCount, 2);
assert.equal(first.sourceCount, 4);
assert.equal(first.noteCount, 2);
assert.equal(first.firstSeen, 100);
assert.equal(first.lastSeen, 320);
const lastPages = await browse({
	level: "pages",
	site: "example.com",
	offset: 20,
});
assert.equal(lastPages.total, 27);
assert.equal(lastPages.pages.length, 7);
assert.equal(lastPages.hasMore, false);
assert.equal(
	new Set([...pages.pages, ...lastPages.pages].map((page) => page.url)).size,
	27,
);
assert.deepEqual(
	(await browse({ level: "pages", site: "example.com", offset: 99 })).pages,
	[],
);
const only = pages.pages.find((page) => page.url.endsWith("/note-only"));
assert.equal(only?.noteCount, 1);
assert.equal(only?.sourceCount, 0);
assert.equal(only?.pageTitle, "Saved title");
const orphan = await browse({ level: "pages", site: "orphan.test" });
assert.equal(orphan.pages[0]?.noteCount, 1);
assert.equal(orphan.pages[0]?.pageCount, 0);
const allNotes = await browse({ level: "notes", url: base, limit: 1 });
assert.equal(allNotes.total, 2);
assert.equal(allNotes.notes[0]?.id, "n2");
assert.equal(allNotes.notes[0]?.url, base);
assert.equal(allNotes.notes[0]?.host, "docs.example.com");
assert.equal(allNotes.notes[0]?.site, "example.com");
assert.equal(allNotes.notes[0]?.favicon, null);
assert.equal(allNotes.hasMore, true);
assert.equal(
	(await browse({ level: "notes", url: base, offset: 1 })).notes[0]?.id,
	"n1",
);
assert.equal(
	(await browse({ level: "notes", url: "https://orphan.test/no-capture" }))
		.total,
	1,
);
assert.equal(
	(await browse({ level: "pages", site: "alice.github.io" })).total,
	1,
);
assert.equal(
	(await browse({ level: "pages", site: "github.io" })).total,
	0,
	"private tenants stay isolated",
);
assert.equal(
	(await browse({ level: "pages", site: "example.co.uk" })).total,
	1,
);
assert.equal(
	(await browse({ level: "sites", site: "bob.github.io" })).sites[0]?.site,
	"bob.github.io",
);
assert.equal(
	(await browse({ level: "sites", query: "amethyst" })).sites[0]?.pageCount,
	1,
);
const linkedinSites = await browseLibrary(
	[event("https://localhost/"), event("https://www.linkedin.com/feed/")],
	[
		{ ...capture, url: "https://localhost/", title: "LinkedIn profile" },
		{
			...capture,
			id: "linkedin-capture",
			url: "https://www.linkedin.com/feed/",
			title: "LinkedIn feed",
		},
	],
	[],
	{ level: "sites", query: "linkedin" },
);
assert.equal(
	linkedinSites.sites[0]?.site,
	"linkedin.com",
	"exact site-name match ranks ahead of unrelated page-text matches",
);
const searchedQuartz = await searchHistory(
	events,
	[capture, { ...capture, id: "capture-2", timestamp: 156 }],
	"quartz",
);
const quartzSites = await browse({ level: "sites", query: "quartz" });
assert.equal(new Set(searchedQuartz.map(({ host }) => host)).size, 1);
assert.deepEqual(
	quartzSites.sites.map(({ site }) => site),
	["example.com"],
	"site derivation shares page search matching",
);
assert.equal(
	(await browse({ level: "pages", site: "example.com", query: "quartz" }))
		.total,
	1,
);
assert.equal(
	(await browse({ level: "pages", site: "example.com", query: "saffron" }))
		.total,
	2,
);
const stablePages = await browse({
	level: "pages",
	site: "example.com",
	to: 200,
});
assert.equal(
	stablePages.pages.find((page) => page.url === base)?.lastSeen,
	200,
	"edits after cursor snapshot cannot reorder pages",
);
assert.deepEqual(
	(
		await browse({
			level: "notes",
			url: base,
			to: 200,
		})
	).notes.map(({ id }) => id),
	["n1", "n2"],
	"notes edited after cursor snapshot use stable id ordering",
);
assert.equal(
	(await browse({ level: "notes", url: base, query: "saffron" })).total,
	1,
);
assert.equal(
	(await browse({ level: "notes", url: base, query: "amethyst" })).total,
	0,
	"page-text matches must not include nonmatching sibling notes",
);
assert.deepEqual(
	(await browse({ level: "notes", url: base, query: "second" })).notes.map(
		({ id }) => id,
	),
	["n2"],
	"note search returns only matching note text",
);
assert.equal(
	(await browse({ level: "sites", query: "navigation", site: "example.com" }))
		.sites[0]?.pageCount,
	26,
);
assert.equal(
	(await browse({ level: "sites", query: "doesnotexist" })).total,
	0,
);
assert.equal((await browse({ level: "sites", query: "!!!" })).total, 0);
assert.equal((await browse({ level: "sites", query: "  " })).total, 28);
const timed = await browse({
	level: "sites",
	site: "example.com",
	from: 120,
	to: 130,
});
assert.equal(timed.sites[0]?.pageCount, 7);
assert.equal(
	timed.sites[0]?.noteCount,
	2,
	"note createdAt uses inclusive bounds; edits sort separately",
);
assert.equal(
	(await browse({ level: "notes", url: base, from: 120, to: 120 })).notes[0]
		?.id,
	"n2",
);
assert.equal(
	(
		await browse({
			level: "pages",
			site: "example.com",
			query: "quartz",
			to: 154,
		})
	).total,
	0,
);
assert.equal(
	(await browse({ level: "sites", url: base })).sites[0]?.pageCount,
	1,
);
assert.equal(
	(await browse({ level: "sites", query: "saffron", site: "alice.github.io" }))
		.total,
	0,
);
assert.equal(JSON.stringify(sites).includes("secret"), false);
const fractionalSession = await browseLibrary(
	[event(base, 100.25), event(base, 102.5)],
	[],
	[{ ...note("fractional", base, 101, 105), tabId: 1 }],
	{ level: "notes", url: base },
);
assert.equal(fractionalSession.notes[0]?.session?.durationMs, 2.25);
const privateHost = await browseLibrary(
	[event("https://foo_bar.test/x")],
	[],
	[],
	{ level: "sites" },
);
assert.equal(privateHost.sites[0]?.site, "foo_bar.test");
assert.equal(isLibraryRequest({ level: "pages", site: "foo_bar.test" }), true);
assert.equal(
	(
		await browseLibrary([event("https://a..test/x")], [], [], {
			level: "sites",
		})
	).total,
	0,
);
assert.deepEqual(
	(
		await searchHistory([event(base), event("https://other.test/")], [], "", {
			candidateOrder: [base],
		})
	).map((row) => row.url),
	[base],
);

for (const invalid of [
	null,
	[],
	{},
	{ level: ["sites"] },
	{ level: "invalid" },
	{ level: "pages" },
	{ level: "notes" },
	...[
		"https://example.com",
		"example.com:443",
		".example.com",
		"EXAMPLE.COM",
		"docs.example.com",
		"example.com.",
		"a..test",
		"user@site.test",
		"site.test/path",
	].map((site) => ({ level: "pages", site })),
	...[
		"javascript:alert(1)",
		"file:///private",
		"https://user:pass@site.test/",
		`${base}?secret=yes`,
		`${base}#hash`,
		"not a url",
	].map((url) => ({ level: "notes", url })),
	{ level: "notes", url: base, site: "alice.github.io" },
	...[0, 21, NaN, "20", null].map((limit) => ({ level: "sites", limit })),
	...[-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null].map(
		(offset) => ({ level: "sites", offset }),
	),
	...[-1, Infinity, NaN, 8.64e15 + 1, "0", null].map((from) => ({
		level: "sites",
		from,
	})),
	{ level: "sites", from: 2, to: 1 },
	{ level: "sites", query: "x".repeat(241) },
	{ level: "sites", query: {} },
]) {
	assert.equal(isLibraryRequest(invalid), false, JSON.stringify(invalid));
	await assert.rejects(
		() => browse(invalid as LibraryRequest),
		/invalid-library-request/,
	);
}
for (const invalid of [
	null,
	{},
	{ ...sites, pages: undefined },
	{ ...sites, total: 1 },
	{ ...sites, hasMore: "yes" },
	{ ...sites, pages: [first] },
	{ ...sites, sites: [{ ...example, site: "other.test" }] },
	{ ...sites, sites: [{ ...example, url: "javascript:alert(1)" }] },
	{ ...allNotes, notes: [{ ...allNotes.notes[0], site: "wrong.test" }] },
])
	assert.equal(isLibraryResponse(invalid), false);
let calls = 0;
const db = new TabotDatabase(async (message) => {
	calls++;
	assert.equal(message.method, "browseLibrary");
	assert.deepEqual(message.args, [{ level: "sites" }]);
	return { ok: true, value: sites };
});
assert.deepEqual(await db.browseLibrary({ level: "sites" }), sites);
await assert.rejects(
	() => db.browseLibrary({ level: "notes" }),
	/invalid-library-request/,
);
assert.equal(calls, 1);
await assert.rejects(
	() =>
		new TabotDatabase(async () => ({
			ok: false,
			code: "disk-read-failed",
		})).browseLibrary({ level: "sites" }),
	/disk-read-failed/,
);
await assert.rejects(
	() =>
		new TabotDatabase(async () => ({ ok: true, value: {} })).browseLibrary({
			level: "sites",
		}),
	/invalid-library-response/,
);
console.log(
	"library: full counts, pagination, note-only pages, keyword/time/site scopes, safe URLs and RPC validation passed",
);
