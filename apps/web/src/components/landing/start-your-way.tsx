import SiClaude from "@icons-pack/react-simple-icons/icons/SiClaude";
import SiGithub from "@icons-pack/react-simple-icons/icons/SiGithub";
import SiGooglegemini from "@icons-pack/react-simple-icons/icons/SiGooglegemini";
import SiOllama from "@icons-pack/react-simple-icons/icons/SiOllama";
import {
	motion,
	useReducedMotion,
	useScroll,
	useTransform,
} from "framer-motion";
import { useRef } from "react";

const choices = [
	{ Icon: SiClaude, label: "Claude" },
	{ Icon: SiGooglegemini, label: "Gemini" },
	{ Icon: SiOllama, label: "Ollama" },
	{ Icon: SiGithub, label: "GitHub" },
] as const;

export const StartYourWay = () => {
	const section = useRef<HTMLElement>(null);
	const reduceMotion = useReducedMotion();
	const { scrollYProgress } = useScroll({
		target: section,
		offset: ["start end", "end start"],
	});
	const titleY = useTransform(scrollYProgress, [0.16, 0.42], [58, 0]);
	const panelScale = useTransform(scrollYProgress, [0.3, 0.62], [0.9, 1]);
	const panelY = useTransform(scrollYProgress, [0.3, 0.62], [80, 0]);

	return (
		<section
			className="relative overflow-hidden bg-[#07100c] px-6 py-20 text-[#eff5e7] sm:px-10 sm:py-28 lg:min-h-[110vh] lg:px-14 lg:py-0"
			id="make-it-yours"
			ref={section}
		>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(191,255,0,0.18),transparent_23%),radial-gradient(circle_at_11%_90%,rgba(125,211,252,0.12),transparent_30%)]" />
			<div className="relative mx-auto grid max-w-7xl gap-14 lg:sticky lg:top-0 lg:min-h-screen lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-20">
				<motion.div
					className="max-w-xl"
					style={reduceMotion ? undefined : { y: titleY }}
				>
					<h2 className="text-[clamp(3.1rem,6vw,6.1rem)] font-semibold leading-[0.9] tracking-[-0.04em] [text-wrap:balance]">
						You do not need a workflow. You need a way back.
					</h2>
					<p className="mt-8 max-w-lg text-lg leading-8 text-[#c2d1c7] sm:text-xl">
						Start with the browser mess you already have. Tabot helps you return
						to a project, remember why a tab mattered, and spot the things you
						keep doing.
					</p>
					<p className="mt-7 max-w-lg text-sm font-medium leading-6 text-[#9eb4a5]">
						If you build things, that same context is yours to export, inspect,
						and use in whatever comes next.
					</p>
				</motion.div>

				<motion.div
					className="relative mx-auto w-full max-w-[680px]"
					style={reduceMotion ? undefined : { scale: panelScale, y: panelY }}
				>
					<div className="rounded-2xl border border-[#405b4d] bg-[#102219] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.42)] sm:p-8">
						<div className="flex items-center justify-between border-b border-[#395245] pb-5">
							<p className="text-sm font-semibold">Your next move</p>
							<span className="flex items-center gap-2 text-xs font-medium text-[#bfff00]">
								<span className="h-2 w-2 rounded-full bg-[#bfff00]" />
								ready when you are
							</span>
						</div>

						<div className="mt-7 space-y-4">
							{[
								[
									"Pick up a project",
									"See the tabs, research, and decisions that belong together.",
								],
								[
									"Notice a repeat",
									"Find the small loops that quietly eat your time.",
								],
								[
									"Take it further",
									"Export context when you want a tool or agent to help.",
								],
							].map(([title, detail], index) => (
								<motion.div
									animate={
										reduceMotion
											? undefined
											: { borderColor: ["#395245", "#bfff00", "#395245"] }
									}
									className="grid grid-cols-[2rem_1fr] gap-3 rounded-xl border bg-[#132b20] p-4"
									key={title}
									transition={{
										delay: index * 1.1,
										duration: 3.5,
										ease: "easeInOut",
										repeat: Number.POSITIVE_INFINITY,
										repeatDelay: 0.5,
									}}
								>
									<span className="font-mono text-sm text-[#bfff00]">
										0{index + 1}
									</span>
									<div>
										<p className="font-semibold">{title}</p>
										<p className="mt-1 text-sm leading-6 text-[#a9c0b1]">
											{detail}
										</p>
									</div>
								</motion.div>
							))}
						</div>

						<div className="mt-7 border-t border-[#395245] pt-6" id="oss">
							<p className="text-sm font-medium text-[#c2d1c7]">
								Bring the context to the tools you already choose.
							</p>
							<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
								{choices.map(({ Icon, label }, index) => (
									<motion.div
										animate={reduceMotion ? undefined : { y: [5, 0, 5] }}
										className="flex items-center gap-2 rounded-xl border border-[#395245] bg-[#0b1811] px-3 py-3 text-sm font-semibold"
										key={label}
										transition={{
											delay: index * 0.22,
											duration: 3.2,
											ease: "easeInOut",
											repeat: Number.POSITIVE_INFINITY,
											repeatType: "mirror",
										}}
									>
										<Icon
											aria-hidden="true"
											className="h-5 w-5"
											color="#eff5e7"
										/>
										{label}
									</motion.div>
								))}
							</div>
							<p className="mt-5 text-xs leading-5 text-[#8ca493]">
								Or use Tabot without AI at all. It is still your useful record
								of where your attention went.
							</p>
						</div>
					</div>
				</motion.div>
			</div>
		</section>
	);
};
