import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useIsMobile } from "~/hooks/use-is-mobile";

export const useExtensionRedirect = ({
	hasExtension,
	initialized,
}: {
	hasExtension: boolean;
	initialized: boolean;
}) => {
	const navigate = useNavigate();
	const { isMobile, isLoading } = useIsMobile();
	const redirecting =
		!isLoading && (isMobile || (initialized && !hasExtension));

	useEffect(() => {
		if (!redirecting) return;
		void navigate({ to: "/extension-not-connected", replace: true });
	}, [navigate, redirecting]);

	return isLoading || redirecting;
};
