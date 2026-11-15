import assert from "node:assert/strict";
import {
	landingWebVitalsConfig,
	startLandingWebVitals,
} from "../lib/landing-web-vitals.ts";

const canonicalUrl = "https://example.com/tabot/";
let active = true;
const config = landingWebVitalsConfig(canonicalUrl, () => active);
const filter = config.before_send;
const event = {
	uuid: "event-id",
	event: "$web_vitals",
	timestamp: new Date(),
	$set: { email: "private@example.com" },
	$set_once: { $initial_referrer: "https://private.example" },
	properties: {
		token: "project-key",
		distinct_id: "private-user-id",
		$current_url: "https://example.com/tabot/?secret=private#note",
		$referrer: "https://private.example",
		$session_id: "private-session",
		$web_vitals_LCP_value: 1400,
		$web_vitals_CLS_value: 0,
		$web_vitals_INP_value: 180,
		$web_vitals_FCP_value: 800,
		$web_vitals_LCP_event: {
			rating: "good",
			delta: 1400,
			attribution: { element: "private text" },
		},
		$web_vitals_CLS_event: { rating: "good", delta: 0 },
		$web_vitals_INP_event: { rating: "good", delta: 180 },
		$web_vitals_FCP_event: { rating: "good", delta: 800 },
	},
};
assert.deepEqual(filter(event), {
	uuid: event.uuid,
	event: "$web_vitals",
	timestamp: event.timestamp,
	properties: {
		token: "project-key",
		distinct_id: "tabot_web",
		$process_person_profile: false,
		$current_url: canonicalUrl,
		$web_vitals_LCP_value: 1400,
		$web_vitals_CLS_value: 0,
		$web_vitals_INP_value: 180,
		$web_vitals_FCP_value: 800,
		$web_vitals_LCP_event: {
			name: "LCP",
			value: 1400,
			rating: "good",
			delta: 1400,
		},
		$web_vitals_CLS_event: {
			name: "CLS",
			value: 0,
			rating: "good",
			delta: 0,
		},
		$web_vitals_INP_event: {
			name: "INP",
			value: 180,
			rating: "good",
			delta: 180,
		},
		$web_vitals_FCP_event: {
			name: "FCP",
			value: 800,
			rating: "good",
			delta: 800,
		},
	},
});
for (const name of [
	"$pageview",
	"$autocapture",
	"$exception",
	"$snapshot",
	"$feature_flag_called",
]) {
	assert.equal(filter({ ...event, event: name }), null);
}
for (const value of [NaN, Infinity, -1, 900_001, "1200", undefined]) {
	assert.equal(
		filter({ ...event, properties: { $web_vitals_LCP_value: value } }),
		null,
	);
}
active = false;
assert.equal(filter(event), null);
assert.equal(filter(null), null);
assert.equal(
	config.get_current_url("https://private.example/?secret=1"),
	canonicalUrl,
);
assert.equal(config.disable_persistence, true);
assert.equal(config.disable_external_dependency_loading, true);
assert.equal(config.person_profiles, "never");
assert.equal(config.autocapture, false);
assert.equal(config.capture_pageview, false);
assert.equal(config.capture_pageleave, false);
assert.equal(config.disable_session_recording, true);
assert.equal(config.advanced_disable_flags, true);
assert.equal(config.capture_performance.web_vitals, true);
assert.equal(config.capture_performance.web_vitals_attribution, false);

// A client-side visit from another document must not relabel that page's vitals.
const originalPerformance = globalThis.performance;
Object.defineProperty(globalThis, "performance", {
	configurable: true,
	value: {
		getEntriesByType: () => [{ name: "https://example.com/tabot/home" }],
	},
});
try {
	assert.equal(
		startLandingWebVitals("project-key", undefined, canonicalUrl),
		undefined,
	);
} finally {
	Object.defineProperty(globalThis, "performance", {
		configurable: true,
		value: originalPerformance,
	});
}
console.log(
	"Landing Web Vitals scope, metric allowlist, and privacy checks passed",
);
