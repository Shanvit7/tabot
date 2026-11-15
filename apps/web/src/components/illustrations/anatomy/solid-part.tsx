import type { AnatomyPart } from "~/components/illustrations/anatomy/kit";

export const SolidPart = ({ part }: { part: AnatomyPart }) => (
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
