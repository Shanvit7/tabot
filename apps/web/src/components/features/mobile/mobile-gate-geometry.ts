import {
	boxCorners,
	cylinder,
	depthOf,
	fitProjection,
	iso,
	lineOnTop,
	type Plan,
	type Point3,
	type Projection,
	pathOf,
	planOutline,
	type SolidPaths,
	slabOf,
	type Tone,
} from "~/components/illustrations/anatomy/kit";

export interface MobileGatePart {
	name: string;
	device: "desk" | "desktop" | "phone";
	paths: SolidPaths;
	tone: Tone;
	lit?: boolean;
}

export interface MobileGateLine {
	name: string;
	device: "desk" | "desktop" | "phone";
	d: string;
	tone: Tone;
}

const WIDTH = 440;
const HEIGHT = 250;
const DESK: Plan = { x: -105, y: -62, w: 200, d: 145, r: 5 };
const LAPTOP: Plan = { x: -51, y: -22, w: 102, d: 77, r: 5 };
const PHONE: Plan = { x: -90, y: 20, w: 28, d: 48, r: 4 };
const DISPLAY: Plan = { x: -51, y: -20, w: 102, d: 4, r: 3 };
const DISPLAY_FRONT = -24;
const P: Projection = fitProjection(
	[
		...boxCorners(DESK, -22, 3),
		...boxCorners(LAPTOP, 3, 8),
		...([
			[-51, DISPLAY.y, 8],
			[51, DISPLAY.y, 78],
			[-51, DISPLAY.y, 78],
			[51, DISPLAY.y, 8],
		] as Point3[]),
		...boxCorners(PHONE, 3, 7),
	],
	WIDTH,
	HEIGHT,
	{ pad: 14, azimuth: 48, elevation: 30 },
);

const parts: MobileGatePart[] = [];
const lines: MobileGateLine[] = [];
const makePart = (
	name: string,
	device: MobileGatePart["device"],
	paths: SolidPaths,
	tone: Tone = "mid",
	lit = false,
) => parts.push({ name, device, paths, tone, lit });
const plane = (points: Point3[]) =>
	pathOf(
		points.map((point) => iso(point, P)),
		true,
	);
const face = (
	name: string,
	device: MobileGatePart["device"],
	d: string,
	tone: Tone = "mid",
	lit = false,
) =>
	makePart(
		name,
		device,
		{ fill: d, outline: d, crease: "", top: "", shades: [] },
		tone,
		lit,
	);
const addLine = (
	name: string,
	device: MobileGateLine["device"],
	d: string,
	tone: Tone = "lo",
) => lines.push({ name, device, d, tone });
const sortByDepth = (points: Point3[]) =>
	[...points].sort((a, b) => depthOf(a, P) - depthOf(b, P));

// Figure parts: metal desk, 24 individual keys, local-activity screen and phone shell.
const deskLegs: Plan[] = [
	{ x: -97, y: -53, w: 9, d: 9, r: 1.4 },
	{ x: 79, y: -53, w: 9, d: 9, r: 1.4 },
	{ x: -97, y: 67, w: 9, d: 9, r: 1.4 },
	{ x: 79, y: 67, w: 9, d: 9, r: 1.4 },
];
for (const [index, leg] of deskLegs.entries()) {
	makePart(`desk.leg.${index}`, "desk", slabOf(leg, -21, 20, P, 4, 0.7), "lo");
	const cap = cylinder(
		leg.x + leg.w / 2,
		leg.y + leg.d / 2,
		2.8,
		-21,
		1.2,
		P,
		16,
	);
	makePart(`desk.foot.${index}`, "desk", cap, "faint");
}
makePart(
	"desk.rail.back",
	"desk",
	slabOf({ x: -88, y: -48, w: 168, d: 5, r: 2 }, -12, 5, P, 4),
	"lo",
);
makePart(
	"desk.rail.front",
	"desk",
	slabOf({ x: -88, y: 62, w: 168, d: 5, r: 2 }, -12, 5, P, 4),
	"lo",
);
makePart("desk.top", "desk", slabOf(DESK, 0, 3, P, 8, 1), "mid");
addLine(
	"desk.inset",
	"desk",
	planOutline(
		{
			...DESK,
			x: DESK.x + 4,
			y: DESK.y + 4,
			w: DESK.w - 8,
			d: DESK.d - 8,
			r: 3,
		},
		3.02,
		P,
	),
	"faint",
);
for (const [index, [x, y]] of sortByDepth(
	deskLegs.map(({ x, y, w, d }) => [x + w / 2, y + d / 2, 3]),
).entries()) {
	addLine(
		`desk.fastener.${index}`,
		"desk",
		pathOf([iso([x - 1.1, y, 3.1], P), iso([x + 1.1, y, 3.1], P)]),
		"lo",
	);
}

// Laptop feet, tapered case, keyboard well, 24 individual key caps, spacebar and trackpad.
const laptopFeet = [
	{ x: -46, y: -17, w: 8, d: 5, r: 2 },
	{ x: 38, y: -17, w: 8, d: 5, r: 2 },
	{ x: -46, y: 44, w: 8, d: 5, r: 2 },
	{ x: 38, y: 44, w: 8, d: 5, r: 2 },
];
for (const [index, foot] of laptopFeet.entries())
	makePart(
		`laptop.foot.${index}`,
		"desktop",
		slabOf(foot, 3.05, 1.2, P, 4),
		"lo",
	);
makePart("laptop.case", "desktop", slabOf(LAPTOP, 4, 2.3, P, 8, 0.8), "mid");
const deck: Plan = { x: -48, y: -19, w: 96, d: 71, r: 4 };
makePart("laptop.deck", "desktop", slabOf(deck, 6.3, 0.45, P, 8), "hi");
const keyWell: Plan = { x: -41, y: -11, w: 82, d: 37, r: 2 };
addLine("keyboard.well", "desktop", planOutline(keyWell, 6.76, P, 4), "lo");
let keyIndex = 0;
for (let row = 0; row < 3; row++) {
	for (let column = 0; column < 8; column++) {
		const key: Plan = {
			x: -37 + column * 10.4,
			y: -7 + row * 10.1,
			w: 7.2,
			d: 6.2,
			r: 1.1,
		};
		makePart(
			`keyboard.key.${keyIndex++}`,
			"desktop",
			slabOf(key, 6.75, 1.25, P, 4, 0.25),
			"mid",
		);
	}
}
makePart(
	"keyboard.spacebar",
	"desktop",
	slabOf({ x: -17, y: 23, w: 34, d: 5.5, r: 1.4 }, 6.75, 1.25, P, 4, 0.25),
	"mid",
);
makePart(
	"trackpad.well",
	"desktop",
	slabOf({ x: -17, y: 34, w: 34, d: 15, r: 2 }, 6.76, 0.2, P, 6),
	"lo",
);
makePart(
	"trackpad.surface",
	"desktop",
	slabOf({ x: -15, y: 36, w: 30, d: 11, r: 1.5 }, 6.97, 0.1, P, 6),
	"mid",
);
for (const x of [-35, 35]) {
	makePart(
		`hinge.${x}`,
		"desktop",
		slabOf({ x: x - 6, y: -22, w: 12, d: 5, r: 2 }, 6.6, 1.4, P, 6),
		"lo",
	);
}

// Screen shell is a thin, open lid with a paper-white display plane and detailed browser UI.
const displayBack = { ...DISPLAY, y: -20 };
makePart(
	"display.back",
	"desktop",
	slabOf(displayBack, 8, 1.8, P, 6, 0.5),
	"lo",
);
face(
	"display.bezel",
	"desktop",
	plane([
		[-51, DISPLAY_FRONT, 9],
		[51, DISPLAY_FRONT, 9],
		[51, DISPLAY_FRONT, 77],
		[-51, DISPLAY_FRONT, 77],
	]),
	"lo",
);
face(
	"display.glass",
	"desktop",
	plane([
		[-45, DISPLAY_FRONT - 0.1, 16],
		[45, DISPLAY_FRONT - 0.1, 16],
		[45, DISPLAY_FRONT - 0.1, 70],
		[-45, DISPLAY_FRONT - 0.1, 70],
	]),
	"hi",
	true,
);
face(
	"browser.toolbar",
	"desktop",
	plane([
		[-43, DISPLAY_FRONT - 0.2, 63],
		[43, DISPLAY_FRONT - 0.2, 63],
		[43, DISPLAY_FRONT - 0.2, 68],
		[-43, DISPLAY_FRONT - 0.2, 68],
	]),
	"lo",
);
const screenLine = (
	name: string,
	x0: number,
	z0: number,
	x1: number,
	z1: number,
	tone: Tone = "faint",
) =>
	addLine(
		name,
		"desktop",
		pathOf([
			iso([x0, DISPLAY_FRONT - 0.3, z0], P),
			iso([x1, DISPLAY_FRONT - 0.3, z1], P),
		]),
		tone,
	);
for (const [index, x] of [-38, -34, -30].entries()) {
	const center = iso([x, DISPLAY_FRONT - 0.4, 65.5], P);
	face(
		`browser.control.${index}`,
		"desktop",
		pathOf(
			[
				[center[0] - 0.8, center[1] - 0.8],
				[center[0] + 0.8, center[1] - 0.8],
				[center[0] + 0.8, center[1] + 0.8],
				[center[0] - 0.8, center[1] + 0.8],
			],
			true,
		),
		"faint",
	);
}
screenLine("screen.title", -36, 56, 1, 56, "lo");
screenLine("screen.activity.0", -35, 48, 28, 48, "faint");
screenLine("screen.activity.1", -35, 44, 17, 44, "faint");
screenLine("screen.activity.2", -35, 40, 32, 40, "faint");
screenLine("screen.activity.3", -35, 36, 8, 36, "faint");
screenLine("screen.activity.4", -35, 32, 24, 32, "faint");
screenLine("screen.chart.base", 7, 25, 37, 25, "lo");
screenLine("screen.chart", 9, 27, 15, 35, "hi");
screenLine("screen.chart", 15, 35, 21, 31, "hi");
screenLine("screen.chart", 21, 31, 28, 41, "hi");
screenLine("screen.chart", 28, 41, 36, 46, "hi");
for (const [index, point] of [
	[-46, 73],
	[46, 73],
	[-46, 13],
	[46, 13],
].entries()) {
	const dot = iso([point[0], point[1], 8], P);
	face(
		`case.screw.${index}`,
		"desktop",
		pathOf(
			[
				[dot[0] - 0.7, dot[1] - 0.7],
				[dot[0] + 0.7, dot[1] - 0.7],
				[dot[0] + 0.7, dot[1] + 0.7],
				[dot[0] - 0.7, dot[1] + 0.7],
			],
			true,
		),
		"faint",
	);
}
const camera = iso([0, DISPLAY_FRONT - 0.5, 73], P);
face(
	"display.camera",
	"desktop",
	pathOf(
		[
			[camera[0] - 0.8, camera[1] - 0.8],
			[camera[0] + 0.8, camera[1] - 0.8],
			[camera[0] + 0.8, camera[1] + 0.8],
			[camera[0] - 0.8, camera[1] + 0.8],
		],
		true,
	),
	"mid",
);
makePart(
	"activity.light",
	"desktop",
	cylinder(42, 48, 1.2, 6.8, 0.5, P, 12),
	"hi",
	true,
);

// A phone parked beside the laptop: precise shell seams, buttons, glass and speaker, no active screen.
makePart("phone.case", "phone", slabOf(PHONE, 3.1, 2.8, P, 8, 0.7), "lo");
makePart(
	"phone.frame",
	"phone",
	slabOf(
		{ ...PHONE, x: PHONE.x + 1.5, y: PHONE.y + 1.5, w: 25, d: 45, r: 3 },
		5.91,
		0.3,
		P,
		8,
	),
	"mid",
);
makePart(
	"phone.glass",
	"phone",
	slabOf(
		{ ...PHONE, x: PHONE.x + 2.5, y: PHONE.y + 3, w: 23, d: 39, r: 2.8 },
		6.22,
		0.12,
		P,
		8,
	),
	"faint",
	true,
);
addLine(
	"phone.speaker",
	"phone",
	lineOnTop([-80, 24], [-73, 24], 6.35, P),
	"lo",
);
for (const [index, y] of [27, 31, 35].entries()) {
	addLine(
		`phone.activity.${index}`,
		"phone",
		lineOnTop([-81, y], [-75, y], 6.36, P),
		"faint",
	);
}
for (const [index, y] of [30, 41].entries()) {
	makePart(
		`phone.button.${index}`,
		"phone",
		slabOf({ x: -91.5, y, w: 1.5, d: 4, r: 0.7 }, 4.5, 1.5, P, 4),
		"mid",
	);
}
addLine("phone.home", "phone", lineOnTop([-78, 62], [-74, 62], 6.35, P), "lo");
addLine(
	"phone.unsupported.0",
	"phone",
	lineOnTop([-79, 43], [-73, 49], 6.36, P),
	"lo",
);
addLine(
	"phone.unsupported.1",
	"phone",
	lineOnTop([-73, 43], [-79, 49], 6.36, P),
	"lo",
);

export const MOBILE_GATE_GEOMETRY = {
	width: WIDTH,
	height: HEIGHT,
	halo: slabOf(DESK, 0, 3, P, 8).fill,
	target: planOutline(LAPTOP, 8.15, P),
	parts,
	lines,
};
