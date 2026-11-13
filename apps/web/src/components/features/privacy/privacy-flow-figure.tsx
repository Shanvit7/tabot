import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Pause, Play, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import "~/components/features/privacy/privacy-flow.css";

const requestWire = "M0 72C64 72 64 52 120 52H312C368 52 368 72 432 72";
const resultWire = "M0 72C64 72 64 92 120 92H312C368 92 368 72 432 72";

export const PrivacyFlowFigure = () => {
	const title = useId();
	const figure = useRef<HTMLElement>(null);
	const [visible, setVisible] = useState(false);
	const [paused, setPaused] = useState(false);

	useEffect(() => {
		const observer = new IntersectionObserver(([entry]) =>
			setVisible(entry.isIntersecting),
		);
		if (figure.current) observer.observe(figure.current);
		return () => observer.disconnect();
	}, []);

	return (
		<figure
			ref={figure}
			className="privacy-flow mx-auto my-10 grid max-w-2xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 sm:gap-x-5"
			data-paused={paused || !visible}
			aria-label="Illustration of an authorized request between Chrome and ChatGPT"
		>
			<img
				src={`${import.meta.env.BASE_URL}chrome.svg`}
				alt="Chrome on your device"
				width={72}
				height={72}
				className="size-12 sm:size-18"
			/>
			<div className="relative h-32 min-w-0">
				<svg
					viewBox="0 0 432 144"
					preserveAspectRatio="none"
					role="img"
					aria-labelledby={title}
					className="h-full w-full overflow-visible fill-none"
				>
					<title id={title}>
						Example: ChatGPT sends an authorized request. Chrome returns a
						selected result, not your browsing archive.
					</title>
					{[requestWire, resultWire].map((wire) => (
						<path
							key={wire}
							d={wire}
							className="stroke-border"
							strokeWidth="1.5"
							vectorEffect="non-scaling-stroke"
						/>
					))}
					<path
						d={requestWire}
						pathLength="100"
						className="privacy-wire-request stroke-foreground/50"
						strokeWidth="3"
						strokeDasharray="2 98"
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
					/>
					<path
						d={resultWire}
						pathLength="100"
						className="privacy-wire-result stroke-primary/20"
						strokeWidth="9"
						strokeDasharray="5 95"
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
					/>
					<path
						d={resultWire}
						pathLength="100"
						className="privacy-wire-result stroke-primary"
						strokeWidth="3"
						strokeDasharray="3 97"
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				<button
					type="button"
					aria-label={paused ? "Resume illustration" : "Pause illustration"}
					aria-pressed={paused}
					title={paused ? "Resume illustration" : "Pause illustration"}
					onClick={() => setPaused((value) => !value)}
					className="privacy-wire-gate group absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-background text-foreground cursor-pointer transition-colors hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:hidden"
				>
					{paused ? (
						<Play className="size-4" aria-hidden="true" />
					) : (
						<>
							<ShieldCheck
								className="col-start-1 row-start-1 size-5 group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:opacity-100"
								aria-hidden="true"
							/>
							<Pause
								className="col-start-1 row-start-1 size-4 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:hidden"
								aria-hidden="true"
							/>
						</>
					)}
				</button>
				<span className="absolute left-1/2 top-1/2 hidden size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-background motion-reduce:grid">
					<ShieldCheck className="size-5" aria-hidden="true" />
				</span>
			</div>
			<OpenAIMono
				size={72}
				className="size-12 text-foreground sm:size-18"
				aria-label="ChatGPT"
				role="img"
			/>
		</figure>
	);
};
