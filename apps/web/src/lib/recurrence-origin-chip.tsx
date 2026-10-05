import { prettySite } from "~/lib/context-graph-data";
import { Favicon } from "~/lib/recurrence-favicon";

export const OriginChip = ({
	origin,
	favicons,
}: {
	origin: string;
	favicons?: Map<string, string>;
}) => (
	<span className="inline-flex items-center gap-1">
		<Favicon origin={origin} favicons={favicons} />
		<span className="max-w-[92px] truncate text-[11px] text-[#476151]">
			{prettySite(origin)}
		</span>
	</span>
);
