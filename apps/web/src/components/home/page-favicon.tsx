import { useState } from "react";
import { faviconOf } from "~/lib/site-format";

export const PageFavicon = ({
	page,
}: {
	page: { url: string; host: string; favicon?: string | null };
}) => {
	const [failed, setFailed] = useState(false);
	const fallback = faviconOf(new URL(page.url).origin);
	const preferred = page.favicon ?? fallback;
	const src =
		failed && preferred !== fallback
			? fallback
			: failed
				? undefined
				: preferred;

	return (
		<span
			aria-hidden="true"
			className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1"
		>
			{failed || !src ? (
				<span className="font-display text-lg">
					{page.host[0].toUpperCase()}
				</span>
			) : (
				<img
					src={src}
					alt=""
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					className="size-full object-contain"
					onError={() => setFailed(true)}
				/>
			)}
		</span>
	);
};
