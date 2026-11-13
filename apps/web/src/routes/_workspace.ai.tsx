import { createFileRoute } from "@tanstack/react-router";
import {
	Bot,
	Calendar,
	CircleCheck,
	FileText,
	type LucideIcon,
	Mail,
} from "lucide-react";
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const sources: {
	icon: LucideIcon;
	label: string;
	position: string;
	x: number;
	y: number;
}[] = [
	{
		icon: Mail,
		label: "Email",
		position: "left-[5%] top-[18.5%]",
		x: 40,
		y: 48,
	},
	{
		icon: Calendar,
		label: "Calendar",
		position: "left-[5%] top-1/2",
		x: 40,
		y: 130,
	},
	{
		icon: FileText,
		label: "Document",
		position: "left-[5%] top-[81.5%]",
		x: 40,
		y: 212,
	},
];

const Ai = () => {
	const reduceMotion = useReducedMotion();
	const [active, setActive] = useState(0);
	const source = sources[active];

	useEffect(() => {
		if (reduceMotion) return;
		const timer = window.setInterval(
			() => setActive((current) => (current + 1) % sources.length),
			1800,
		);
		return () => window.clearInterval(timer);
	}, [reduceMotion]);

	return (
		<LazyMotion features={domAnimation}>
			<main className="flex min-h-svh items-center justify-center bg-work-canvas px-5 pb-36 pt-12 text-center text-work-ink sm:px-8">
				<div className="w-full max-w-lg">
					<div
						role="img"
						aria-label="Tabot turns repeated browser work into completed actions"
						className="relative mx-auto aspect-[320/260] w-full max-w-[24rem] overflow-hidden rounded-2xl border border-work-line bg-work-surface"
					>
						<svg
							aria-hidden="true"
							className="absolute inset-0 size-full"
							viewBox="0 0 320 260"
							fill="none"
						>
							{sources.map((item) => (
								<path
									key={item.label}
									d={`M 64 ${item.y} C 98 ${item.y}, 108 130, 125 130`}
									className="stroke-work-line"
									strokeWidth="2"
								/>
							))}
							<path
								d="M 195 130 H 256"
								className="stroke-work-line"
								strokeWidth="2"
							/>
							{!reduceMotion && (
								<m.circle
									key={source.label}
									cx={source.x}
									cy={source.y}
									r="5"
									className="fill-work-accent stroke-work-ink"
									strokeWidth="2"
									initial={{ opacity: 0 }}
									animate={{
										cx: [source.x, 160, 280, 280],
										cy: [source.y, 130, 130, 130],
										opacity: [0, 1, 1, 0],
									}}
									transition={{
										duration: 1.45,
										ease: "easeInOut",
										times: [0, 0.42, 0.86, 1],
									}}
								/>
							)}
						</svg>

						{sources.map(({ icon: Icon, label, position }, index) => (
							<span
								key={label}
								className={`absolute ${position} grid aspect-square w-[15%] -translate-y-1/2 place-items-center rounded-xl border transition-[background-color,border-color,color,transform] duration-300 ${
									reduceMotion || active === index
										? "border-work-ink bg-work-accent text-work-ink"
										: "border-work-line bg-work-canvas text-work-muted"
								} ${!reduceMotion && active === index ? "scale-110" : ""}`}
							>
								<Icon
									aria-hidden="true"
									className="size-[45%]"
									strokeWidth={1.75}
								/>
							</span>
						))}

						<m.span
							key={`bot-${active}`}
							className="absolute left-1/2 top-1/2 grid aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-work-ink text-work-canvas shadow-[0_16px_28px_-16px_rgba(21,37,27,0.55)]"
							animate={reduceMotion ? undefined : { scale: [1, 1.12, 1] }}
							transition={{ duration: 0.55, delay: 0.55, ease: "easeOut" }}
						>
							<Bot
								aria-hidden="true"
								className="size-[48%]"
								strokeWidth={1.5}
							/>
						</m.span>

						<m.span
							key={`done-${active}`}
							className="absolute right-[5%] top-1/2 grid aspect-square w-[15%] -translate-y-1/2 place-items-center rounded-full border border-work-ink bg-work-canvas text-work-ink"
							animate={reduceMotion ? undefined : { scale: [1, 1.16, 1] }}
							transition={{ duration: 0.45, delay: 1.15, ease: "easeOut" }}
						>
							<CircleCheck
								aria-hidden="true"
								className="size-[52%]"
								strokeWidth={1.75}
							/>
						</m.span>
					</div>

					<h1 className="mt-9 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
						AI is{" "}
						<span className="bg-work-accent px-2 font-sans text-[0.82em] font-semibold italic text-work-ink">
							coming soon
						</span>
					</h1>
					<p className="mt-3 text-base text-work-muted sm:text-lg">
						Your repeated browser work, handled.
					</p>
				</div>
			</main>
		</LazyMotion>
	);
};

export const Route = createFileRoute("/_workspace/ai")({
	ssr: false,
	head: () => ({ meta: [{ title: "AI · Tabot" }] }),
	component: Ai,
});
