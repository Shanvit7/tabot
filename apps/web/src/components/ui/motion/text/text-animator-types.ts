export type TextAnimationTarget =
	| "whole"
	| "per-character"
	| "per-word"
	| "per-line";

export type TextAnimationStaggerMode =
	| "normal"
	| "center-out"
	| "edges-in"
	| "reverse";

export type TextAnimationCustomRenderer =
	| "kinetic-center-build"
	| "kinetic-top-build"
	| "shared-slide-opacity-stage";

export interface TextAnimationFrameSpec {
	opacity?: number;
	xPx?: number;
	yPx?: number;
	zPx?: number;
	scale?: number;
	rotateDeg?: number;
	rotateXDeg?: number;
	rotateYDeg?: number;
	blurPx?: number;
	letterSpacingEm?: number;
	color?: string;
}

export interface TextAnimationPhaseSpec {
	durationMs: number;
	staggerMs: number;
	easing: string;
	from: TextAnimationFrameSpec;
	to: TextAnimationFrameSpec;
}

export interface TextAnimationSwapSpec {
	mode?: string;
	overlapMs?: number;
	microDelayMs?: number;
}

export interface TextAnimationBuildSpec {
	firstWordDurationMs?: number;
	pushDurationMs?: number;
	exitDurationMs?: number;
	holdMs?: number;
	betweenPhrasesMs?: number;
	entryOffsetPx?: number;
	entryOffsetYPx?: number;
	wordGapPx?: number;
	lineGapPx?: number;
	firstWordYPx?: number;
	entryScale?: number;
	entryBlurPx?: number;
	reflowBlurPx?: number;
	exitYPx?: number;
	exitBlurPx?: number;
	easing?: string;
	exitEasing?: string;
	wordOpacityFrom?: number;
	wordOpacityTo?: number;
	wordOpacityDurationMs?: number;
}

export interface TextAnimationSpec {
	id?: string;
	target?: TextAnimationTarget;
	enter: TextAnimationPhaseSpec;
	exit: TextAnimationPhaseSpec;
	swap?: TextAnimationSwapSpec;
	customRenderer?: TextAnimationCustomRenderer;
	staggerMode?: TextAnimationStaggerMode;
	build?: TextAnimationBuildSpec;
}

export interface TextAnimatorProps {
	spec: TextAnimationSpec;
	samples?: string[];
	phrases?: string[][];
	className?: string;
	stageClassName?: string;
	/** Merged onto each animated `h3.text-animation-title` node the runtime creates. */
	titleClassName?: string;
	speed?: number;
	holdMs?: number;
	gapMs?: number;
	yTravel?: number;
}
