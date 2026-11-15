import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { NoteCaptureComposition } from "~/components/features/landing/demo/note-capture-composition";
import { NOTE_SEARCH_FRAME } from "~/components/features/landing/demo/notes-demo-data";
import { TabotSearchComposition } from "~/components/features/landing/demo/tabot-search-demo";

export const NotesDemoComposition = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill>
			<Sequence durationInFrames={NOTE_SEARCH_FRAME + 12} premountFor={30}>
				<NoteCaptureComposition />
			</Sequence>
			<Sequence from={NOTE_SEARCH_FRAME} premountFor={30}>
				<AbsoluteFill
					style={{
						opacity: interpolate(
							frame,
							[NOTE_SEARCH_FRAME, NOTE_SEARCH_FRAME + 12],
							[0, 1],
							{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
						),
					}}
				>
					<TabotSearchComposition notes />
				</AbsoluteFill>
			</Sequence>
		</AbsoluteFill>
	);
};
