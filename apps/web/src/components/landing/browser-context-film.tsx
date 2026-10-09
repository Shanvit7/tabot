import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState } from "react";
import { ExtensionPreview } from "~/components/landing/activity-illustration";
import type { FilmPlayerProps } from "~/components/landing/animation-preview";
import { BrowserContextFilm } from "~/components/landing/browser-context-scene";

export const FilmPlayer = ({ playing }: FilmPlayerProps) => {
	const player = useRef<PlayerRef>(null);
	const container = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const element = container.current;
		if (!element) return;
		setWidth(element.clientWidth);
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (width <= 0) return;
		if (playing) player.current?.play();
		else player.current?.pause();
	}, [playing, width]);
	return (
		<div ref={container} className="h-full w-full">
			{width > 0 ? (
				<Player
					ref={player}
					acknowledgeRemotionLicense
					component={BrowserContextFilm}
					compositionWidth={400}
					compositionHeight={600}
					durationInFrames={270}
					fps={30}
					loop
					controls={false}
					clickToPlay={false}
					spaceKeyToPlayOrPause={false}
					doubleClickToFullscreen={false}
					errorFallback={() => <ExtensionPreview />}
					// Remotion needs style.width; supply measured runtime width, keep static styling in classes.
					style={{ width }}
				/>
			) : (
				<ExtensionPreview />
			)}
		</div>
	);
};
