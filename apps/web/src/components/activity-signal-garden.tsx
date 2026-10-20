import { activityMetricsPrompt, chatGptPromptUrl } from "@tabot/shared";
import { Check, Clock3, Flag, GitBranch, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { AskChatGpt } from "~/components/context-graph/assistant-cta";
import type { ActivityFlow } from "~/lib/activity-flow-data";
import { buildSignalGarden } from "~/lib/activity-signal-garden";
import { formatDuration } from "~/lib/home-data";

type Point = { x: number; y: number };

const placeTime = (timestamp: number) =>
	new Date(timestamp).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});

export const ActivitySignalGarden = ({
	flow,
	periodLabel,
	assistantConnected,
}: {
	flow: ActivityFlow;
	periodLabel: string;
	assistantConnected: boolean;
}) => {
	const garden = useMemo(() => buildSignalGarden(flow), [flow]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [explored, setExplored] = useState(false);
	const selected =
		garden.sites.find((site) => site.id === selectedId) ?? garden.sites[0];
	const selectedLinks = garden.transitions.filter(
		(link) => link.source === selected?.id || link.target === selected?.id,
	);
	const sitePoints = new Map(
		garden.sites.map((site, index) => [
			site.id,
			{
				x: 165,
				y:
					84 +
					(garden.sites.length <= 1
						? 0
						: (index * 400) / (garden.sites.length - 1)),
			},
		]),
	);
	const activityPoints = new Map(
		garden.transitions.map((link, index) => [
			link,
			{
				x: 500,
				y:
					76 +
					(garden.transitions.length <= 1
						? 0
						: (index * 416) / (garden.transitions.length - 1)),
			},
		]),
	);
	const timePoints = new Map(
		garden.times.map((time, index) => [
			time.id,
			{ x: 835, y: 110 + index * (garden.times.length <= 1 ? 0 : 165) },
		]),
	);
	const activityId = (source: string, target: string) =>
		`activity:${source}:${target}`;
	const paths = garden.transitions.flatMap((link) => {
		const source = sitePoints.get(link.source);
		const target = sitePoints.get(link.target);
		const activity = activityPoints.get(link);
		const timeId =
			garden.times.find((time) => time.id === link.timeId)?.id ?? "earlier";
		const time = timePoints.get(timeId);
		if (!source || !target || !activity || !time) return [];
		return [
			{
				id: `source:${activityId(link.source, link.target)}`,
				from: source,
				to: activity,
			},
			{
				id: `target:${activityId(link.source, link.target)}`,
				from: target,
				to: activity,
			},
			{
				id: `time:${activityId(link.source, link.target)}`,
				from: activity,
				to: time,
			},
		];
	});
	const nodePosition = (point: Point) => ({
		left: `${point.x / 10}%`,
		top: `${point.y / 6}%`,
	});

	return (
		<div className="garden">
			<div className="garden-assistant">
				<AskChatGpt
					href={chatGptPromptUrl(
						activityMetricsPrompt(flow.from, flow.to, selected?.id),
					)}
					connected={assistantConnected}
				/>
			</div>
			<section
				className="garden-map"
				aria-label="Websites, connections, and time"
			>
				<div className="garden-map-heading">
					<span>
						<span className="garden-dot" />
						Websites <span aria-hidden="true">→</span> activities{" "}
						<span aria-hidden="true">→</span> time
					</span>
					<span>{periodLabel}</span>
				</div>
				<section
					className="garden-scroll"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Scroll region needs keyboard scrolling.
					tabIndex={0}
					aria-label="Scrollable connection map. Choose a website or an activity to inspect its details."
				>
					<div className="garden-space">
						<svg
							className="garden-lines"
							viewBox="0 0 1000 600"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							{paths.map(({ id, from, to }) => (
								<path
									key={id}
									d={`M${from.x},${from.y} C${(from.x + to.x) / 2},${from.y} ${(from.x + to.x) / 2},${to.y} ${to.x},${to.y}`}
									className="garden-line"
								/>
							))}
						</svg>
						<div
							className="garden-column garden-column-sites"
							aria-hidden="true"
						>
							Websites
						</div>
						<div
							className="garden-column garden-column-activities"
							aria-hidden="true"
						>
							Activities
						</div>
						<div
							className="garden-column garden-column-times"
							aria-hidden="true"
						>
							When
						</div>
						{garden.sites.map((site) => {
							const point = sitePoints.get(site.id);
							if (!point) return null;
							return (
								<button
									key={site.id}
									type="button"
									className={`garden-node garden-site${selected?.id === site.id ? " garden-selected" : ""}`}
									style={nodePosition(point)}
									aria-pressed={selected?.id === site.id}
									onClick={() => setSelectedId(site.id)}
								>
									<span className="garden-mark">{site.label.slice(0, 2)}</span>
									<span>{site.label}</span>
								</button>
							);
						})}
						{garden.transitions.map((link) => {
							const point = activityPoints.get(link);
							if (!point) return null;
							return (
								<button
									key={activityId(link.source, link.target)}
									type="button"
									className={`garden-node garden-activity${selectedLinks.includes(link) ? " garden-selected" : ""}`}
									style={nodePosition(point)}
									aria-pressed={selectedLinks.includes(link)}
									aria-label={`${link.label}, last seen ${placeTime(link.lastAt)}`}
									onClick={() => {
										setSelectedId(link.target);
										setExplored(true);
									}}
								>
									<span className="garden-mark">
										<GitBranch size={18} aria-hidden="true" />
									</span>
									<span>{link.label}</span>
								</button>
							);
						})}
						{garden.times.map((time) => {
							const point = timePoints.get(time.id);
							if (!point) return null;
							return (
								<div
									key={time.id}
									className="garden-node garden-time"
									style={nodePosition(point)}
								>
									<span className="garden-mark">
										<Clock3 size={18} aria-hidden="true" />
									</span>
									<span>{time.label}</span>
								</div>
							);
						})}
						{garden.transitions.length === 0 && (
							<p className="garden-map-empty">
								Connections will appear as Tabot notices websites you move
								between.
							</p>
						)}
					</div>
				</section>
				<div className="garden-map-footer">
					<span>
						<span className="garden-line-key" />
						Observed connection
					</span>
					<span>
						<span className="garden-ring-key" />
						Selected
					</span>
					<span>{garden.sites.length} websites shown</span>
				</div>
			</section>

			<section className="garden-quest" aria-live="polite">
				{explored ? (
					<Check size={20} aria-hidden="true" />
				) : (
					<Flag size={20} aria-hidden="true" />
				)}
				<div>
					<h2>{explored ? "Thread followed." : "Follow a familiar thread."}</h2>
					<p>
						{explored
							? "You traced an observed connection. Choose another to keep exploring."
							: "Select a connected activity to follow its path across websites and time."}
					</p>
				</div>
			</section>

			<section className="garden-evidence" aria-label="Activity details">
				<div className="garden-place-list">
					<h2>
						<MapPin size={18} aria-hidden="true" /> Websites in this period
					</h2>
					{garden.sites.length ? (
						<ul>
							{garden.sites.map((site) => (
								<li key={site.id}>
									<button
										type="button"
										aria-pressed={selected?.id === site.id}
										onClick={() => setSelectedId(site.id)}
									>
										<span>{site.label}</span>
										<time dateTime={new Date(site.lastSeen).toISOString()}>
											{placeTime(site.lastSeen)}
										</time>
									</button>
								</li>
							))}
						</ul>
					) : (
						<p>No websites in this period.</p>
					)}
				</div>
				{selected ? (
					<article className="garden-detail" aria-live="polite">
						<span className="garden-detail-mark">
							{selected.label.slice(0, 2)}
						</span>
						<h2>{selected.label}</h2>
						<p className="garden-origin">{new URL(selected.id).host}</p>
						<dl>
							<div>
								<dt>Last seen</dt>
								<dd>{placeTime(selected.lastSeen)}</dd>
							</div>
							<div>
								<dt>Estimated browsing time</dt>
								<dd>{formatDuration(selected.activeMs)}</dd>
							</div>
						</dl>
						<h3>Connected activity</h3>
						{selectedLinks.length ? (
							<ul>
								{selectedLinks.slice(0, 6).map((link) => (
									<li key={`${link.source}:${link.target}`}>
										<span>{link.label}</span>
										<time dateTime={new Date(link.lastAt).toISOString()}>
											{placeTime(link.lastAt)}
										</time>
									</li>
								))}
							</ul>
						) : (
							<p>No connections in this period.</p>
						)}
					</article>
				) : (
					<article className="garden-detail garden-detail-empty">
						<MapPin size={24} aria-hidden="true" />
						<h2>Your activity map starts here</h2>
						<p>
							Browse normally with Tabot enabled. Websites and connections will
							appear here.
						</p>
					</article>
				)}
			</section>
			<p className="garden-note">
				Browsing time is an estimate from observed website switches, not a
				measure of attention.
			</p>
		</div>
	);
};
