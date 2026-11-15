import type {
	PostHogConfig,
	Properties,
} from "posthog-js/dist/module.no-external";

// Rebuild events rather than forwarding SDK URL, referrer, DOM, or person data.
export const landingWebVitalsConfig = (
	canonicalUrl: string,
	isActive: () => boolean,
): Partial<PostHogConfig> => ({
	autocapture: false,
	capture_pageview: false,
	capture_pageleave: false,
	capture_dead_clicks: false,
	rageclick: false,
	capture_heatmaps: false,
	capture_exceptions: false,
	disable_session_recording: true,
	disable_surveys: true,
	disable_conversations: true,
	disable_product_tours: true,
	disable_web_experiments: true,
	advanced_disable_flags: true,
	advanced_disable_toolbar_metrics: true,
	disable_external_dependency_loading: true,
	disable_persistence: true,
	persistence: "memory",
	person_profiles: "never",
	bootstrap: { distinctID: "tabot_web" },
	save_referrer: false,
	save_campaign_params: false,
	get_current_url: () => canonicalUrl,
	ip: false,
	capture_performance: {
		web_vitals: true,
		web_vitals_allowed_metrics: ["LCP", "CLS", "INP", "FCP"],
		web_vitals_attribution: false,
		network_timing: false,
	},
	before_send: (event) => {
		if (!isActive() || event?.event !== "$web_vitals") return null;
		const properties: Properties = {
			token: event.properties.token,
			distinct_id: "tabot_web",
			$process_person_profile: false,
			$current_url: canonicalUrl,
		};
		let hasMetric = false;
		for (const metric of ["LCP", "CLS", "INP", "FCP"]) {
			const valueKey = `$web_vitals_${metric}_value`;
			const value = event.properties[valueKey];
			if (
				typeof value !== "number" ||
				!Number.isFinite(value) ||
				value < 0 ||
				value > 900_000
			)
				continue;
			properties[valueKey] = value;
			const metricEvent = event.properties[`$web_vitals_${metric}_event`];
			if (!metricEvent || typeof metricEvent !== "object") continue;
			const rating = metricEvent.rating;
			if (
				rating !== "good" &&
				rating !== "needs-improvement" &&
				rating !== "poor"
			)
				continue;
			const delta = metricEvent.delta;
			properties[`$web_vitals_${metric}_event`] = {
				name: metric,
				value,
				rating,
				...(typeof delta === "number" && Number.isFinite(delta) && delta >= 0
					? { delta }
					: {}),
			};
			hasMetric = true;
		}
		return hasMetric
			? {
					event: "$web_vitals",
					uuid: event.uuid,
					timestamp: event.timestamp,
					properties,
				}
			: null;
	},
});

let started = false;

export const startLandingWebVitals = (
	projectKey: string,
	apiHost: string | undefined,
	canonicalUrl: string,
) => {
	const landingPath = new URL(canonicalUrl).pathname;
	const navigation = performance.getEntriesByType("navigation")[0];
	// These are document-load metrics, not measurements of later SPA visits.
	if (
		started ||
		!navigation ||
		new URL(navigation.name).pathname !== landingPath
	)
		return;
	let active = true;
	void Promise.all([
		import("posthog-js/dist/module.no-external"),
		import("posthog-js/dist/web-vitals"),
	])
		.then(([{ default: posthog }]) => {
			if (!active || started) return;
			started = true;
			posthog.init(
				projectKey,
				{
					...landingWebVitalsConfig(
						canonicalUrl,
						() => active && window.location.pathname === landingPath,
					),
					...(apiHost ? { api_host: apiHost } : {}),
				},
				"tabot_landing_vitals",
			);
		})
		.catch(() => {
			// Optional diagnostics must not interrupt the landing page.
		});
	return () => {
		active = false;
	};
};
