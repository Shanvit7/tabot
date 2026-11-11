import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { NotFound } from "~/components/not-found";
import "~/styles/app.css";

const RootLayout = () => (
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
});
