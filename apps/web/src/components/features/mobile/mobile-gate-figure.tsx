import type {
	MobileGateLine,
	MobileGatePart,
} from "~/components/features/mobile/mobile-gate-geometry";
import { MOBILE_GATE_GEOMETRY as ART } from "~/components/features/mobile/mobile-gate-geometry";
import "~/components/illustrations/anatomy/iso.css";
import "~/components/features/mobile/mobile-gate-figure.css";

const Part = ({ part }: { part: MobileGatePart }) => (
	<g className="iso-solid" data-lit={part.lit ? "" : undefined}>
		<path className="iso-fill" d={part.paths.fill} />
		{part.paths.shades.map((d, index) =>
			d ? (
				<path key={d} className="iso-shade" data-shade={index} d={d} />
			) : null,
		)}
		{part.paths.top && <path className="iso-top" d={part.paths.top} />}
		{part.paths.crease && (
			<path
				className="iso-line iso-crease"
				data-tone="faint"
				d={part.paths.crease}
			/>
		)}
		<path
			className="iso-line iso-edge"
			data-tone={part.tone}
			d={part.paths.outline}
		/>
	</g>
);

const Lines = ({ lines }: { lines: MobileGateLine[] }) =>
	lines.map((line) => {
		const unsupported = line.name.startsWith("phone.unsupported");
		return (
			<path
				key={`${line.name}.${line.d}`}
				className={
					unsupported
						? "iso-line mobile-phone-mark"
						: line.name.startsWith("screen.chart")
							? "iso-line mobile-screen-chart"
							: "iso-line"
				}
				data-tone={line.tone}
				d={line.d}
				pathLength={unsupported ? 100 : undefined}
			/>
		);
	});

export const MobileGateFigure = () => (
	<figure className="iso mobile-gate-figure" data-theme="light">
		<svg
			className="iso-svg mobile-gate-art"
			viewBox={`0 0 ${ART.width} ${ART.height}`}
			aria-hidden="true"
		>
			<path className="iso-halo" d={ART.halo} />
			<g data-device="desk">
				{ART.parts
					.filter((part) => part.device === "desk")
					.map((part) => (
						<Part key={part.name} part={part} />
					))}
				<Lines lines={ART.lines.filter((line) => line.device === "desk")} />
			</g>
			<g data-device="phone">
				{ART.parts
					.filter((part) => part.device === "phone")
					.map((part) => (
						<Part key={part.name} part={part} />
					))}
				<Lines lines={ART.lines.filter((line) => line.device === "phone")} />
			</g>
			<g data-device="desktop">
				{ART.parts
					.filter((part) => part.device === "desktop")
					.map((part) => (
						<Part key={part.name} part={part} />
					))}
				<Lines lines={ART.lines.filter((line) => line.device === "desktop")} />
				<path
					className="mobile-desktop-target"
					d={ART.target}
					pathLength={100}
				/>
			</g>
		</svg>
		<figcaption className="sr-only">
			Tabot runs in desktop Chrome, not on this phone.
		</figcaption>
	</figure>
);
