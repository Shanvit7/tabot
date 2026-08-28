import { Player } from "@remotion/player";
import { motion, useReducedMotion } from "framer-motion";
import { BrowserMemoryFilm } from "~/components/landing/browser-memory-film";
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
						className="max-w-xl text-[clamp(3.3rem,7vw,6.7rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-[#12221d] [text-wrap:balance]"
						variants={reveal}
					>
						Your browser history was never built for work.
					</motion.h1>
					<motion.p
						className="mt-7 max-w-lg text-lg leading-8 text-[#4a5a52] sm:text-xl"
						variants={reveal}
					>
						Tabot turns the tabs you open, revisit, and move between into a
						private timeline of the work you are already doing.
					</motion.p>
					<motion.div
						className="mt-9 flex flex-wrap items-center gap-3"
						variants={reveal}
					>
						<Button
							asChild
							className="rounded-full border-[#1d332a] bg-[#163d2d] px-6 text-[#eff5e7] shadow-none hover:bg-[#24523f]"
							size="lg"
						>
							<a href="/metrics">Open the dashboard</a>
						</Button>
						<a
							className="rounded-full px-5 py-3 text-sm font-semibold text-[#244d39] underline decoration-[#9bc65b] decoration-2 underline-offset-4 transition-colors hover:text-[#12221d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4d7c0f]"
							href="#ask-better"
						>
							See how it works
						</a>
					</motion.div>
					<motion.div
						className="mt-11 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#d9ddd0] pt-5 text-sm font-medium text-[#52635a]"
						variants={reveal}
					>
						<span>Runs locally in your browser</span>
						<span>Open source by design</span>
						<span>Raw activity stays yours</span>
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
							aria-label="Illustrative Tabot activity timeline"
							autoPlay={!reduceMotion}
							component={BrowserMemoryFilm}
							compositionHeight={620}
							compositionWidth={960}
							controls={false}
							durationInFrames={180}
							fps={30}
							loop
							style={{ display: "block", width: "100%" }}
						/>
					</div>
					<p className="mt-4 text-center text-xs font-medium text-[#64736a]">
						Illustrative activity model - no browsing data leaves your device.
					</p>
				</motion.div>
			</div>
		</section>
	);
};
