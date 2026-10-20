/* THROWAWAY: three Activities variants, /activities?variant=A|B|C on the isolated preview server.
 * THESIS: turn finding a past trail into exploration, never a productivity score.
 * OWN-WORLD: inherit Quest Board's Plex, green ink, lime and lavender; actual SVG connections, no fake physics.
 * STORY: pick a sample trail, inspect its websites, collect an in-memory trail bookmark.
 * FIRST VIEWPORT: A map + inspector; B winding checkpoints + field journal; C layered network + evidence shelf.
 * FORM: user-pinned graph exploration, three structural prototypes; no production route or live data.
 */
import {
	ArrowLeft,
	ArrowRight,
	Bookmark,
	Check,
	ChevronRight,
	Compass,
	Flag,
	GitBranch,
	House,
	Network,
	Pause,
	Play,
	RotateCcw,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./activities-prototype.css";

type Variant = "A" | "B" | "C";
const variants: Variant[] = ["A", "B", "C"];
const names = { A: "Constellation", B: "Trail Map", C: "Signal Garden" };
const trails = [
	{
		title: "Figma + Are.na",
		time: "Today, 09:12–09:48",
		period: "This morning",
		color: "lilac",
		sites: ["Figma", "Mobbin", "Are.na", "Coolors", "Dribbble", "Notion"],
		hosts: [
			"figma.com",
			"mobbin.com",
			"are.na",
			"coolors.co",
			"dribbble.com",
			"notion.so",
		],
	},
	{
		title: "GitHub + MDN",
		time: "Today, 11:04–11:31",
		period: "Later today",
		color: "lime",
		sites: ["MDN", "GitHub", "Stack Overflow", "npm", "Can I use", "CodePen"],
		hosts: [
			"developer.mozilla.org",
			"github.com",
			"stackoverflow.com",
			"npmjs.com",
			"caniuse.com",
			"codepen.io",
		],
	},
	{
		title: "Maps + Wikipedia",
		time: "Yesterday, 16:20–16:55",
		period: "Yesterday",
		color: "peach",
		sites: [
			"Wikipedia",
			"Google Maps",
			"Atlas Obscura",
			"Booking",
			"Unsplash",
			"Notion",
		],
		hosts: [
			"wikipedia.org",
			"maps.google.com",
			"atlasobscura.com",
			"booking.com",
			"unsplash.com",
			"notion.so",
		],
	},
] as const;
type Trail = (typeof trails)[number];
type Point = { x: number; y: number };
type GraphNode = Point & {
	id: string;
	label: string;
	trail: number;
	site?: number;
	hub?: boolean;
};
const centers = [
	{ x: 245, y: 180 },
	{ x: 755, y: 180 },
	{ x: 500, y: 445 },
];
const checkpoints = [
	{ x: 125, y: 160 },
	{ x: 375, y: 160 },
	{ x: 625, y: 160 },
	{ x: 875, y: 160 },
	{ x: 875, y: 415 },
	{ x: 625, y: 415 },
];

// ponytail: authored, bounded layout (at most 24 nodes); production needs summary-level caps, not event-level nodes.
const graphNodes = (variant: Variant, active: number): GraphNode[] => {
	if (variant === "B")
		return trails[active].sites.map((label, site) => ({
			...checkpoints[site],
			id: `${active}-${site}`,
			label,
			trail: active,
			site,
		}));
	if (variant === "C")
		return [
			...trails[active].sites.map((label, site) => ({
				x: 180,
				y: 75 + site * 86,
				id: `${active}-${site}`,
				label,
				trail: active,
				site,
			})),
			...trails.map((trail, index) => ({
				x: 510,
				y: 135 + index * 165,
				id: `hub-${index}`,
				label: trail.title,
				trail: index,
				hub: true,
			})),
			...trails.map((trail, index) => ({
				x: 840,
				y: 135 + index * 165,
				id: `time-${index}`,
				label: trail.period,
				trail: index,
				hub: true,
			})),
		];
	return trails.flatMap((trail, index) => [
		{
			...centers[index],
			id: `hub-${index}`,
			label: trail.title,
			trail: index,
			hub: true,
		},
		...trail.sites.map((label, site) => {
			const angle = ((site * 60 - 30) * Math.PI) / 180;
			return {
				x: centers[index].x + Math.cos(angle) * 155,
				y: centers[index].y + Math.sin(angle) * 104,
				id: `${index}-${site}`,
				label,
				trail: index,
				site,
			};
		}),
	]);
};

const readVariant = (): Variant => {
	const value = new URLSearchParams(location.search).get("variant");
	return variants.find((variant) => variant === value) ?? "A";
};

const usePrototype = () => {
	const [variant, setVariant] = useState<Variant>(readVariant);
	const [active, setActive] = useState(0);
	const [site, setSite] = useState(0);
	const [explored, setExplored] = useState<Set<number>>(new Set([0]));
	const [saved, setSaved] = useState<Set<number>>(new Set());
	const [motion, setMotion] = useState(true);
	const [visible, setVisible] = useState(!document.hidden);
	const [reduced, setReduced] = useState(
		matchMedia("(prefers-reduced-motion: reduce)").matches,
	);
	const [replay, setReplay] = useState(0);
	const choose = (index: number, nextSite = 0) => {
		setActive(index);
		setSite(nextSite);
		setExplored((previous) => new Set([...previous, index]));
	};
	const switchVariant = useCallback((next: Variant) => {
		const url = new URL(location.href);
		url.searchParams.set("variant", next);
		history.replaceState(null, "", url);
		setVariant(next);
	}, []);
	useEffect(() => {
		const media = matchMedia("(prefers-reduced-motion: reduce)");
		const updateMotion = () => setReduced(media.matches);
		const updateVisibility = () => setVisible(!document.hidden);
		const onPop = () => setVariant(readVariant());
		const onKey = (event: KeyboardEvent) => {
			if (
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				!(event.target instanceof Element) ||
				event.target.closest(
					"input, textarea, select, [contenteditable], .ap-graph",
				)
			)
				return;
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
			event.preventDefault();
			switchVariant(
				variants[
					(variants.indexOf(readVariant()) +
						(event.key === "ArrowRight" ? 1 : 2)) %
						3
				],
			);
		};
		media.addEventListener("change", updateMotion);
		document.addEventListener("visibilitychange", updateVisibility);
		window.addEventListener("popstate", onPop);
		window.addEventListener("keydown", onKey);
		return () => {
			media.removeEventListener("change", updateMotion);
			document.removeEventListener("visibilitychange", updateVisibility);
			window.removeEventListener("popstate", onPop);
			window.removeEventListener("keydown", onKey);
		};
	}, [switchVariant]);
	return {
		variant,
		active,
		site,
		explored,
		saved,
		motion,
		reduced,
		replay,
		animate: motion && visible && !reduced,
		choose,
		switchVariant,
		toggleMotion: () => setMotion((value) => !value),
		trace: () => setReplay((value) => value + 1),
		toggleSaved: () =>
			setSaved((previous) => {
				const next = new Set(previous);
				if (next.has(active)) next.delete(active);
				else next.add(active);
				return next;
			}),
		reset: () => {
			setActive(0);
			setSite(0);
			setExplored(new Set([0]));
			setSaved(new Set());
			setReplay(0);
		},
	};
};
type Model = ReturnType<typeof usePrototype>;

const TrailPicker = ({ model }: { model: Model }) => (
	<nav className="ap-trails" aria-label="Sample activity trails">
		{trails.map((trail, index) => (
			<button
				key={trail.title}
				type="button"
				className={`ap-trail ap-${trail.color}`}
				aria-pressed={model.active === index}
				onClick={() => model.choose(index)}
			>
				<span className="ap-trail-marker">
					{model.explored.has(index) ? (
						<Check size={18} aria-hidden="true" />
					) : (
						<Compass size={18} aria-hidden="true" />
					)}
				</span>
				<span>
					<strong>{trail.title}</strong>
					<small>{trail.time}</small>
				</span>
				<ChevronRight size={18} aria-hidden="true" />
			</button>
		))}
	</nav>
);

const Graph = ({ model }: { model: Model }) => {
	const [zoom, setZoom] = useState(1);
	const nodes = graphNodes(model.variant, model.active);
	const edges: { from: Point; to: Point; active: boolean; id: string }[] =
		model.variant === "B"
			? nodes.slice(1).map((node, index) => ({
					from: nodes[index],
					to: node,
					active: true,
					id: node.id,
				}))
			: nodes
					.filter((node) => node.site !== undefined)
					.map((node) => ({
						from:
							model.variant === "C"
								? { x: 510, y: 135 + model.active * 165 }
								: centers[node.trail],
						to: node,
						active: node.trail === model.active,
						id: node.id,
					}));
	if (model.variant === "C") {
		for (const [index] of trails.entries())
			edges.push({
				from: { x: 510, y: 135 + index * 165 },
				to: { x: 840, y: 135 + index * 165 },
				active: index === model.active,
				id: `time-${index}`,
			});
	}
	return (
		<section
			className="ap-graph"
			aria-label={`${names[model.variant]} interactive activity map`}
			data-motion={model.animate}
		>
			<div className="ap-map-heading">
				<span>
					<span className="ap-dot" />
					{model.variant === "B"
						? "Follow the checkpoints"
						: model.variant === "C"
							? "Websites → activities → time"
							: "Your activity, connected"}
				</span>
				<span>Sample map</span>
			</div>
			<section
				className="ap-map-scroll"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Map scroll area needs keyboard scrolling.
				tabIndex={0}
				aria-label="Scrollable activity map. Select a website, or use the website list below."
			>
				<div className="ap-map-space" style={{ width: `${zoom * 100}%` }}>
					<svg
						className="ap-connections"
						viewBox="0 0 1000 600"
						preserveAspectRatio="none"
						aria-hidden="true"
						key={`${model.variant}-${model.active}-${model.replay}`}
					>
						{model.variant === "A" &&
							centers.map((center, index) => (
								<ellipse
									key={trails[index].title}
									cx={center.x}
									cy={center.y}
									rx="202"
									ry="145"
									className={`ap-orbit ap-${trails[index].color}`}
								/>
							))}
						{edges.map((edge) => {
							const path =
								model.variant === "C"
									? `M${edge.from.x},${edge.from.y} C${(edge.from.x + edge.to.x) / 2},${edge.from.y} ${(edge.from.x + edge.to.x) / 2},${edge.to.y} ${edge.to.x},${edge.to.y}`
									: `M${edge.from.x},${edge.from.y} L${edge.to.x},${edge.to.y}`;
							return (
								<g key={edge.id}>
									<path
										d={path}
										className={
											edge.active ? "ap-edge ap-edge-active" : "ap-edge"
										}
									/>
									{edge.active && model.replay > 0 && (
										<path d={path} pathLength="1" className="ap-tracer" />
									)}
								</g>
							);
						})}
						{model.variant === "B" && (
							<text x="125" y="415" className="ap-map-note">
								A little detour. A way back.
							</text>
						)}
					</svg>
					{nodes.map((node) => {
						const selected =
							node.trail === model.active &&
							(node.hub || node.site === model.site);
						return (
							<button
								key={node.id}
								type="button"
								className={`ap-node ap-${trails[node.trail].color}${node.hub ? " ap-hub" : ""}${selected ? " ap-node-selected" : ""}`}
								style={{ left: `${node.x / 10}%`, top: `${node.y / 6}%` }}
								aria-label={`${node.label}, ${trails[node.trail].title}`}
								aria-pressed={selected}
								onClick={() => model.choose(node.trail, node.site ?? 0)}
							>
								<span className="ap-node-disc">
									{node.hub ? (
										<GitBranch size={24} aria-hidden="true" />
									) : model.variant === "B" ? (
										<span>{(node.site ?? 0) + 1}</span>
									) : (
										<span>{node.label.slice(0, 2)}</span>
									)}
								</span>
								<span className="ap-node-label">{node.label}</span>
							</button>
						);
					})}
				</div>
			</section>
			<div className="ap-map-footer">
				<span>
					<span className="ap-line-key" />
					{model.variant === "B"
						? "Sample browsing order"
						: "Belongs to activity"}{" "}
					<span className="ap-outline-key" />
					Selected
				</span>
				<div className="ap-zoom">
					<button
						type="button"
						aria-label="Zoom out"
						disabled={zoom === 1}
						onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
					>
						−
					</button>
					<button
						type="button"
						aria-label="Reset map zoom"
						onClick={() => setZoom(1)}
					>
						{Math.round(zoom * 100)}%
					</button>
					<button
						type="button"
						aria-label="Zoom in"
						disabled={zoom === 1.75}
						onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}
					>
						+
					</button>
				</div>
			</div>
		</section>
	);
};

const Inspector = ({ model }: { model: Model }) => {
	const trail: Trail = trails[model.active];
	return (
		<section className="ap-inspector" aria-labelledby="ap-detail-title">
			<div className="ap-detail-top">
				<span className={`ap-site-mark ap-${trail.color}`}>
					{trail.sites[model.site].slice(0, 2)}
				</span>
				<span className="ap-tag">Sample website</span>
			</div>
			<h2 id="ap-detail-title">{trail.sites[model.site]}</h2>
			<p className="ap-host">{trail.hosts[model.site]}</p>
			<dl>
				<div>
					<dt>In this activity</dt>
					<dd>{trail.title}</dd>
				</div>
				<div>
					<dt>Seen</dt>
					<dd>{trail.time}</dd>
				</div>
			</dl>
			<h3>Take the trail back</h3>
			<ol
				className="ap-site-list"
				aria-label="Websites in selected sample activity"
			>
				{trail.sites.map((site, index) => (
					<li key={site}>
						<button
							type="button"
							aria-pressed={index === model.site}
							onClick={() => model.choose(model.active, index)}
						>
							<span>{index + 1}</span>
							{site}
							{index === model.site && <Check size={15} aria-hidden="true" />}
						</button>
					</li>
				))}
			</ol>
			<button
				type="button"
				className="ap-primary"
				aria-pressed={model.saved.has(model.active)}
				onClick={model.toggleSaved}
			>
				<Bookmark size={17} aria-hidden="true" />
				{model.saved.has(model.active)
					? "Trail kept · undo"
					: "Keep this trail"}
			</button>
			<p className="ap-memory-note">
				Preview only. Nothing saved to your browser history.
			</p>
		</section>
	);
};
const Quest = ({ model }: { model: Model }) => (
	<section className="ap-quest" aria-labelledby="ap-quest-title">
		<Flag size={22} aria-hidden="true" />
		<div>
			<h2 id="ap-quest-title">
				{model.explored.size === 3
					? "All trails uncovered."
					: "Follow a familiar thread."}
			</h2>
			<p>
				{model.explored.size === 3
					? "You explored every sample. Keep a trail for an easy way back."
					: "Open each sample activity to uncover its little corner of the map."}
			</p>
			<div className="ap-quest-progress">
				{trails.map((trail, index) => (
					<span key={trail.title} data-done={model.explored.has(index)}>
						{model.explored.has(index) ? (
							<Check size={14} aria-hidden="true" />
						) : (
							index + 1
						)}
					</span>
				))}
				<span>{model.explored.size}/3 explored</span>
			</div>
		</div>
	</section>
);

const VariantA = ({ model }: { model: Model }) => (
	<div className="ap-constellation">
		<div className="ap-map-column">
			<TrailPicker model={model} />
			<Graph model={model} />
			<Quest model={model} />
		</div>
		<Inspector model={model} />
	</div>
);
const VariantB = ({ model }: { model: Model }) => (
	<div className="ap-expedition">
		<aside className="ap-journal">
			<h2>Your field journal</h2>
			<p>
				A few places you passed through. Pick a trail and follow its
				checkpoints.
			</p>
			<TrailPicker model={model} />
			<Quest model={model} />
		</aside>
		<div className="ap-expedition-main">
			<Graph model={model} />
			<Inspector model={model} />
		</div>
	</div>
);
const VariantC = ({ model }: { model: Model }) => (
	<div className="ap-garden">
		<TrailPicker model={model} />
		<Graph model={model} />
		<div className="ap-evidence-shelf">
			<Quest model={model} />
			<Inspector model={model} />
		</div>
	</div>
);

const App = () => {
	const model = usePrototype();
	const copy = {
		A: [
			"Find your way through.",
			"Every little trail has a way back. Pick a cluster. Follow a connection.",
		],
		B: [
			"Take the scenic route.",
			"A checkpoint map of places you passed through. No finish line to chase.",
		],
		C: [
			"See the threads between.",
			"A neural-network-inspired view of websites, activities and when they happened.",
		],
	};
	return (
		<div className={`ap-app ap-variant-${model.variant}`}>
			<a href="#ap-main" className="ap-skip">
				Skip to activity playground
			</a>
			<header className="ap-header">
				<a className="ap-brand" href="/activities?variant=A">
					<img className="ap-logo" src="/logo.png" alt="" />
					Tabot
				</a>
				<nav aria-label="Preview navigation">
					<span>
						<House size={16} aria-hidden="true" />
						Home
					</span>
					<strong aria-current="page">
						<Network size={16} aria-hidden="true" />
						Activities
					</strong>
					<span>Recurring patterns</span>
				</nav>
				<span className="ap-preview-badge">Prototype · sample data</span>
			</header>
			<main id="ap-main">
				<div className="ap-title-row">
					<div>
						<h1>{copy[model.variant][0]}</h1>
						<p>{copy[model.variant][1]}</p>
					</div>
					<div className="ap-toolbar">
						<button type="button" onClick={model.trace}>
							<Play size={16} aria-hidden="true" />
							Trace trail
						</button>
						<button
							type="button"
							onClick={model.toggleMotion}
							aria-pressed={model.motion}
							disabled={model.reduced}
						>
							{model.motion && !model.reduced ? (
								<Pause size={16} aria-hidden="true" />
							) : (
								<Play size={16} aria-hidden="true" />
							)}
							{model.reduced
								? "Reduced motion"
								: model.motion
									? "Motion on"
									: "Motion off"}
						</button>
					</div>
				</div>
				{model.variant === "A" ? (
					<VariantA model={model} />
				) : model.variant === "B" ? (
					<VariantB model={model} />
				) : (
					<VariantC model={model} />
				)}
				<footer className="ap-prototype-state">
					<p>
						<Sparkles size={16} aria-hidden="true" />
						Imaginary trails. Real interactions. No data connection.
					</p>
					<details>
						<summary>Preview state</summary>
						<output>
							{JSON.stringify({
								variant: model.variant,
								trail: trails[model.active].title,
								website: trails[model.active].hosts[model.site],
								explored: [...model.explored],
								kept: [...model.saved],
								motion: model.animate,
								nodes: graphNodes(model.variant, model.active).length,
							})}
						</output>
					</details>
					<button type="button" onClick={model.reset}>
						<RotateCcw size={15} aria-hidden="true" />
						Reset sample
					</button>
				</footer>
			</main>
			{process.env.NODE_ENV !== "production" && (
				<nav className="ap-switcher" aria-label="Prototype variants">
					<button
						type="button"
						aria-label="Previous design"
						onClick={() =>
							model.switchVariant(
								variants[(variants.indexOf(model.variant) + 2) % 3],
							)
						}
					>
						<ArrowLeft size={18} aria-hidden="true" />
					</button>
					<div>
						<small>ACTIVITIES PLAYGROUND</small>
						<strong>
							{model.variant} — {names[model.variant]}
						</strong>
					</div>
					{variants.map((variant) => (
						<button
							type="button"
							key={variant}
							aria-label={`Design ${variant}: ${names[variant]}`}
							aria-pressed={model.variant === variant}
							onClick={() => model.switchVariant(variant)}
						>
							{variant}
						</button>
					))}
					<button
						type="button"
						aria-label="Next design"
						onClick={() =>
							model.switchVariant(
								variants[(variants.indexOf(model.variant) + 1) % 3],
							)
						}
					>
						<ArrowRight size={18} aria-hidden="true" />
					</button>
				</nav>
			)}
		</div>
	);
};

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
