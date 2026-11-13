import {
	createTelemetry,
	type TelemetryErrorSource,
} from "@tabot/shared/telemetry";
import { createPostHogTransport } from "@tabot/shared/telemetry/posthog";

const routes = new Set([
	"/",
	"/ai",
	"/assistant",
	"/extension-not-connected",
	"/home",
	"/privacy",
	"/settings",
]);

const telemetry = createTelemetry(
	createPostHogTransport({
		projectKey:
			import.meta.env.VITE_POSTHOG_ENABLED === "true"
				? import.meta.env.VITE_POSTHOG_KEY
				: undefined,
		apiHost: import.meta.env.VITE_POSTHOG_HOST,
		distinctId: "tabot_web",
	}),
	{
		platform: "web_dashboard",
		release: import.meta.env.VITE_POSTHOG_RELEASE || "development",
		environment: import.meta.env.MODE,
	},
);

export const trackDashboardPage = (pathname: string) =>
	telemetry.pageView(routes.has(pathname) ? pathname : "/other");

export const trackDashboardError = (
	value: unknown,
	source: TelemetryErrorSource,
	handled = false,
) => telemetry.captureError(value, source, handled);
