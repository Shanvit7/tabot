// Tabot extension background service worker
// Handles Chrome tab events and manages SharedArrayBuffer event pipeline

export {};

let eventCount = 0;

// ponytail: minimal event listener stubs — real pipeline comes next
chrome.tabs.onCreated.addListener((tab) => {
	eventCount++;
	console.log("[Tabot] TAB_CREATED", tab.id);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
	eventCount++;
	console.log("[Tabot] TAB_ACTIVATED", activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	eventCount++;
	console.log("[Tabot] TAB_UPDATED", tabId, changeInfo.status);
});

chrome.tabs.onRemoved.addListener((tabId) => {
	eventCount++;
	console.log("[Tabot] TAB_REMOVED", tabId);
});

// Message handler for popup queries
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "GET_STATS") {
		sendResponse({
			totalEvents: eventCount,
			tabCreated: 0,
			tabActivated: 0,
			tabUpdated: 0,
			tabRemoved: 0,
			eventsProcessed: eventCount,
			lastProcessedAt: eventCount > 0 ? Date.now() : 0,
		});
	}

	if (message.type === "GENERATE_TEST_EVENTS") {
		console.log(`[Tabot] Generating ${message.count} test events...`);
		eventCount += message.count;
		sendResponse({ ok: true });
	}

	return true; // keep message channel open for async
});
