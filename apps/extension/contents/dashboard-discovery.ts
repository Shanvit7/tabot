import type { PlasmoCSConfig } from "plasmo";
import { isDashboardSender } from "../dashboard/sender";

export const config: PlasmoCSConfig = {
	matches: ["http://localhost/*", "https://shanvit7.github.io/tabot*"],
	run_at: "document_start",
};

// Identity only. All data access still uses sender-validated external messaging.
window.addEventListener("message", (event: MessageEvent) => {
	if (
		!isDashboardSender(location.href) ||
		event.source !== window ||
		event.origin !== location.origin ||
		event.data?.type !== "TABOT_DISCOVER_EXTENSION" ||
		!chrome.runtime.id
	)
		return;
	window.postMessage(
		{ type: "TABOT_EXTENSION_READY", extensionId: chrome.runtime.id },
		location.origin,
	);
});
