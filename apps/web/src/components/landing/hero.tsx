import { Player } from "@remotion/player";
import { motion, useReducedMotion } from "framer-motion";
import { BrowserContextFilm } from "~/components/landing/browser-context-film";
import { Button } from "~/components/ui/button";

const reveal = {
	hidden: { opacity: 0, y: 16 },
	visible: { opacity: 1, y: 0 },
};

export const Hero = () => {
	const reduceMotion = useReducedMotion();

	return (
		<section className="relative overflow-hidden bg-[#f5f6f0] px-6 pb-14 pt-18 text-[#12221d] sm:px-10 sm:pb-20 sm:pt-24 lg:px-14 lg:pt-28">
			<div className="absolute inset-x-0 top-0 h-px bg-[#d9ddd0]" />
			<div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,0.94fr)_minmax(460px,1.06fr)] lg:gap-16">
				<motion.div
					animate="visible"
					className="max-w-2xl"
					initial={reduceMotion ? "visible" : "hidden"}
					transition={{
						duration: 0.65,
						ease: [0.16, 1, 0.3, 1],
						staggerChildren: 0.1,
					}}
				>
					<motion.h1
						className="max-w-xl text-[clamp(2.75rem,5vw,5.5rem)] font-semibold leading-[0.92] tracking-[-0.03em] text-[#12221d] text-balance"
						variants={reveal}
					>
						Your browser history was never built for work
					</motion.h1>
					<motion.p
						className="mt-7 max-w-lg text-lg leading-8 text-[#4a5a52] sm:text-xl"
						variants={reveal}
					>
						Tabot turns browser activity into private, portable context — so
						you, your AI, and every tool you use can pick work up without
						starting over.
					</motion.p>
					<motion.div
						className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4"
						variants={reveal}
					>
						<Button asChild size="lg">
							<a href="#get-started">Get started</a>
						</Button>
						<a
							className="font-mono text-xs font-bold uppercase tracking-wider underline-offset-4 hover:underline"
							href="#how-it-works"
						>
							Learn How it works
						</a>
					</motion.div>
					<motion.div
						className="mt-11 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#d9ddd0] pt-5 text-sm font-medium text-[#52635a]"
						variants={reveal}
					>
						<span>Runs locally</span>
						<span>Open source</span>
						<span>Your data stays yours</span>
						<span>Built for browser work</span>
					</motion.div>
				</motion.div>

				<motion.div
					animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
					className="relative"
					initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 24 }}
					transition={{ delay: 0.18, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
				>
					<div className="overflow-hidden rounded-[20px] bg-[#0c151f] shadow-[0_24px_55px_rgba(18,34,29,0.2)] ring-1 ring-[#2b3c47]">
						<Player
							acknowledgeRemotionLicense
							aria-label="Tabot preserving work context from browser activity"
							autoPlay={!reduceMotion}
							component={BrowserContextFilm}
							compositionHeight={620}
							compositionWidth={960}
							controls={false}
							durationInFrames={180}
							fps={30}
							loop
							className="block"
							// ponytail: Player reads width from the style prop (calculatePlayerSize), className is ignored — keep width here, do not Tailwind-ify
							style={{ width: "100%" }}
						/>
					</div>
					<p className="mt-4 text-center text-xs font-medium text-[#64736a]">
						Your work context, preserved locally — for you or your AI.
					</p>
				</motion.div>
			</div>
		</section>
	);
};
