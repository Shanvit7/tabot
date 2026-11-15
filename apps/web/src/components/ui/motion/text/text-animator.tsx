import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { TEXT_ANIMATOR_DEMO_CLASS } from "./text-animator-demo";
import {
	cleanupLoop,
	createLoop,
	DEFAULT_RUNTIME,
	runGenericLoop,
	runKineticCenterBuildLoop,
	runKineticTopBuildLoop,
	runSharedSlideOpacityLoop,
	schedule,
} from "./text-animator-runtime";
import type { TextAnimatorProps } from "./text-animator-types";

export default function TextAnimator({
	spec,
	samples,
	phrases,
	className,
	stageClassName,
	titleClassName,
	speed,
	holdMs,
	gapMs,
	yTravel,
}: TextAnimatorProps) {
	const stageRef = useRef<HTMLDivElement | null>(null);
	const [failedContentKey, setFailedContentKey] = useState<string | null>(null);

	// Track samples/phrases by their *content* rather than array reference so
	// a parent that hands us a fresh-but-identical array on every render
	// doesn't tear down and restart the animation. / are sentinels
	// unlikely to appear in user-supplied copy.
	const samplesKey = useMemo(() => samples?.join("") ?? "", [samples]);
	const phrasesKey = useMemo(
		() => phrases?.map((p) => p.join("")).join("") ?? "",
		[phrases],
	);
	const contentKey = `${samplesKey}|${phrasesKey}`;
	const failed = failedContentKey === contentKey;
	const effectiveSamples = samples?.length ? samples : ["Animation"];
	const samplesRef = useRef(samples);
	const phrasesRef = useRef(phrases);

	useEffect(() => {
		samplesRef.current = samples;
		phrasesRef.current = phrases;
	}, [samples, phrases]);

	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		if (spec.id) stage.dataset.animationId = spec.id;

		const runtime = {
			tileSpeed: speed ?? DEFAULT_RUNTIME.tileSpeed,
			tileHoldMs: holdMs ?? DEFAULT_RUNTIME.tileHoldMs,
			tileGapMs: gapMs ?? DEFAULT_RUNTIME.tileGapMs,
			tileYTravel: yTravel ?? DEFAULT_RUNTIME.tileYTravel,
		};

		const controller = createLoop(stage, runtime, titleClassName);
		const renderer = spec.customRenderer;

		const launch = () => {
			const effectiveSamples = samplesRef.current?.length
				? samplesRef.current
				: ["Animation"];
			const effectivePhrases = phrasesRef.current?.length
				? phrasesRef.current
				: [["Build", "the", "line"]];
			let loop: Promise<void>;
			if (renderer === "kinetic-center-build") {
				loop = runKineticCenterBuildLoop(controller, spec, effectivePhrases);
			} else if (renderer === "kinetic-top-build") {
				loop = runKineticTopBuildLoop(controller, spec, effectivePhrases);
			} else if (renderer === "shared-slide-opacity-stage") {
				loop = runSharedSlideOpacityLoop(controller, spec, effectiveSamples);
			} else {
				loop = runGenericLoop(controller, spec, effectiveSamples);
			}
			void loop.catch((error) => {
				if (!controller.cancelled) {
					console.error(
						`Failed to run text animation "${spec.id ?? "unknown"}"`,
						error,
					);
					setFailedContentKey(contentKey);
					cleanupLoop(controller);
				}
			});
		};

		schedule(controller, launch, Math.random() * 400);

		return () => {
			cleanupLoop(controller);
		};
	}, [spec, contentKey, speed, holdMs, gapMs, yTravel, titleClassName]);

	const demoMode =
		className != null && String(className).includes(TEXT_ANIMATOR_DEMO_CLASS);

	return (
		<div
			data-text-animator-demo={demoMode ? "" : undefined}
			className={cn(
				"relative flex w-full items-center justify-center overflow-hidden",
				className,
			)}
		>
			<div
				ref={stageRef}
				className={cn(
					"@container absolute inset-0 grid h-full min-h-0 w-full place-items-center [grid-template-areas:'title']",
					stageClassName,
				)}
			>
				{failed && effectiveSamples[0] ? (
					<h3
						className={cn(
							"m-0 pointer-events-none transform-3d [grid-area:title] opacity-[0.74]",
							titleClassName,
						)}
					>
						{effectiveSamples[0]}
					</h3>
				) : null}
			</div>
		</div>
	);
}
