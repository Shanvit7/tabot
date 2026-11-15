import { NOT_FOUND_GEOMETRY as ART } from "~/components/errors/shared/wayfinder-geometry";
import { SolidPart } from "~/components/illustrations/anatomy/solid-part";
import "~/components/illustrations/anatomy/iso.css";
import "~/components/errors/shared/wayfinder.css";

export const NotFoundArt = () => (
	<figure className="iso wayfinder mx-auto w-full max-w-150" data-theme="light">
		<svg
			className="iso-svg"
			viewBox={`0 0 ${ART.width} ${ART.height}`}
			role="img"
			aria-label="A trail ends at a large wayfinding sign marked 404."
		>
			<path className="iso-halo" d={ART.halo} />
			{ART.parts.map((part) => (
				<SolidPart key={part.name} part={part} />
			))}
			<text
				className="iso-face-text wayfinder-number"
				data-tone="lit"
				transform={ART.number}
				fontSize="27"
				textAnchor="middle"
			>
				404
			</text>
		</svg>
	</figure>
);
