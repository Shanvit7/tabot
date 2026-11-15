import { field } from "ascii.rest/kit";

const curveStarts = [0.33, 0.42, 0.51, 0.6, 0.69, 0.78, 0.87];

// Each narrow edge gets its own field; no drawing can spill into the search column.
export const homeAmbient = field(
	{
		name: "falling lime contours",
		cols: 120,
		rows: 120,
		cell: 2,
		aspect: false,
		fps: 12,
		period: 48,
		ramp: " ·•●",
		invert: false,
		dither: true,
		colors: ["#bfff00", "#bfff00", "#bfff00"],
	},
	(_x, _y, _t, at) => {
		const { u, v } = at;
		if (v < curveStarts[0]) return null;
		const phase = at.phase * Math.PI * 2;
		const progressAt = (start: number) =>
			Math.max(0, (v - start) / (1 - start));
		const edge = curveStarts.reduce((furthest, start) => {
			const progress = progressAt(start);
			const reach = 0.84 - (start - 0.33) * 0.55;
			const center =
				0.12 +
				reach * progress ** 1.55 +
				0.025 * Math.sin(v * 13 - phase * 2 + start * 15) * progress;
			return Math.max(furthest, center);
		}, 0);
		const lines = curveStarts.reduce((strongest, start) => {
			const progress = progressAt(start);
			const reach = 0.84 - (start - 0.33) * 0.55;
			const center =
				0.12 +
				reach * progress ** 1.55 +
				0.025 * Math.sin(v * 13 - phase * 2 + start * 15) * progress;
			const ink = Math.exp(-(((u - center) / 0.018) ** 2) * 1.5);
			return Math.max(strongest, ink);
		}, 0);
		const fill = u < edge ? 0.2 * (1 - (u / edge) ** 3) : 0;
		const shimmer = 0.9 + 0.1 * Math.sin(v * 25 - phase * 2 + u * 8);
		return Math.min(1, fill + lines * 0.8) * shimmer;
	},
);
