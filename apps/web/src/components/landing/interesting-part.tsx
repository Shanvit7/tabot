import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const prompts = [
	"What was I trying to decide?",
	"Where did I leave off?",
	"Have I done this before?",
] as const;

const contextPackets = [
	{ label: "Research notes", tone: "#7dd3fc", y: "10%" },
	{ label: "Worker design", tone: "#fbbf24", y: "23%" },
	{ label: "Team thread", tone: "#c4b5fd", y: "36%" },
] as const;

export const InterestingPart = () => {
	const section = useRef<HTMLElement>(null);
	const isInView = useInView(section, { amount: 0.2 });
	const reduceMotion = useReducedMotion();
	const shouldAnimate = isInView && !reduceMotion;
	const [answerReady, setAnswerReady] = useState(false);

	useEffect(() => {
		if (!shouldAnimate) {
			setAnswerReady(false);
			return;
		}

		let answerTimer = window.setTimeout(() => setAnswerReady(true), 3100);
		const resetTimer = window.setInterval(() => {
			setAnswerReady(false);
			window.clearTimeout(answerTimer);
			answerTimer = window.setTimeout(() => setAnswerReady(true), 3100);
		}, 7200);
		return () => {
			window.clearTimeout(answerTimer);
			window.clearInterval(resetTimer);
		};
	}, [shouldAnimate]);

	return (
		<section
			className="relative overflow-hidden bg-[#e9f4d6] px-6 py-20 text-[#102219] sm:px-10 sm:py-28 lg:px-14"
			id="ask-better"
			ref={section}
		>
			<div className="absolute inset-y-0 right-0 hidden w-[38%] bg-[#bfff00]/30 lg:block" />
			<div className="relative mx-auto max-w-7xl">
				<div className="max-w-4xl">
					<h2 className="text-[clamp(3rem,6.3vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] [text-wrap:balance]">
						Ask your AI with the part your browser forgot.
					</h2>
					<p className="mt-8 max-w-2xl text-lg leading-8 text-[#40584a] sm:text-xl">
						Tabot turns the loose ends from your browser into context you can
						use. When you want help, send that context to the AI you already
						trust.
					</p>
				</div>

				<div className="mt-14 grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-20">
					<div>
						<p className="text-sm font-semibold text-[#40584a]">
							Instead of starting from a blank prompt:
						</p>
						<div className="mt-5 space-y-3">
							{prompts.map((prompt, index) => (
								<motion.p
									animate={shouldAnimate ? { x: [0, 7, 0] } : { x: 0 }}
									className="w-fit rounded-full border border-[#6e8b70] bg-[#f5faec] px-4 py-3 text-sm font-semibold shadow-[0_8px_18px_rgba(37,74,45,0.12)] sm:text-base"
									key={prompt}
									transition={{
										delay: index * 0.3,
										duration: 2.6,
										ease: "easeInOut",
										repeat: Number.POSITIVE_INFINITY,
										repeatType: "mirror",
									}}
								>
									{prompt}
								</motion.p>
							))}
						</div>
						<p className="mt-8 max-w-sm text-sm font-medium leading-6 text-[#40584a]">
							Your work supplies the starting point. You stay in control of what
							gets sent.
						</p>
					</div>

					<div className="relative mx-auto h-[490px] w-full max-w-[700px] overflow-hidden sm:h-[450px] lg:h-[410px] lg:overflow-visible">
						<motion.div
							animate={shouldAnimate ? { rotate: 360 } : { rotate: 0 }}
							className="absolute left-[-12%] top-[5%] h-[310px] w-[310px] rounded-full border border-dashed border-[#6f9471] sm:left-[1%] sm:top-[2%] sm:h-[370px] sm:w-[370px]"
							transition={{
								duration: 30,
								ease: "linear",
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>

						{contextPackets.map((packet, index) => (
							<motion.div
								animate={
									shouldAnimate
										? {
												scale: [1, 1, 0.82],
												x: [0, 190, 250],
												y: [0, 75, 105],
											}
										: { opacity: 1, scale: 1, x: 0, y: 0 }
								}
								className="absolute left-[3%] z-10 flex items-center gap-2 rounded-full border border-[#7a9279] bg-[#f5faec] px-3 py-2 text-xs font-semibold shadow-[0_10px_24px_rgba(37,74,45,0.16)] sm:left-[10%]"
								key={packet.label}
								style={{ top: packet.y }}
								transition={{
									delay: index * 0.75,
									duration: 4.6,
									ease: [0.5, 0, 0.2, 1],
									repeat: Number.POSITIVE_INFINITY,
									repeatDelay: 1.3,
								}}
							>
								<span
									className="h-2 w-2 rounded-full"
									style={{ backgroundColor: packet.tone }}
								/>
								{packet.label}
							</motion.div>
						))}

						<motion.div
							animate={
								shouldAnimate
									? {
											boxShadow: [
												"0 18px 45px rgba(16,34,25,0.22)",
												"0 18px 60px rgba(132,184,0,0.32)",
												"0 18px 45px rgba(16,34,25,0.22)",
											],
										}
									: undefined
							}
							className="absolute bottom-[3%] left-[4%] z-20 w-[92%] rounded-2xl border-2 border-[#102219] bg-[#102219] p-6 text-[#f5faec] sm:bottom-[8%] sm:left-[35%] sm:w-[61%] sm:p-8"
							transition={{
								duration: 3.6,
								ease: "easeInOut",
								repeat: Number.POSITIVE_INFINITY,
							}}
						>
							<motion.div
								animate={
									answerReady || reduceMotion
										? { opacity: 1, y: 0 }
										: { opacity: 0, y: 8 }
								}
								className="min-h-[190px]"
								initial={false}
								transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
							>
								{answerReady || reduceMotion ? (
									<>
										<div className="flex items-center gap-3">
											<span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#bfff00] text-xs font-bold text-[#102219]">
												AI
											</span>
											<span className="text-sm font-semibold">
												Your AI assistant
											</span>
										</div>
										<p className="mt-6 text-xl font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">
											Here&apos;s the thread behind what you&apos;ve been
											working on.
										</p>
										<p className="mt-3 text-sm leading-6 text-[#c8d8ce]">
											The pages you visited, ideas you compared, and
											conversations you had are ready when you need them.
										</p>
									</>
								) : (
									<>
										<p className="font-mono text-[11px] uppercase tracking-[0.11em] text-[#bfff00]">
											Building context
										</p>
										<p className="mt-6 text-xl font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">
											Gathering the parts that matter.
										</p>
										<motion.div
											animate={{ x: ["-100%", "220%"] }}
											className="mt-6 h-px w-1/3 bg-[#bfff00]"
											transition={{
												duration: 1.8,
												ease: "easeInOut",
												repeat: Number.POSITIVE_INFINITY,
											}}
										/>
									</>
								)}
							</motion.div>
						</motion.div>
					</div>
				</div>

				<div className="mt-16 border-t-2 border-[#102219] pt-8" id="privacy">
					<div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-20">
						<h3 className="max-w-lg text-[clamp(2.5rem,4.2vw,4.7rem)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
							Your activity is not the product.
						</h3>
						<div className="grid gap-6 sm:grid-cols-3">
							<p className="border-t border-[#6e8b70] pt-4 text-sm leading-6 text-[#334c3d]">
								Tabot connects browser activity signals. It does not read page
								text, passwords, or keystrokes.
							</p>
							<p className="border-t border-[#6e8b70] pt-4 text-sm leading-6 text-[#334c3d]">
								Your history stays on your device unless you deliberately export
								context.
							</p>
							<p className="border-t border-[#6e8b70] pt-4 text-sm font-semibold leading-6 text-[#102219]">
								Open source means you can verify every part of that promise.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};
