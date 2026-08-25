import { motion, useReducedMotion } from "framer-motion";

const moments = [
	{
		label: "Research",
		tone: "#7dd3fc",
		x: ["-104%", "-18%", "14%"],
		y: ["-82%", "-42%", "-8%"],
	},
	{
		label: "Plans",
		tone: "#fbbf24",
		x: ["108%", "28%", "-10%"],
		y: ["-52%", "-18%", "2%"],
	},
	{
		label: "Conversation",
		tone: "#c4b5fd",
		x: ["-92%", "-26%", "9%"],
		y: ["78%", "36%", "9%"],
	},
	{
		label: "Draft",
		tone: "#bfff00",
		x: ["98%", "30%", "-8%"],
		y: ["86%", "42%", "11%"],
	},
] as const;

export const WorkMemory = () => {
	const reduceMotion = useReducedMotion();

	return (
		<section
			className="relative overflow-hidden bg-[#0c151f] px-6 py-20 text-[#edf4ed] sm:px-10 sm:py-28 lg:px-14"
			id="remember"
		>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_77%_48%,rgba(191,255,0,0.13),transparent_26%),radial-gradient(circle_at_12%_82%,rgba(125,211,252,0.1),transparent_30%)]" />
			<div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.83fr_1.17fr] lg:items-center lg:gap-20">
				<div className="max-w-xl">
					<h2 className="text-[clamp(3rem,5.8vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] [text-wrap:balance]">
						Your browser is a messy desk. Tabot remembers what you were doing.
					</h2>
					<p className="mt-8 max-w-lg text-lg leading-8 text-[#c4d0ca] sm:text-xl">
						Open something, close it, pick it up tomorrow. Tabot quietly
						connects the moments, so every good train of thought has a way back.
					</p>
					<p className="mt-10 border-t border-[#3a564b] pt-5 text-sm font-medium text-[#d7e7df]">
						No folders to maintain. No notes to remember to write.
					</p>
				</div>

				<div className="relative mx-auto aspect-[1.05/1] w-full max-w-[650px] sm:aspect-[1.25/1]">
					<motion.div
						animate={reduceMotion ? undefined : { rotate: 360 }}
						className="absolute inset-[3%] rounded-full border border-dashed border-[#466258]"
						transition={{
							duration: 32,
							ease: "linear",
							repeat: Number.POSITIVE_INFINITY,
						}}
					/>
					<motion.div
						animate={reduceMotion ? undefined : { rotate: -360 }}
						className="absolute inset-[14%] rounded-full border border-[#28463b]"
						transition={{
							duration: 24,
							ease: "linear",
							repeat: Number.POSITIVE_INFINITY,
						}}
					/>

					{moments.map((moment, index) => (
						<motion.div
							animate={
								reduceMotion
									? undefined
									: {
											x: [...moment.x],
											y: [...moment.y],
											opacity: [0, 1, 0],
											scale: [0.84, 1, 0.86],
										}
							}
							className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-[#4a685d] bg-[#13232e] px-3 py-2 text-xs font-semibold text-[#e3eee8] shadow-[0_12px_32px_rgba(0,0,0,0.25)] sm:px-4"
							key={moment.label}
							transition={{
								delay: index * 1.25,
								duration: 5,
								ease: [0.5, 0, 0.2, 1],
								repeat: Number.POSITIVE_INFINITY,
								repeatDelay: 0,
							}}
						>
							<span
								className="h-2 w-2 rounded-full"
								style={{ backgroundColor: moment.tone }}
							/>
							{moment.label}
						</motion.div>
					))}

					<motion.div
						animate={
							reduceMotion
								? undefined
								: {
										boxShadow: [
											"0 0 0 0 rgba(191,255,0,0)",
											"0 0 0 14px rgba(191,255,0,0.09)",
											"0 0 0 0 rgba(191,255,0,0)",
										],
									}
						}
						className="absolute left-1/2 top-1/2 z-20 w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#bfff00] bg-[#17392b] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.32)] sm:p-7"
						transition={{
							duration: 5,
							ease: "easeInOut",
							repeat: Number.POSITIVE_INFINITY,
						}}
					>
						<div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.1em] text-[#bfff00]">
							<span>Your thread</span>
							<span className="h-2 w-2 rounded-full bg-[#bfff00]" />
						</div>
						<p className="mt-6 text-xl font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">
							From first search to finished thought.
						</p>
						<div className="mt-5 h-px overflow-hidden bg-[#47715e]">
							<motion.div
								animate={reduceMotion ? undefined : { x: ["-100%", "220%"] }}
								className="h-full w-1/3 bg-[#bfff00]"
								transition={{
									duration: 2.4,
									ease: "easeInOut",
									repeat: Number.POSITIVE_INFINITY,
								}}
							/>
						</div>
						<p className="mt-4 text-sm leading-6 text-[#c0d9cc]">
							The work stays connected, even after the tab is gone.
						</p>
					</motion.div>
				</div>
			</div>
		</section>
	);
};
