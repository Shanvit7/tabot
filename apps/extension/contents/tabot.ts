import type { PageEventType } from "@tabot/shared";
import { Throttler } from "@tanstack/pacer";
import type { PlasmoCSConfig } from "plasmo";
import { createPageOutbox } from "../page-outbox";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	run_at: "document_idle",
};

// Never capture key values/text. Failures expose codes only, never private payloads.
const outbox = createPageOutbox({
	documentUrl: () => location.href,
	send: (message) => chrome.runtime.sendMessage(message),
	onFailure: (code) => console.warn("[Tabot] page event not confirmed", code),
});
let flushingHidden = false;
const send = (
	type: PageEventType,
	metadata?: Record<string, number>,
	timestamp = Date.now(),
) => {
	if (
		type !== "PAGE_HIDDEN" &&
		!flushingHidden &&
		(document.hidden || !document.hasFocus())
	)
		return;
	outbox.add(type, metadata, timestamp);
};
const scrollThrottler = new Throttler(
	(scrollY: number, timestamp: number) =>
		send("SCROLL", { scrollY }, timestamp),
	{ wait: 150, leading: true, trailing: true },
);
const keyThrottler = new Throttler(
	(timestamp: number) => send("KEY_ACTIVITY", undefined, timestamp),
	{ wait: 150, leading: true, trailing: true },
);

// Include nested scroll containers without recording element contents.
const scrollY = () =>
	document.documentElement?.scrollTop ?? document.body?.scrollTop ?? 0;

document.addEventListener("click", (e: MouseEvent) => {
	if (e.isTrusted) send("CLICK", { x: e.clientX, y: e.clientY });
});
document.addEventListener("keydown", (e) => {
	if (e.isTrusted) keyThrottler.maybeExecute(Date.now());
});

// scroll events do NOT bubble: they fire on the scrolling node only.
// The viewport scrolls against `<html>`/`<body>` → listen on window. Nested
// overflow containers scroll independently → attach to each scrollable node.
window.addEventListener(
	"scroll",
	() => scrollThrottler.maybeExecute(scrollY(), Date.now()),
	{ passive: true },
);
for (const el of document.querySelectorAll("*")) {
	if (el.scrollHeight <= el.clientHeight) continue;
	const overflow = getComputedStyle(el).overflowY;
	if (overflow !== "auto" && overflow !== "scroll") continue;
	el.addEventListener(
		"scroll",
		() => scrollThrottler.maybeExecute(el.scrollTop, Date.now()),
		{ passive: true },
	);
}

document.addEventListener("visibilitychange", () => {
	if (document.hidden) {
		flushingHidden = true;
		scrollThrottler.flush();
		keyThrottler.flush();
		flushingHidden = false;
	}
	send(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE");
});
send(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE");
