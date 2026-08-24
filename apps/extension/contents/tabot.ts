import { Throttler } from "@tanstack/pacer";
import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	run_at: "document_idle",
};

// never capture key values, text, input contents — only that activity occurred
const send = (type: string, metadata?: Record<string, number>) =>
	chrome.runtime.sendMessage({
		kind: "TABOT_PAGE_EVENT",
		type,
		timestamp: Date.now(),
		metadata,
	});

const scrollThrottler = new Throttler(
	(scrollY: number) => send("SCROLL", { scrollY }),
	{ wait: 150 },
);
const keyThrottler = new Throttler(() => send("KEY_ACTIVITY"), { wait: 150 });

// standard read of the document's scroll offset (window.scrollY is not a real property)
const scrollY = () =>
	document.documentElement?.scrollTop ?? document.body?.scrollTop ?? 0;

document.addEventListener("click", (e: MouseEvent) =>
	send("CLICK", { x: e.clientX, y: e.clientY }),
);
document.addEventListener("keydown", () => keyThrottler.maybeExecute());

// scroll events do NOT bubble: they fire on the scrolling node only.
// The viewport scrolls against `<html>`/`<body>` → listen on window. Nested
// overflow containers scroll independently → attach to each scrollable node.
window.addEventListener(
	"scroll",
	() => scrollThrottler.maybeExecute(scrollY()),
	{ passive: true },
);
for (const el of document.querySelectorAll("*")) {
	if (el.scrollHeight <= el.clientHeight) continue;
	const overflow = getComputedStyle(el).overflowY;
	if (overflow !== "auto" && overflow !== "scroll") continue;
	el.addEventListener(
		"scroll",
		() => scrollThrottler.maybeExecute(el.scrollTop),
		{ passive: true },
	);
}

document.addEventListener("visibilitychange", () => {
	send(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE");
});
