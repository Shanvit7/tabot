import { type ReactNode, useEffect, useRef } from "react";

export const GraphLoading = ({
	className = "min-h-105",
	title = "Connecting the dots…",
	message = "Your map is on its way.",
	children,
}: {
	className?: string;
	title?: string;
	message?: string;
	children?: ReactNode;
}) => {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		let visible = false;
		const update = () => {
			element.dataset.animate = String(visible && !document.hidden);
		};
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			update();
		});
		observer.observe(element);
		document.addEventListener("visibilitychange", update);
		return () => {
			observer.disconnect();
			document.removeEventListener("visibilitychange", update);
		};
	}, []);

	return (
		<div
			ref={ref}
			role="status"
			aria-live="polite"
			aria-atomic="true"
			data-animate="false"
			className={`graph-loader flex flex-col items-center justify-center gap-5 rounded-lg bg-[#0b1310] px-4 py-10 text-center ${className}`}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 320 160"
				className="w-full max-w-80 overflow-visible"
			>
				<path
					d="M32 112 92 48 164 104 236 48 284 112Z"
					className="fill-none stroke-[#476151]"
					strokeWidth="2"
				/>
				<g className="fill-[#101d15] stroke-[#6f9c81]" strokeWidth="2">
					<circle className="graph-loader-checkpoint" cx="32" cy="112" r="10" />
					<circle className="graph-loader-checkpoint" cx="92" cy="48" r="10" />
					<circle
						className="graph-loader-checkpoint"
						cx="164"
						cy="104"
						r="10"
					/>
					<circle className="graph-loader-checkpoint" cx="236" cy="48" r="10" />
					<circle
						className="graph-loader-checkpoint"
						cx="284"
						cy="112"
						r="10"
					/>
				</g>
				<g className="graph-loader-marker">
					<rect
						x="-9"
						y="-10"
						width="18"
						height="20"
						rx="4"
						className="fill-[#bfff00] stroke-[#0b1310]"
						strokeWidth="2"
					/>
					<path
						d="M-4-4H4M-4 0H2M-4 4H0"
						className="stroke-[#15251b]"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</g>
			</svg>
			<div>
				<p className="text-base font-semibold text-[#e8f3e8]">{title}</p>
				<p className="mt-2 max-w-sm text-sm leading-6 text-[#8fae95]">
					{message}
				</p>
			</div>
			{children}
		</div>
	);
};

export const Loading = () => (
	<main
		className="min-h-screen bg-white px-4 pt-24 text-[#15251B]"
		role="status"
		aria-live="polite"
	>
		<div className="mx-auto max-w-290">
			<img
				src={`${import.meta.env.BASE_URL}logo.png`}
				alt=""
				className="size-10 rounded-md"
			/>
			<p className="mt-8 text-xl font-semibold">Loading your local activity…</p>
			<div aria-hidden="true" className="mt-8 max-w-180 space-y-4">
				<div className="h-12 rounded-lg bg-[#F5F8F4]" />
				<div className="h-20 rounded-lg bg-[#F5F8F4]" />
				<div className="h-20 rounded-lg bg-[#F5F8F4]" />
			</div>
		</div>
	</main>
);
