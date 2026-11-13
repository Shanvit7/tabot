import { writeFileSync } from "node:fs";
import * as A from "../../../.agents/skills/anatomy/kit/audit.mjs";
import * as k from "../../../.agents/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../../.agents/skills/anatomy/kit/lathe.mjs";

// Figure: a Chrome profile sits in a test cradle while a sensor carriage scans it.
const width = 600;
const height = 440;
const base = { x: -55, y: -36, w: 110, d: 72, r: 10 };
const points = [...k.boxCorners(base, -9, 0), [-1, 0, 39], [0, 0, 0]];
const projection = k.fitProjection(points, width, height, {
	pad: 48,
	azimuth: 40,
	elevation: 30,
});
const recorder = A.recorder(projection);
const parts = new Map();
const add = (name, at, paths, shape, material = "metal", tone = "mid") => {
	parts.set(name, {
		name,
		paths,
		material,
		tone,
		motion: name.startsWith("carriage."),
	});
	recorder.put({
		name,
		at,
		svg: k.solidSvg(paths, { tone }),
		shapes: [
			recorder.solid({ ...shape, name, ground: name.startsWith("foot.") }),
		],
	});
};
const slab = (name, plan, z, thickness, material = "metal", tone = "mid") =>
	add(
		name,
		[plan.x + plan.w / 2, plan.y + plan.d / 2, z + thickness / 2],
		k.slabOf(plan, z, thickness, projection, 8, Math.min(0.8, thickness / 4)),
		A.slab(plan, z, thickness),
		material,
		tone,
	);
const disc = (
	name,
	x,
	y,
	radius,
	z,
	thickness,
	material = "metal",
	tone = "mid",
) => {
	const frame = G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
	add(
		name,
		[x, y, z + thickness / 2],
		G.disc(z, z + thickness, radius, frame, projection),
		A.disc(frame, z, z + thickness, radius),
		material,
		tone,
	);
};

for (const [index, [x, y]] of k.corners(base, 12).entries())
	disc(`foot.${index}`, x, y, 4.5, -9, 3, "metal", "lo");
slab("base.plinth", base, -6, 5, "metal", "lo");
slab("base.deck", k.insetPlan(base, 2), -1, 1, "paper", "lo");
for (const [index, [x, y]] of k.corners(base, 7).entries())
	disc(`base.fastener.${index}`, x, y, 1.5, 0, 0.7, "metal", "lo");

// Four uprights carry two guide rails above the profile card.
for (const [index, [x, y]] of [
	[-25, -25],
	[22, -25],
	[-25, 25],
	[22, 25],
].entries())
	slab(
		`frame.post.${index}`,
		{ x, y, w: 3, d: 3, r: 0.6 },
		0,
		23,
		"metal",
		"lo",
	);
slab("rail.left", { x: -26, y: -27, w: 4, d: 54, r: 1 }, 23, 2, "metal", "mid");
slab("rail.right", { x: 21, y: -27, w: 4, d: 54, r: 1 }, 23, 2, "metal", "mid");
for (const [rail, x] of [
	["left", -24],
	["right", 23],
]) {
	for (const [index, y] of [-21, -7, 7, 21].entries())
		disc(`rail.${rail}.index.${index}`, x, y, 0.65, 25, 0.4, "paper", "lo");
}

// A slotted tray holds the active Chrome profile token.
slab(
	"profile.tray",
	{ x: -19, y: -19, w: 38, d: 38, r: 3 },
	0,
	2,
	"metal",
	"lo",
);
slab(
	"profile.token",
	{ x: -16, y: -16, w: 32, d: 32, r: 2 },
	2,
	0.8,
	"paper",
	"hi",
);
disc("profile.ring", 0, 0, 12, 2.8, 0.8, "metal", "mid");
disc("profile.chrome", 0, 0, 11.5, 3.6, 0.4, "paper", "hi");
for (const [index, [x, y]] of [
	[-14, -14],
	[14, -14],
	[-14, 14],
	[14, 14],
].entries())
	disc(`profile.pin.${index}`, x, y, 0.85, 2.8, 0.5, "metal", "lo");

// Moving sensor carriage: travels the rails over the profile token.
slab(
	"carriage.bridge",
	{ x: -26, y: -2, w: 51, d: 4, r: 1 },
	25,
	2,
	"metal",
	"mid",
);
slab(
	"carriage.sensor",
	{ x: -5, y: -4, w: 10, d: 8, r: 1.5 },
	27,
	7,
	"metal",
	"hi",
);
slab(
	"carriage.window",
	{ x: -3, y: -4.5, w: 6, d: 1.5, r: 0.6 },
	34,
	1,
	"signal",
	"hi",
);
disc("carriage.probe", 0, 0, 1.2, 35, 1, "metal", "hi");
for (const [index, x] of [-22, 21].entries())
	disc(`carriage.roller.${index}`, x, 0, 1.8, 24.5, 1, "metal", "lo");

// Profile-check indicator: three physical lamps, one lit while the scan runs.
slab(
	"status.mount",
	{ x: 33, y: -13, w: 15, d: 27, r: 2 },
	0,
	2,
	"metal",
	"lo",
);
slab(
	"status.panel",
	{ x: 34, y: -11, w: 13, d: 23, r: 1.5 },
	2,
	1.5,
	"paper",
	"hi",
);
for (const [index, y] of [-6, 0, 6].entries()) {
	disc(
		`status.lamp.${index}`,
		40.5,
		y,
		2.1,
		3.5,
		1,
		index === 1 ? "signal" : "metal",
		index === 1 ? "hi" : "lo",
	);
	disc(`status.lamp.cap.${index}`, 40.5, y, 0.75, 4.5, 0.4, "paper", "hi");
}
for (const [index, [x, y]] of [
	[35, -9],
	[46, -9],
	[35, 9],
	[46, 9],
].entries())
	disc(`status.fastener.${index}`, x, y, 0.55, 3.5, 0.4, "metal", "lo");

const settled = A.settle(recorder, projection);
const ordered = [...settled.items]
	.sort((a, b) => a.key - b.key)
	.map((item) => parts.get(item.name));
const lightPath = (points, closed = false) =>
	k.pathOf(
		points.map((point) => k.iso(point, projection)),
		closed,
	);
const geometry = {
	width,
	height,
	chromeLogoTransform: k.topMatrix([-11, -11], 4, projection),
	scanLight: {
		curtain: lightPath(
			[
				[-15, 0, 25],
				[15, 0, 25],
				[17, 0, 3],
				[-17, 0, 3],
			],
			true,
		),
		source: lightPath([
			[-15, 0, 25],
			[15, 0, 25],
		]),
		footprint: lightPath([
			[-17, 0, 3],
			[17, 0, 3],
		]),
		drop: k.iso([0, 0, 3], projection)[1] - k.iso([0, 0, 25], projection)[1],
	},
	halo: k.haloOf(base, -9, 1, projection),
	projection,
	parts: ordered,
};
const destination = new URL(
	"../src/components/features/workspace/profile-check-geometry.ts",
	import.meta.url,
);
writeFileSync(
	destination,
	`// biome-ignore-all format: Generated geometry; edit the generator instead.\n// Generated by scripts/build-profile-check-art.mjs with Anatomy's MIT-licensed kit.\n// Edit the generator, not path coordinates.\nimport type { Projection, SolidPaths, Tone } from "~/components/illustrations/anatomy/kit";\nexport interface ProfileCheckPart {\n\tname: string;\n\tpaths: SolidPaths;\n\ttone: Tone;\n\tmaterial: string;\n\tmotion: boolean;\n}\nexport const PROFILE_CHECK_GEOMETRY: {\n\twidth: number;\n\theight: number;\n\tchromeLogoTransform: string;\n\tscanLight: { curtain: string; source: string; footprint: string; drop: number };\n\tprojection: Projection;\n\thalo: string;\n\tparts: ProfileCheckPart[];\n} = ${JSON.stringify(geometry, null, "\t")};\n`,
);
console.log(
	`Anatomy profile checker: ${ordered.length} solids, ${settled.overlaps.pairs.length} measured overlaps.`,
);
A.auditOrExit(recorder, projection);
