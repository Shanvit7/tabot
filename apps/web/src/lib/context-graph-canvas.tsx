import type { ForceGraphMethods } from "react-force-graph-2d";
import ForceGraph2D from "react-force-graph-2d";
import { faviconImage, type GraphNode } from "~/lib/context-graph-data";

const INK = "#e8f3e8";
const SITE = "#6f9c81";
const PATTERN = "#bfff00";
const LABEL = "#a9c6b1";
const LINK = "110,170,135";

const RADIUS = { context: 7, memory: 5.5, site: 3.5 } as const;
// A site showing its real favicon needs enough pixels to be recognisable.
const SITE_ICON_RADIUS = 6;
const radiusOf = (node: GraphNode) =>
	node.kind === "site" && node.favicon ? SITE_ICON_RADIUS : RADIUS[node.kind];
const rgba = (hex: string, alpha: number) => {
	const n = hex.replace("#", "");
	const [r, g, b] = [0, 2, 4].map((i) =>
		Number.parseInt(n.slice(i, i + 2), 16),
	);
	return `rgba(${r},${g},${b},${alpha})`;
};
const nodeColor = (node: GraphNode) =>
	node.kind === "context" ? INK : node.kind === "memory" ? PATTERN : SITE;

export type PositionedNode = GraphNode & {
	x: number;
	y: number;
	fx?: number;
	fy?: number;
};
export type PositionedLink = {
	source: PositionedNode;
	target: PositionedNode;
	kind: "observed" | "pattern";
};

const dragHint = (hovering: boolean) =>
	hovering ? "Click to open it" : "Drag to explore · scroll to zoom";

// Dark canvas, hand-painted: soft halos, lime pulse on patterns, labels that
// only appear where they can be read.
export const GraphCanvas = ({
	fgRef,
	width,
	data,
	dense,
	hits,
	focus,
	presence,
	selectedRef,
	hoverRef,
	hovering,
	onHover,
	onSelect,
}: {
	fgRef: React.RefObject<
		ForceGraphMethods<PositionedNode, PositionedLink> | undefined
	>;
	width: number;
	data: { nodes: PositionedNode[]; links: PositionedLink[] };
	dense: boolean;
	hits: Set<string> | null;
	focus: Set<string> | null;
	presence: React.RefObject<Map<string, number>>;
	selectedRef: React.RefObject<string | null>;
	hoverRef: React.RefObject<string | null>;
	hovering: boolean;
	onHover: (id: string | null) => void;
	onSelect: (id: string | null) => void;
}) => {
	const paintNode = (
		node: PositionedNode,
		ctx: CanvasRenderingContext2D,
		scale: number,
	) => {
		if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
		const active = node.id === selectedRef.current;
		const hovered = node.id === hoverRef.current;
		const target = hits ? (hits.has(node.id) ? 1 : 0) : 1;
		const eased = presence.current.get(node.id) ?? target;
		const shownPresence = eased + (target - eased) * 0.14;
		presence.current.set(node.id, shownPresence);
		const r = radiusOf(node) * (0.55 + 0.45 * shownPresence);
		const color = nodeColor(node);
		const found = !hits || hits.has(node.id);
		const lit = (!focus || focus.has(node.id)) && found;
		const now = performance.now();
		const pulse =
			node.kind === "memory" ? 0.72 + 0.28 * Math.sin(now / 620) : 1;
		const halo =
			r *
			(active ? 6.5 : hovered ? 5.5 : dense ? 2.6 : 4) *
			(0.5 + 0.5 * shownPresence);
		const haloAlpha =
			(lit ? (active ? 0.5 : hovered ? 0.38 : 0.2) : 0.05) *
			shownPresence *
			pulse;

		const glow = ctx.createRadialGradient(
			node.x,
			node.y,
			r * 0.5,
			node.x,
			node.y,
			halo,
		);
		glow.addColorStop(0, rgba(color, haloAlpha));
		glow.addColorStop(1, rgba(color, 0));
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(node.x, node.y, halo, 0, Math.PI * 2);
		ctx.fill();

		const icon =
			node.kind === "site" && lit ? faviconImage(node.favicon) : null;
		if (icon) {
			ctx.save();
			ctx.beginPath();
			ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
			ctx.fillStyle = "#0b1310";
			ctx.fill();
			if (typeof ctx.roundRect === "function") {
				ctx.beginPath();
				ctx.roundRect(node.x - r, node.y - r, r * 2, r * 2, r * 0.4);
				ctx.clip();
			}
			ctx.drawImage(icon, node.x - r, node.y - r, r * 2, r * 2);
			ctx.restore();
		} else {
			ctx.beginPath();
			ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
			ctx.fillStyle = lit ? rgba(color, pulse) : rgba(color, 0.2);
			ctx.fill();
			if (node.kind !== "site") {
				ctx.lineWidth = 1.5 / scale;
				ctx.strokeStyle = "rgba(11,19,16,0.85)";
				ctx.stroke();
			}
		}

		if (active) {
			ctx.save();
			ctx.setLineDash([3.5 / scale, 3.5 / scale]);
			ctx.lineDashOffset = -((now / 45) % (7 / scale));
			ctx.strokeStyle = PATTERN;
			ctx.lineWidth = 1.6 / scale;
			ctx.beginPath();
			ctx.arc(node.x, node.y, r + 6 / scale, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}

		const labelled =
			(node.kind !== "site" && (!dense || hovered || active)) ||
			hovered ||
			active ||
			(hits?.has(node.id) ?? false);
		if (!labelled) return;
		ctx.font = `${(active || hovered ? 12 : 10.5) / scale}px ui-sans-serif, system-ui, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		ctx.fillStyle = rgba(LABEL, lit ? 0.95 : 0.3);
		ctx.fillText(node.label, node.x, node.y - r - 6 / scale);
	};

	return (
		<>
			<ForceGraph2D<PositionedNode, PositionedLink>
				ref={fgRef}
				width={width}
				height={440}
				graphData={data}
				backgroundColor="rgba(0,0,0,0)"
				nodeRelSize={4}
				nodeVal={(node) => (Math.PI * radiusOf(node) ** 2) / 4}
				nodeCanvasObject={paintNode}
				nodePointerAreaPaint={(node, color, ctx, scale) => {
					if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
					ctx.fillStyle = color;
					ctx.beginPath();
					ctx.arc(node.x, node.y, radiusOf(node) + 10 / scale, 0, Math.PI * 2);
					ctx.fill();
				}}
				nodeLabel={() => ""}
				linkColor={(link) =>
					focus && !focus.has(link.source.id) && !focus.has(link.target.id)
						? `rgba(${LINK},0.08)`
						: link.kind === "pattern"
							? `rgba(${LINK},0.5)`
							: `rgba(${LINK},${dense ? 0.14 : 0.3})`
				}
				linkWidth={(link) => (link.kind === "pattern" ? 1.3 : 1)}
				linkDirectionalParticles={(link) =>
					link.kind === "pattern" ? 3 : dense ? 0 : 1
				}
				linkDirectionalParticleWidth={(link) =>
					link.kind === "pattern" ? 2 : 1.5
				}
				linkDirectionalParticleSpeed={(link) =>
					link.kind === "pattern" ? 0.008 : 0.004
				}
				linkDirectionalParticleColor={(link) =>
					link.kind === "pattern" ? PATTERN : rgba(SITE, 0.9)
				}
				// Keeps the engine ticking (alpha never dips below alphaMin) so the
				// pulse and selection ring keep animating after the layout settles.
				// Dense maps are allowed to cool down instead of burning CPU forever.
				d3AlphaMin={0}
				d3AlphaDecay={0.06}
				d3VelocityDecay={0.5}
				// force-graph stops repainting once the simulation cools (cooldownTime
				// default 15s). Without this, an icon that finishes loading after that
				// point is never drawn — the canvas just shows its last frame.
				autoPauseRedraw={false}
				onNodeHover={(node) => onHover(node?.id ?? null)}
				onNodeClick={(node) => onSelect(node.id)}
				onBackgroundClick={() => onSelect(null)}
			/>
			<p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-[#6f8f78]">
				{hits
					? `${hits.size} match${hits.size === 1 ? "" : "es"} · ${dragHint(hovering)}`
					: dragHint(hovering)}
			</p>
		</>
	);
};
