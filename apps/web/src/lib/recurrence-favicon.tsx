import { useState } from "react";
import { faviconOf } from "~/lib/context-graph-data";

export const Favicon = ({
	origin,
	favicons,
	className = "size-4",
}: {
	origin: string;
	favicons?: Map<string, string>;
	className?: string;
}) => {
	const [failed, setFailed] = useState(false);
	// Plain <img>: the browser's own cache handles repeats, onError the misses.
	const src = favicons?.get(origin) ?? faviconOf(origin);
	if (!src || failed)
		return <span className={`${className} rounded-full bg-[#c9dcce]`} />;
	return (
		<img
			src={src}
			alt=""
			onError={() => setFailed(true)}
			className={`${className} rounded border border-[#d2ddd2] bg-white object-contain`}
		/>
	);
};
