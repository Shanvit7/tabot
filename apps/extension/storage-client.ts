import { createEventsDb } from "@tabot/shared";

let offscreenReady: Promise<void> | undefined;

const waitForStorageOwner = async () => {
	for (let attempt = 0; attempt < 40; attempt++) {
		try {
			const response = await chrome.runtime.sendMessage({
				kind: "TABOT_STORAGE_PING",
			});
			if (response?.ready) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("storage-owner-not-ready");
};

const ensureStorageOwner = () => {
	// Share concurrent startup, not lifetime readiness: offscreen can close/reload.
	offscreenReady ??= (async () => {
		if (!(await chrome.offscreen.hasDocument()))
			await chrome.offscreen.createDocument({
				url: "tabs/offscreen.html",
				reasons: ["WORKERS" as unknown as chrome.offscreen.Reason],
				justification:
					"Keep local TalaDB owner alive while extension service worker sleeps.",
			});
		await waitForStorageOwner();
	})().finally(() => {
		offscreenReady = undefined;
	});
	return offscreenReady;
};

export const getStorageDb = async () =>
	createEventsDb(async (message) => {
		await ensureStorageOwner();
		return chrome.runtime.sendMessage(message);
	});
