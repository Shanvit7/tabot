import assert from "node:assert/strict";
import { type BrowserContext, derive } from "@tabot/shared";
import {
	contextDuration,
	contextHomeUrl,
	parseAssistantConnection,
	popupSummary,
	siteFavicon,
	siteLabel,
} from "./popup-model";

const now = new Date("2026-10-07T12:00:00").getTime();
const context = (
	id: string,
	endTimestamp: number,
	duration = 15 * 60_000,
): BrowserContext => ({
	id,
	startTimestamp: endTimestamp - duration,
	endTimestamp,
	duration,
	sessionIds: ["session-1"],
	sessionCount: 1,
	domains: ["https://github.com", "https://docs.example.com"].map((domain) => ({
		domain,
		eventCount: 10,
		sessionCount: 1,
		sessionIds: ["session-1"],
		firstSeen: endTimestamp - duration,
		lastSeen: endTimestamp,
	})),
	totalEventCount: 20,
	totalInteractionCount: 2,
	totalNavigationCount: 2,
	totalTabSwitchCount: 2,
	recurrenceCount: 1,
	primaryDomain: "https://github.com",
});
const empty = derive([]);
assert.equal(popupSummary(empty, null, now).featured, null);
assert.equal(popupSummary(empty, null, now).updated, 0);
assert.equal(popupSummary(empty, null, now).activities, 0);

const ready = context("ready-id", now - 60_000);
const thin = context("thin-id", now, 60_000);
const older = context("older-id", now - 2 * 60 * 60_000);
const stale = context("stale-id", now - 25 * 60 * 60_000);
const data = { ...empty, contexts: [stale, older, ready, thin] };
const summary = popupSummary(data, now - 60 * 60_000, now);
assert.equal(
	summary.featured?.id,
	"ready-id",
	"ready context outranks latest thin thread",
);
assert.equal(summary.ready, true);
assert.equal(
	summary.updated,
	1,
	"only ready threads updated since previous visit",
);
assert.deepEqual(
	summary.recent.map((item) => item.id),
	["thin-id", "older-id"],
);
assert.equal(
	popupSummary(data, null, now).updated,
	0,
	"first visit must not claim new threads",
);
assert.equal(
	popupSummary(data, now, now).updated,
	0,
	"unchanged threads are not new",
);
assert.equal(
	popupSummary({ ...empty, contexts: [thin] }, null, now).ready,
	false,
);
assert.equal(
	popupSummary({ ...empty, contexts: [stale] }, null, now).featured,
	null,
	"old history is not current context",
);

const midnight = new Date(now).setHours(0, 0, 0, 0);
const crossing = {
	id: "session",
	startTimestamp: midnight - 60_000,
	endTimestamp: midnight + 60_000,
	duration: 120_000,
	eventCount: 2,
	tabs: [],
	domains: [],
	interactionCount: 0,
	navigationCount: 0,
	tabSwitchCount: 0,
	activeTabId: 1,
	activeWindowId: 1,
	eventSequence: [
		{
			id: "before",
			type: "NAVIGATION" as const,
			timestamp: midnight - 30_000,
			tabId: 1,
			windowId: 1,
		},
		{
			id: "after",
			type: "NAVIGATION" as const,
			timestamp: midnight + 30_000,
			tabId: 1,
			windowId: 1,
		},
	],
};
assert.equal(
	popupSummary({ ...empty, sessions: [crossing] }, null, now).activities,
	1,
	"today excludes previous-day activity within a session",
);

assert.equal(
	siteLabel("https://user:secret@www.github.com/project?token=secret"),
	"github.com",
);
assert.equal(siteLabel("chrome-extension://abc/popup.html"), "Extension page");
assert.equal(siteLabel("chrome://newtab"), "Chrome page");
assert.equal(siteLabel("data:text/plain,secret"), "Local page");
const icon = "https://github.githubassets.com/favicons/favicon.svg";
const favicons = new Map([["https://github.com", icon]]);
assert.equal(siteFavicon("https://github.com", favicons), icon);
assert.equal(
	siteFavicon("https://docs.example.com/path?secret=1", favicons),
	"https://docs.example.com/favicon.ico",
);
assert.equal(
	siteFavicon("https://user:secret@github.com/path", new Map()),
	"https://github.com/favicon.ico",
);
assert.equal(siteFavicon("chrome://newtab", favicons), undefined);
assert.equal(
	siteFavicon("chrome-extension://abc/popup.html", favicons),
	undefined,
);
assert.equal(
	siteFavicon(
		"https://github.com",
		new Map([["https://github.com", "broken url"]]),
	),
	"https://github.com/favicon.ico",
);
assert.equal(
	siteFavicon(
		"https://github.com",
		new Map([["https://github.com", "javascript:alert(1)"]]),
	),
	"https://github.com/favicon.ico",
);
assert.equal(
	siteFavicon(
		"https://github.com",
		new Map([["https://github.com", "data:image/png;base64,aGVsbG8="]]),
	),
	"data:image/png;base64,aGVsbG8=",
);
const withIcons = popupSummary(
	{
		...empty,
		events: [
			{
				...crossing.eventSequence[1],
				url: "https://github.com/private?token=secret",
				favicon: icon,
			},
		],
	},
	null,
	now,
);
assert.equal(withIcons.favicons.get("https://github.com"), icon);
assert.equal(contextDuration(0), "<1 min");
assert.equal(contextDuration(65 * 60_000), "1h 5m");
const scopedUrl = new URL(
	contextHomeUrl("https://example.com/tabot/home?keep=yes", "id&unsafe=1"),
);
assert.equal(scopedUrl.searchParams.get("context"), "id&unsafe=1");
assert.equal(scopedUrl.searchParams.get("keep"), "yes");
assert.equal(parseAssistantConnection({ connected: true }), true);
assert.equal(parseAssistantConnection({ connected: false }), false);
for (const response of [
	null,
	undefined,
	false,
	[],
	{},
	{ connected: "false" },
]) {
	assert.equal(
		parseAssistantConnection(response),
		null,
		"unknown status must not show a connect nudge",
	);
}
console.log("Popup context checks passed.");
