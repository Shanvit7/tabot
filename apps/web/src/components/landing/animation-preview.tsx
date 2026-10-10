import { Pause, Play } from "lucide-react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { ExtensionPreview } from "~/components/landing/activity-illustration";

export interface FilmPlayerProps {
	playing: boolean;
}

export const AnimationPreview = () => {
	const container = useRef<HTMLElement>(null);
	const [visible, setVisible] = useState(false);
	const [motionAllowed, setMotionAllowed] = useState(false);
	const [paused, setPaused] = useState(false);
	const [Film, setFilm] = useState<ComponentType<FilmPlayerProps> | null>(null);
	const [unavailable, setUnavailable] = useState(false);

	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const syncMotion = () =>
			setMotionAllowed(
				!media.matches && document.visibilityState === "visible",
			);
		syncMotion();
		media.addEventListener("change", syncMotion);
		document.addEventListener("visibilitychange", syncMotion);
		const observer =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver((entries) =>
						setVisible(entries.some((entry) => entry.isIntersecting)),
					);
		if (observer && container.current) observer.observe(container.current);
		else setVisible(true);
		return () => {
			observer?.disconnect();
			media.removeEventListener("change", syncMotion);
			document.removeEventListener("visibilitychange", syncMotion);
		};
	}, []);

	useEffect(() => {
		if (!visible || !motionAllowed || Film || unavailable) return;
		let active = true;
		import("~/components/landing/browser-context-film")
			.then((module) => {
				if (active) setFilm(() => module.FilmPlayer);
			})
			.catch(() => {
				if (active) setUnavailable(true);
			});
		return () => {
			active = false;
		};
	}, [visible, motionAllowed, Film, unavailable]);

	const animated = Film !== null && motionAllowed && !unavailable;
	return (
		<figure ref={container} className="mx-auto w-full min-w-0 max-w-[400px]">
			<div className="overflow-hidden border-2 border-black bg-white shadow-hard">
				<div aria-hidden="true" className="aspect-2/3">
					{animated && Film ? (
						<Film playing={visible && !paused} />
					) : (
						<ExtensionPreview />
					)}
				</div>
			</div>
			<figcaption className="mt-2 flex min-h-11 items-center justify-between gap-3 text-xs leading-5 text-landing-muted">
				<span>Extension preview · Sample sites</span>
				{animated && (
					<button
						type="button"
						onClick={() => setPaused((value) => !value)}
						aria-pressed={paused}
						aria-label={
							paused ? "Play extension preview" : "Pause extension preview"
						}
						className="flex size-11 shrink-0 items-center justify-center hover:bg-black/5"
					>
						{paused ? (
							<Play aria-hidden="true" className="size-4" />
						) : (
							<Pause aria-hidden="true" className="size-4" />
						)}
					</button>
				)}
			</figcaption>
		</figure>
	);
};
