import { InstallLink } from "~/components/features/landing/install/install-link";

const closingWavePath =
	"M-100 270C130 270 40 35 220 50S360 360 580 330 950 40 1120 90s80 160 200 100";

export const ClosingSection = ({
	connected,
	mobile,
}: {
	connected: boolean;
	mobile: boolean;
}) => (
	<section
		className="relative overflow-hidden bg-[#edf3e8] px-5 py-20 text-center sm:px-8 sm:py-24"
		aria-labelledby="close-heading"
	>
		<svg
			aria-hidden="true"
			viewBox="0 0 1200 340"
			fill="none"
			className="pointer-events-none absolute inset-0 h-full w-full"
			preserveAspectRatio="xMidYMid slice"
		>
			<path d={closingWavePath} stroke="#d9e5cb" strokeWidth="3" />
			<path
				d={closingWavePath}
				pathLength={100}
				stroke="#b8e84b"
				strokeDasharray="3 97"
				strokeDashoffset={100}
				strokeLinecap="round"
				strokeWidth="6"
				className="animate-[zigzag-pulse_4800ms_ease-out_infinite] motion-reduce:hidden"
			/>
		</svg>
		<div className="relative mx-auto max-w-3xl">
			<h2
				id="close-heading"
				className="text-balance font-display text-[40px] leading-[1.08] tracking-[-0.03em] sm:text-[60px]"
			>
				Search your browser activity. Connect ChatGPT when you need it.
			</h2>
			<p className="mx-auto mb-8 mt-5 max-w-lg text-lg leading-relaxed text-work-muted">
				Search pages and notes on this device. Connect ChatGPT for captured site
				activity or a saved note.
			</p>
			<InstallLink connected={connected} mobile={mobile} />
		</div>
	</section>
);
