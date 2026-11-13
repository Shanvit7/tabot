import { apiClient } from "../api/client";
import type { TelemetryEvent, TelemetryTransport } from "../telemetry";

const DEFAULT_HOST = "https://us.i.posthog.com";

type PostHogTransportOptions = {
	projectKey?: string;
	apiHost?: string;
	distinctId: string;
	allowedHostSuffix?: string;
};

const resolveHost = (
	host: string | undefined,
	allowedHostSuffix: string | undefined,
) => {
	try {
		const url = new URL(host || DEFAULT_HOST);
		if (url.protocol !== "https:" || url.username || url.password)
			return DEFAULT_HOST;
		if (allowedHostSuffix && !url.hostname.endsWith(allowedHostSuffix))
			return DEFAULT_HOST;
		return url.origin;
	} catch {
		return DEFAULT_HOST;
	}
};

const toPostHogEvent = (event: TelemetryEvent) => {
	const context = {
		platform: event.context.platform,
		$release_id: event.context.release,
		environment: event.context.environment,
		$process_person_profile: false,
		$lib: "@tabot/shared-telemetry",
	};
	if (event.type === "page_view")
		return {
			event: "$pageview",
			properties: { ...context, route: event.route },
		};

	const { exception } = event;
	const fingerprint = [
		exception.name,
		exception.message,
		...exception.frames
			.slice(0, 4)
			.map((frame) => `${frame.filename}:${frame.lineno}`),
	].join(":");
	return {
		event: "$exception",
		properties: {
			...context,
			$exception_message: exception.message,
			$exception_type: exception.name,
			$exception_level: "error",
			$exception_fingerprint: fingerprint,
			$exception_list: [
				{
					type: exception.name,
					value: exception.message,
					mechanism: { type: "generic", handled: event.handled },
					...(exception.frames.length
						? {
								stacktrace: {
									type: "raw",
									frames: exception.frames.map((frame) => ({
										...frame,
										function: "<redacted>",
									})),
								},
							}
						: {}),
				},
			],
			error_source: event.source,
			...(event.failureCode ? { error_code: event.failureCode } : {}),
		},
	};
};

export const createPostHogTransport = (
	options: PostHogTransportOptions,
): TelemetryTransport => {
	const projectKey = options.projectKey?.trim();
	const apiHost = resolveHost(options.apiHost, options.allowedHostSuffix);
	return {
		capture: async (event) => {
			if (!projectKey) return;
			await apiClient.request(`${apiHost}/capture/`, {
				method: "POST",
				keepalive: true,
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					api_key: projectKey,
					distinct_id: options.distinctId,
					...toPostHogEvent(event),
				}),
			});
		},
	};
};
