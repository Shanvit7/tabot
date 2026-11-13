import { NOT_FOUND_GEOMETRY as ART } from "~/components/errors/shared/wayfinder-geometry";
import { SolidPart } from "~/components/illustrations/anatomy/solid-part";
import "~/components/illustrations/anatomy/iso.css";
import "~/components/errors/shared/wayfinder.css";
import "~/components/errors/global-error/art.css";

const BILLBOARD_PARTS = ART.parts.filter(
	(part) => part.name.startsWith("post.") || part.name.startsWith("sign."),
);

export const GlobalErrorArt = () => (
	<figure
		className="iso wayfinder global-error-art mx-auto w-full max-w-150"
		data-theme="light"
	>
		<svg
			className="iso-svg"
			viewBox={`0 0 ${ART.width} ${ART.height}`}
			role="img"
			aria-label="A damaged billboard with lime sparks coming from its cracked sign."
		>
			{BILLBOARD_PARTS.map((part) => (
				<SolidPart key={part.name} part={part} />
			))}
			<g className="global-error-art-sparks">
				<path d="m402 111 13-7 4 6 12-8" pathLength="1" />
				<path d="m412 139 10 2 5 9 12-2" pathLength="1" />
				<path d="m404 164 9 5-3 8 10 5" pathLength="1" />
				<path d="m282 74-11-6-5 7-10-4" pathLength="1" />
				<path d="m281 99-9 3-3 8-8-1" pathLength="1" />
			</g>
			<g className="global-error-art-cracks">
				<path d="m327 78 12 13-8 8 16 10-9 10 15 10-8 10 17 12" />
				<path d="m347 109 13-4 5-12m-12 51 16-5 5-13" />
			</g>
		</svg>
	</figure>
);
