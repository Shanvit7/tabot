import { useId } from "react";
import {
	cylinder,
	iso,
	type Point3,
	type Projection,
	pathOf,
	type SolidPaths,
	slabOf,
} from "~/components/illustrations/anatomy/kit";

const projection: Projection = {
	origin: [150, 220],
	scale: 1.12,
	azimuth: 60,
	elevation: 25,
};
const box = (
	x: number,
	y: number,
	z: number,
	w: number,
	d: number,
	h: number,
	r = 0.8,
) => slabOf({ x, y, w, d, r }, z, h, projection, 3, Math.min(0.5, h / 4));
const face = (points: Point3[]) =>
	pathOf(
		points.map((point) => iso(point, projection)),
		true,
	);
const topScrew = (x: number, y: number, z: number) =>
	cylinder(x, y, 1.3, z, 0.7, projection, 16);

// Fixed geometry is projected once. Only the selected copy and request latch move.
const feet = [
	box(6, 7, 0, 16, 15, 12, 2),
	box(85, 7, 0, 16, 15, 12, 2),
	box(6, 77, 0, 16, 15, 12, 2),
	box(85, 77, 0, 16, 15, 12, 2),
];
const cabinetBack = [
	box(-2, -2, 12, 110, 100, 9, 2),
	box(0, 0, 21, 6, 94, 150),
	box(6, 0, 21, 100, 5, 150),
	box(100, 5, 21, 6, 89, 88),
	box(6, 5, 62, 94, 89, 3),
	box(6, 5, 106, 94, 89, 4),
	box(6, 5, 127, 94, 83, 3),
];
const drawers = [25, 67].flatMap((z) => [
	box(6, 90, z, 94, 5, 36),
	box(17, 95, z + 23, 27, 1.4, 8, 0.5),
	box(55, 95, z + 13, 4, 5, 5),
	box(84, 95, z + 13, 4, 5, 5),
	box(55, 100, z + 13, 33, 3, 5, 1),
]);
const retainedRecords = [0, 1, 2, 3, 4].map((index) =>
	box(17, 24, 130 + index * 2, 68, 45, 1.4),
);
const fileTabs = [20, 44, 68].flatMap((x) => [
	box(x, 8, 130, 19, 3, 24),
	box(x + 2, 8, 154, 11, 3, 5),
]);
const cabinetFront = [
	box(6, 88, 110, 5, 6, 61),
	box(95, 88, 110, 5, 6, 61),
	box(6, 88, 163, 94, 6, 8),
	box(-2, -2, 171, 110, 100, 6, 2),
];
const cabinetScrews = [
	topScrew(7, 7, 177),
	topScrew(98, 7, 177),
	topScrew(7, 88, 177),
	topScrew(98, 88, 177),
];

const bridge = [
	box(173, 7, 3, 29, 80, 7, 2),
	box(183, 40, 10, 9, 14, 120),
	box(174, 13, 130, 27, 68, 5),
	box(88, 18, 136, 246, 8, 4),
	box(88, 66, 136, 246, 8, 4),
	box(108, 17, 132, 7, 10, 4),
	box(108, 65, 132, 7, 10, 4),
	box(315, 17, 132, 7, 10, 4),
	box(315, 65, 132, 7, 10, 4),
];
const gateBack = [box(181, 13, 135, 13, 6, 20), box(181, 19, 151, 13, 56, 4)];
const gateFront = [
	box(181, 75, 135, 13, 6, 20),
	box(178, 73, 146, 19, 10, 12, 1.2),
	topScrew(183, 78, 158),
	topScrew(192, 78, 158),
];
const latch = box(182, 27, 149, 11, 33, 2);
const terminal = [
	box(322, 13, 0, 65, 64, 9, 3),
	box(347, 34, 9, 15, 18, 107, 2),
	box(326, 15, 116, 70, 27, 6, 2),
	box(318, 25, 122, 88, 12, 66, 3),
	box(319, 37, 124, 86, 2, 62, 2),
	box(287, 17, 132, 51, 59, 4),
	box(331, 17, 136, 7, 59, 7),
];
const screen = face([
	[325, 39.1, 130],
	[399, 39.1, 130],
	[399, 39.1, 180],
	[325, 39.1, 180],
]);
const chatRequest = face([
	[365, 39.2, 171],
	[392, 39.2, 171],
	[392, 39.2, 157],
	[388, 39.2, 157],
	[385, 39.2, 153],
	[385, 39.2, 157],
	[365, 39.2, 157],
]);
const chatReply = face([
	[332, 39.2, 153],
	[375, 39.2, 153],
	[375, 39.2, 138],
	[339, 39.2, 138],
	[335, 39.2, 134],
	[335, 39.2, 138],
	[332, 39.2, 138],
]);
const selectedNote = box(30, 22, 140, 53, 48, 1.5, 1.2);
const noteTab = box(32, 22, 141.5, 13, 5, 0.5, 0.5);
const noteRules = [33, 40, 47, 54].map((y, index) =>
	pathOf([
		iso([39, y, 141.6], projection),
		iso([index === 3 ? 60 : 74, y, 141.6], projection),
	]),
);
const shadows = [
	face([
		[-8, -4, 0],
		[112, -4, 0],
		[112, 106, 0],
		[-8, 106, 0],
	]),
	face([
		[168, 4, 0],
		[207, 4, 0],
		[207, 91, 0],
		[168, 91, 0],
	]),
	face([
		[316, 7, 0],
		[393, 7, 0],
		[393, 83, 0],
		[316, 83, 0],
	]),
];
const shades = [
	"fill-[#c5cfc2]",
	"fill-[#d1dbce]",
	"fill-[#dee6da]",
	"fill-[#e9eee8]",
];

const Solid = ({
	paths,
	paper = false,
}: {
	paths: SolidPaths;
	paper?: boolean;
}) => (
	<g strokeLinejoin="round">
		<path
			d={paths.fill}
			className={paper ? "fill-[#e9eee8]" : "fill-[#d1dbce]"}
		/>
		{paths.shades.map(
			(d, index) => d && <path key={d} d={d} className={shades[index]} />,
		)}
		<path d={paths.top} className={paper ? "fill-white" : "fill-[#e9eee8]"} />
		<path
			d={`${paths.crease}${paths.bevel ?? ""}`}
			className="fill-none stroke-[#15251b]/20 stroke-[0.5]"
		/>
		<path
			d={paths.outline}
			className="fill-none stroke-[#15251b]/65 stroke-[0.65]"
		/>
	</g>
);
const Solids = ({
	parts,
	paper = false,
}: {
	parts: SolidPaths[];
	paper?: boolean;
}) =>
	parts.map((paths) => <Solid key={paths.fill} paths={paths} paper={paper} />);

// Travel follows world +x: 250 units projected to (306.73, 74.84).
// Gate halves straddle the card's lane; no moving record crosses the housing.
const motion = `
	@keyframes tabot-note-transfer {
		0%, 18% { transform: translate(0px, 0px); }
		82%, 100% { transform: translate(306.73px, 74.84px); }
	}
	@keyframes tabot-request-latch {
		0%, 5% { transform: translateY(3.85px); }
		18%, 100% { transform: translateY(0px); }
	}
	.tabot-connection-note { transform: translate(306.73px, 74.84px); }
	.tabot-connection-figure[data-active="true"] .tabot-connection-note {
		animation: tabot-note-transfer 3s cubic-bezier(.4, 0, .2, 1) both;
	}
	.tabot-connection-figure[data-active="true"] .tabot-connection-latch {
		animation: tabot-request-latch 3s ease-in-out both;
	}
	@media (prefers-reduced-motion: reduce) {
		.tabot-connection-figure[data-active="true"] .tabot-connection-note,
		.tabot-connection-figure[data-active="true"] .tabot-connection-latch { animation: none; }
	}
`;

export const ConnectionFigure = ({ active }: { active: boolean }) => {
	const id = useId();
	return (
		<svg
			viewBox="0 0 700 420"
			role="img"
			aria-labelledby={`${id}-title ${id}-description`}
			className="tabot-connection-figure block h-auto w-full overflow-visible"
			data-active={active}
		>
			<title id={`${id}-title`}>Local records, one selected note</title>
			<desc id={`${id}-description`}>
				A local record cabinet connects to ChatGPT through a request gate. One
				selected note moves outward; other records stay inside the cabinet.
			</desc>
			<defs>
				<filter
					id={`${id}-shadow`}
					x="-30%"
					y="-50%"
					width="160%"
					height="200%"
				>
					<feGaussianBlur stdDeviation="7" />
				</filter>
				<clipPath id={`${id}-screen`}>
					<path d={screen} />
				</clipPath>
			</defs>
			<style>{motion}</style>
			<g>
				<g filter={`url(#${id}-shadow)`} className="fill-[#15251b]/10">
					{shadows.map((d) => (
						<path key={d} d={d} />
					))}
				</g>
				<Solids parts={feet} />
				<Solids parts={cabinetBack} />
				<Solids parts={drawers} paper />
				<Solids parts={fileTabs} />
				<Solids parts={retainedRecords} paper />
				<Solids parts={bridge} />
				<Solids parts={terminal} />
				<path
					d={screen}
					className="fill-[#15251b] stroke-[#15251b] stroke-[0.7]"
				/>
				<g clipPath={`url(#${id}-screen)`}>
					<path d={chatRequest} className="fill-[#e9eee8]" />
					<path d={chatReply} className="fill-white" />
				</g>
				<Solids parts={gateBack} />
				<g className="tabot-connection-note">
					<Solid paths={selectedNote} paper />
					<path d={selectedNote.top} className="fill-[#bfff00]" />
					<Solid paths={noteTab} />
					<g
						className="fill-none stroke-[#15251b]/65 stroke-[0.8]"
						strokeLinecap="round"
					>
						{noteRules.map((d) => (
							<path key={d} d={d} />
						))}
					</g>
				</g>
				<g className="tabot-connection-latch">
					<Solid paths={latch} />
				</g>
				<Solids parts={gateFront} />
				<Solids parts={cabinetFront} />
				<Solids parts={cabinetScrews} />
			</g>
		</svg>
	);
};
