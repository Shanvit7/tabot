import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { GlobalError } from "~/components/errors/global-error";
import { NotFound } from "~/components/errors/not-found";
import { useIsMobile } from "~/hooks/use-is-mobile";
import { trackDashboardError, trackDashboardPage } from "~/lib/telemetry";
import "~/styles/app.css";

const RootLayout = () => {
	const navigate = useNavigate();
	const { isMobile, isLoading } = useIsMobile();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	useEffect(() => trackDashboardPage(pathname), [pathname]);
	useEffect(() => {
		if (isLoading) return;
		if (isMobile && pathname !== "/mobile" && pathname !== "/privacy") {
			void navigate({ to: "/mobile", replace: true });
		} else if (!isMobile && pathname === "/mobile") {
			void navigate({ to: "/home", replace: true });
		}
	}, [isLoading, isMobile, navigate, pathname]);
	useEffect(() => {
		const onError = (event: ErrorEvent) =>
			trackDashboardError(event.error, "window_error");
		const onUnhandledRejection = (event: PromiseRejectionEvent) =>
			trackDashboardError(event.reason, "unhandled_rejection");
		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onUnhandledRejection);
		return () => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onUnhandledRejection);
		};
	}, []);
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<Outlet />
				<Scripts />
			</body>
		</html>
	);
};

export const Route = createRootRoute({
	head: () => ({
		links: [
			{
				rel: "icon",
				href: `${import.meta.env.BASE_URL}logo.png`,
				type: "image/png",
			},
		],
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Tabot" },
		],
	}),
	component: RootLayout,
	notFoundComponent: NotFound,
	errorComponent: GlobalError,
});
