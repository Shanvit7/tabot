import { Easing, interpolate, useCurrentFrame } from "remotion";
import { ExtensionPreview } from "~/components/landing/activity-illustration";

export const BrowserContextFilm = () => {
	const frame = useCurrentFrame();
	return (
		<ExtensionPreview
			dotOpacity={interpolate(frame % 60, [0, 30, 59], [1, 0.55, 1], {
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
			})}
			scroll={interpolate(frame, [0, 120, 165, 225, 269], [0, 0, 16, 16, 0], {
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
				easing: Easing.bezier(0.22, 1, 0.36, 1),
			})}
		/>
	);
};
