import type { ReactNode } from "react";

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
	return (
		<div
			role="status"
			aria-live="polite"
			aria-atomic="true"
			className={`flex flex-col items-center justify-center gap-5 rounded-lg bg-[#0b1310] px-4 py-10 text-center ${className}`}
		>
			<span className="inline-flex items-center gap-2 rounded-full border border-[#476151] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[#bfff00]">
				<span
					aria-hidden="true"
					className="size-1.5 rounded-full bg-[#bfff00] motion-safe:animate-pulse"
				/>
				MAP IN PROGRESS
			</span>
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
					<circle className="fill-[#bfff00]" cx="32" cy="112" r="10" />
					<circle cx="92" cy="48" r="10" />
					<circle cx="164" cy="104" r="10" />
					<circle cx="236" cy="48" r="10" />
					<circle cx="284" cy="112" r="10" />
				</g>
				<g transform="translate(32 112)">
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
	<main className="grid min-h-screen place-items-center bg-[#0b1310] px-4 py-8">
		<GraphLoading
			className="min-h-[70vh] w-full max-w-2xl border border-[#2f4738]"
			title="Your trail is taking shape"
			message="Connecting the places and patterns from your browsing."
		/>
	</main>
);
