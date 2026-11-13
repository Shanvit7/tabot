import { createTelemetry } from "@tabot/shared/telemetry";
import { createPostHogTransport } from "@tabot/shared/telemetry/posthog";

const extensionRelease = () => {
	try {
		return chrome.runtime.getManifest().version;
	} catch {
		return "development";
	}
};

export const telemetry = createTelemetry(
	createPostHogTransport({
		projectKey:
			process.env.PLASMO_PUBLIC_POSTHOG_ENABLED === "true"
				? process.env.PLASMO_PUBLIC_POSTHOG_KEY
				: undefined,
		apiHost: process.env.PLASMO_PUBLIC_POSTHOG_HOST,
		distinctId: "tabot_extension",
		allowedHostSuffix: ".i.posthog.com",
	}),
	{
		platform: "chrome_extension",
		release: process.env.PLASMO_PUBLIC_POSTHOG_RELEASE || extensionRelease(),
		environment:
			process.env.NODE_ENV === "production" ? "production" : "development",
	},
);
