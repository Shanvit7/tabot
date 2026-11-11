import {
	type AnatomyPart,
	NOT_FOUND_GEOMETRY as ART,
} from "~/components/not-found-geometry";
import "~/components/anatomy/iso.css";
import "~/components/not-found.css";

const Part = ({ part }: { part: AnatomyPart }) => (
	<g data-material={part.material}>
		<g className="iso-solid">
			<path className="iso-fill" d={part.paths.fill} />
			{part.paths.shades.map((d) =>
				d ? <path key={d} className="iso-shade" d={d} /> : null,
			)}
			<path className="iso-top" d={part.paths.top} />
			<path
				className="iso-line iso-crease"
				data-tone="faint"
				d={part.paths.crease}
			/>
			{part.paths.bevel ? (
				<path
					className="iso-line iso-bevel"
					data-tone="faint"
					d={part.paths.bevel}
				/>
			) : null}
			{part.line ? (
				<path className="iso-line" data-tone="lo" d={part.line} />
			) : null}
			<path
				className="iso-line iso-edge"
				data-tone={part.tone}
				d={part.paths.outline}
			/>
		</g>
		{part.dots.map(([x, y]) => (
			<circle
				key={`${x},${y}`}
				className="anatomy-screw"
				cx={x}
				cy={y}
				r="0.45"
			/>
		))}
	</g>
);

export const NotFoundArt = () => (
	<figure
		className="iso wayfinder mx-auto w-full max-w-[37.5rem]"
		data-theme="light"
	>
		<svg
			className="iso-svg"
			viewBox={`0 0 ${ART.width} ${ART.height}`}
			role="img"
			aria-label="A trail ends at a large wayfinding sign marked 404."
		>
			<path className="iso-halo" d={ART.halo} />
			{ART.parts.map((part) => (
				<Part key={part.name} part={part} />
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
