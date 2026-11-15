import {
	createTelemetry,
	type TelemetryAction,
	type TelemetryErrorSource,
} from "@tabot/shared/telemetry";
import { createPostHogTransport } from "@tabot/shared/telemetry/posthog";
import {
	APP_ENVIRONMENT,
	POSTHOG_HOST,
	POSTHOG_PROJECT_KEY,
	POSTHOG_RELEASE,
} from "~/lib/constants";

const routes = new Set([
	"/",
	"/automations",
	"/assistant",
	"/extension-not-connected",
	"/home",
	"/privacy",
	"/settings",
]);

const telemetry = createTelemetry(
	createPostHogTransport({
		projectKey: POSTHOG_PROJECT_KEY,
		apiHost: POSTHOG_HOST,
		distinctId: "tabot_web",
	}),
	{
		platform: "web_dashboard",
		release: POSTHOG_RELEASE,
		environment: APP_ENVIRONMENT,
	},
);

export const trackDashboardPage = (pathname: string) =>
	telemetry.pageView(routes.has(pathname) ? pathname : "/other");

export const trackLandingAction = (action: TelemetryAction) =>
	telemetry.captureAction(action);

export const trackDashboardError = (
	value: unknown,
	source: TelemetryErrorSource,
	handled = false,
) => telemetry.captureError(value, source, handled);
