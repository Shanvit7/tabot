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

document.addEventListener(
	"scroll",
	() => scrollThrottler.maybeExecute(window.scrollY),
	{ passive: true },
);
document.addEventListener("click", (e: MouseEvent) =>
	send("CLICK", { x: e.clientX, y: e.clientY }),
);
document.addEventListener("keydown", () => keyThrottler.maybeExecute());
document.addEventListener("visibilitychange", () => {
	send(document.visibilityState === "visible" ? "PAGE_VISIBLE" : "PAGE_HIDDEN");
});
