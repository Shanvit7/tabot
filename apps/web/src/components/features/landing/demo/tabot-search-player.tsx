import { Player } from "@remotion/player";
import { useReducedMotion } from "motion/react";
import { SEARCH_DEMO_DURATION } from "~/components/features/landing/demo/paired-search-demo-data";
import { TabotSearchComposition } from "~/components/features/landing/demo/tabot-search-demo";

const TabotSearchDemo = () => {
	const reduceMotion = useReducedMotion();
	return (
		<section aria-label="Search for Acme company in Tabot">
			<div className="relative aspect-8/5 overflow-hidden rounded-2xl border border-work-line bg-background">
				<Player
					component={TabotSearchComposition}
					compositionWidth={1280}
					compositionHeight={800}
					durationInFrames={SEARCH_DEMO_DURATION}
					fps={30}
					autoPlay={!reduceMotion}
					controls
					alwaysShowControls
					showVolumeControls={false}
					spaceKeyToPlayOrPause
					moveToBeginningWhenEnded={false}
					className="absolute! inset-0! h-full! w-full! [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed"
				/>
			</div>
		</section>
	);
};

export default TabotSearchDemo;
