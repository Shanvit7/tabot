import { type ReactNode, useEffect, useRef } from "react";
import { VoidArt } from "~/components/features/landing/void-art";

export const HeroScene = ({
	children,
	actions,
}: {
	children: ReactNode;
	actions: ReactNode;
}) => {
	const stage = useRef<HTMLDivElement>(null);
	const visible = useRef(false);
	useEffect(() => {
		const node = stage.current;
		if (!node) return;
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => {
			node.dataset.motion =
				visible.current && !document.hidden && !reduced.matches
					? "running"
					: "paused";
		};
		const observer = new IntersectionObserver((entries) => {
			visible.current = entries[entries.length - 1].isIntersecting;
			sync();
		});
		observer.observe(node);
		document.addEventListener("visibilitychange", sync);
		reduced.addEventListener("change", sync);
		sync();
		return () => {
			observer.disconnect();
			document.removeEventListener("visibilitychange", sync);
			reduced.removeEventListener("change", sync);
		};
	}, []);
	return (
		<div
			ref={stage}
			className="landing-hero-scene void-hero"
			data-motion="paused"
		>
			<VoidArt />
			<div className="void-copy">{children}</div>
			<div className="void-actions">{actions}</div>
		</div>
	);
};
