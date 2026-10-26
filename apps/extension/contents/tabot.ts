import type { PageEventType } from "@tabot/shared";
import { Throttler } from "@tanstack/pacer";
import type { PlasmoCSConfig } from "plasmo";
import {
	isPageCaptureExcludedUrl,
	normalizePageCaptureOrigins,
	PAGE_CAPTURE_ORIGINS_KEY,
	pageCaptureSite,
} from "../page-capture-consent";
import { createPageOutbox } from "../page-outbox";
import { extractVisibleExcerpts } from "../visible-excerpts";

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
let excerptTimer: ReturnType<typeof setTimeout> | undefined;
let mutationObserver: MutationObserver | undefined;
let lastExcerptAt = 0;
let captureAllowed = false;
let policyGeneration = 0;
const TRACKING_KEY = "tabot_tracking_enabled";
const captureEligible = (url = location.href) =>
	captureAllowed &&
	!document.hidden &&
	document.hasFocus() &&
	!chrome.extension.inIncognitoContext &&
	!isPageCaptureExcludedUrl(url);
let requestViewportExcerpt: (delay: number) => void;
const rectInViewport = (rect: DOMRect) =>
	rect.width > 0 &&
	rect.height > 0 &&
	rect.left >= 0 &&
	rect.top >= 0 &&
	rect.right <= innerWidth &&
	rect.bottom <= innerHeight;
const startMutationObserver = () => {
	if (mutationObserver || !document.body) return;
	mutationObserver = new MutationObserver((records) => {
		let inspected = 0;
		for (const record of records.slice(0, 100)) {
			const roots =
				record.type === "childList"
					? Array.from(record.addedNodes).slice(0, 20)
					: [record.target];
			for (const root of roots) {
				if (root.nodeType === Node.TEXT_NODE) {
					const range = document.createRange();
					range.selectNode(root);
					if (Array.from(range.getClientRects()).some(rectInViewport)) {
						requestViewportExcerpt(1000);
						return;
					}
					continue;
				}
				if (!(root instanceof Element)) continue;
				const walker = document.createTreeWalker(
					root,
					NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
					{
						acceptNode(node) {
							if (node.nodeType === Node.ELEMENT_NODE) {
								return (node as Element).matches(
									"input,textarea,select,[hidden],[aria-hidden='true'],[contenteditable]:not([contenteditable='false'])",
								)
									? NodeFilter.FILTER_REJECT
									: NodeFilter.FILTER_SKIP;
							}
							return NodeFilter.FILTER_ACCEPT;
						},
					},
				);
				while (walker.nextNode() && inspected < 200) {
					inspected++;
					if (walker.currentNode.nodeType !== Node.TEXT_NODE) continue;
					const range = document.createRange();
					range.selectNode(walker.currentNode);
					if (Array.from(range.getClientRects()).some(rectInViewport)) {
						requestViewportExcerpt(1000);
						return;
					}
				}
				if (inspected >= 200) return;
			}
		}
	});
	mutationObserver.observe(document.body, {
		childList: true,
		characterData: true,
		attributes: true,
		subtree: true,
	});
};
const stopMutationObserver = () => {
	mutationObserver?.disconnect();
	mutationObserver = undefined;
};
const captureExcerpt = (
	trigger: "viewport-dwell" | "interaction",
	root: Element = document.body,
	url = location.href,
) => {
	if (
		Date.now() - lastExcerptAt < 5000 ||
		!captureEligible(url) ||
		location.href !== url
	)
		return;
	const result = extractVisibleExcerpts(document, root);
	if (!result.segments.length || location.href !== url) return;
	lastExcerptAt = Date.now();
	outbox.addObservation({
		timestamp: lastExcerptAt,
		documentUrl: url,
		trigger,
		segments: result.segments,
		truncated: result.truncated,
		partial: result.partial,
	});
};
requestViewportExcerpt = (delay: number) => {
	clearTimeout(excerptTimer);
	if (!captureEligible()) return;
	const url = location.href;
	excerptTimer = setTimeout(() => {
		excerptTimer = undefined;
		void captureExcerpt("viewport-dwell", document.body, url);
	}, delay);
};
const syncCapturePolicy = async () => {
	const generation = ++policyGeneration;
	const site = pageCaptureSite(location.href);
	let allowed = false;
	if (
		site &&
		!chrome.extension.inIncognitoContext &&
		!isPageCaptureExcludedUrl(location.href)
	) {
		try {
			const stored = await chrome.storage.local.get([
				PAGE_CAPTURE_ORIGINS_KEY,
				TRACKING_KEY,
			]);
			allowed =
				stored[TRACKING_KEY] !== false &&
				normalizePageCaptureOrigins(stored[PAGE_CAPTURE_ORIGINS_KEY]).includes(
					site.origin,
				);
		} catch {
			allowed = false;
		}
	}
	if (generation !== policyGeneration) return;
	captureAllowed = allowed;
	if (!captureAllowed || document.hidden || !document.hasFocus()) {
		clearTimeout(excerptTimer);
		excerptTimer = undefined;
		stopMutationObserver();
		if (!captureAllowed) outbox.clearObservations();
		return;
	}
	startMutationObserver();
	requestViewportExcerpt(1000);
};
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
	if (!e.isTrusted) return;
	send("CLICK", { x: e.clientX, y: e.clientY });
	const target = e.target instanceof Element ? e.target : null;
	if (
		!target ||
		target.closest(
			"input,textarea,select,[contenteditable]:not([contenteditable='false'])",
		)
	)
		return;
	void captureExcerpt(
		"interaction",
		target.closest("button,a,[role='button']") ?? target,
	);
});
document.addEventListener("keydown", (e) => {
	if (!e.isTrusted) return;
	keyThrottler.maybeExecute(Date.now());
	if (e.key !== "Enter" && e.key !== " ") return;
	const target = e.target instanceof Element ? e.target : null;
	if (
		!target ||
		target.closest(
			"input,textarea,select,[contenteditable]:not([contenteditable='false'])",
		)
	)
		return;
	const control = target.closest("button,a,[role='button']");
	if (control) void captureExcerpt("interaction", control);
});

// scroll events do NOT bubble: they fire on the scrolling node only.
// The viewport scrolls against `<html>`/`<body>` → listen on window. Nested
// overflow containers scroll independently → attach to each scrollable node.
window.addEventListener(
	"scroll",
	() => {
		scrollThrottler.maybeExecute(scrollY(), Date.now());
		requestViewportExcerpt(1250);
	},
	{ passive: true },
);
document.addEventListener(
	"scroll",
	(event) => {
		const target = event.target;
		if (
			target instanceof Element &&
			target !== document.documentElement &&
			target !== document.body
		)
			scrollThrottler.maybeExecute(target.scrollTop, Date.now());
		requestViewportExcerpt(1250);
	},
	{ capture: true, passive: true },
);
window.addEventListener("resize", () => requestViewportExcerpt(1000), {
	passive: true,
});
document.addEventListener("visibilitychange", () => {
	if (document.hidden) {
		clearTimeout(excerptTimer);
		excerptTimer = undefined;
		stopMutationObserver();
		flushingHidden = true;
		scrollThrottler.flush();
		keyThrottler.flush();
		flushingHidden = false;
	}
	send(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE");
	if (!document.hidden) void syncCapturePolicy();
});
window.addEventListener("blur", () => {
	clearTimeout(excerptTimer);
	excerptTimer = undefined;
	stopMutationObserver();
});
window.addEventListener("focus", () => void syncCapturePolicy());
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (
		areaName !== "local" ||
		(!changes[PAGE_CAPTURE_ORIGINS_KEY] && !changes[TRACKING_KEY])
	)
		return;
	captureAllowed = false;
	clearTimeout(excerptTimer);
	excerptTimer = undefined;
	stopMutationObserver();
	outbox.clearObservations();
	void syncCapturePolicy();
});
chrome.runtime.onMessage.addListener((message) => {
	if (
		message?.kind === "TABOT_ROUTE_CHANGED" &&
		message.url === location.href
	) {
		clearTimeout(excerptTimer);
		excerptTimer = undefined;
		lastExcerptAt = 0;
		captureAllowed = false;
		stopMutationObserver();
		void syncCapturePolicy();
	}
});
send(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE");
void syncCapturePolicy();
