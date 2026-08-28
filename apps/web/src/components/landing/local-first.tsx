import {
	AnimatePresence,
	motion,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
} from "framer-motion";
import { useRef, useState } from "react";

const scenes = [
	{
		body: "Tabot derives useful context from browser activity signals. It does not need page contents, passwords, or what you type.",
		headline: "Your activity is not the product.",
		id: "context",
	},
	{
		body: "Your browser activity stays on your device by default. No Tabot cloud is required for core pipeline.",
		headline: "Nothing leaves by accident.",
		id: "private",
	},
	{
		body: "Inspect it, keep it local, or export it to an AI or tool you choose.",
		headline: "Use context where it helps.",
		id: "export",
	},
] as const;

const transition = { duration: 0.38, ease: [0.22, 1, 0.36, 1] } as const;

export const LocalFirst = () => {
	const sectionRef = useRef<HTMLElement>(null);
	const [sceneIndex, setSceneIndex] = useState(0);
	const reduceMotion = useReducedMotion();
	const { scrollYProgress } = useScroll({
		offset: ["start start", "end end"],
		target: sectionRef,
	});

	useMotionValueEvent(scrollYProgress, "change", (progress) => {
		const nextScene = progress < 0.42 ? 0 : progress < 0.76 ? 1 : 2;
		setSceneIndex((current) => (current === nextScene ? current : nextScene));
	});

	const scene = scenes[sceneIndex];

	return (
		<section
			className="relative bg-[#e9f4d6] text-[#102219]"
			id="local-first"
			ref={sectionRef}
		>
			<div className="sticky top-0 min-h-[100svh] overflow-hidden">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_48%,rgba(191,255,0,0.7),transparent_18%),radial-gradient(circle_at_44%_55%,rgba(53,112,77,0.16),transparent_34%)]" />
				<div className="relative mx-auto grid min-h-[100svh] max-w-7xl items-center gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20 lg:px-14">
					<div className="relative min-h-[19rem] max-w-xl lg:min-h-[24rem]">
						<AnimatePresence initial={false} mode="wait">
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className="absolute inset-x-0 top-1/2 -translate-y-1/2"
								exit={{ opacity: 0, y: -28 }}
								initial={{ opacity: 0, y: 28 }}
								key={scene.id}
								transition={reduceMotion ? { duration: 0 } : transition}
							>
								<h2 className="text-[clamp(3.2rem,5.8vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] [text-wrap:balance]">
									{scene.headline}
								</h2>
								<p className="mt-8 max-w-lg text-lg leading-8 text-[#40584a] sm:text-xl">
									{scene.body}
								</p>
							</motion.div>
						</AnimatePresence>
					</div>

					<div className="relative mx-auto h-[24rem] w-full max-w-3xl sm:h-[31rem]">
						<AnimatePresence initial={false} mode="wait">
							{scene.id === "context" && (
								<ContextScene reduceMotion={reduceMotion} />
							)}
							{scene.id === "private" && (
								<PrivateScene reduceMotion={reduceMotion} />
							)}
							{scene.id === "export" && (
								<ExportScene reduceMotion={reduceMotion} />
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
			<div aria-hidden="true" className="h-[330svh]" />
		</section>
	);
};

const ContextScene = ({ reduceMotion }: { reduceMotion: boolean | null }) => (
	<motion.div
		animate={{ opacity: 1 }}
		className="absolute inset-0"
		exit={{ opacity: 0, scale: 0.96 }}
		initial={{ opacity: 0 }}
		transition={reduceMotion ? { duration: 0 } : transition}
	>
		<div
			aria-hidden="true"
			className="absolute left-[7%] top-1/2 h-[16rem] w-[16rem] -translate-y-1/2 bg-lime/35 blur-3xl"
		/>
		{["TAB ACTIVATED", "NAVIGATION", "VISIBILITY", "TAB REMOVED"].map(
			(signal, index) => (
				<motion.div
					animate={{ opacity: 1, x: 0 }}
					className="absolute z-10 border-2 border-[#102219] bg-[#f5faec] px-3 py-2 font-mono text-[10px] font-bold tracking-[0.08em] shadow-hard sm:px-4 sm:py-3 sm:text-xs"
					initial={{ opacity: 0, x: -72 }}
					key={signal}
					style={{ left: `${4 + index * 4}%`, top: `${24 + index * 15}%` }}
					transition={
						reduceMotion
							? { duration: 0 }
							: { ...transition, delay: index * 0.08 }
					}
				>
					<span className="mr-2 inline-block h-2 w-2 bg-lime" />
					{signal}
				</motion.div>
			),
		)}
		<motion.div
			animate={{ opacity: 1, rotate: 0, scale: 1 }}
			className="absolute left-[60%] top-1/2 z-20 h-48 w-48 -translate-x-1/2 -translate-y-1/2 border-[3px] border-[#102219] bg-lime p-5 shadow-hard-xl sm:h-60 sm:w-60 sm:p-7"
			initial={{ opacity: 0, rotate: -14, scale: 0.65 }}
			transition={
				reduceMotion ? { duration: 0 } : { ...transition, delay: 0.2 }
			}
		>
			<p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
				Tabot
			</p>
			<p className="mt-8 text-3xl font-semibold leading-[0.85] tracking-[-0.045em] sm:text-4xl">
				Context
				<br />
				stays yours.
			</p>
			<span className="absolute -right-3 -top-3 h-6 w-6 border-2 border-[#102219] bg-[#f5faec]" />
		</motion.div>
	</motion.div>
);

const PrivateScene = ({ reduceMotion }: { reduceMotion: boolean | null }) => (
	<motion.div
		animate={{ opacity: 1 }}
		className="absolute inset-0"
		exit={{ opacity: 0, scale: 0.96 }}
		initial={{ opacity: 0 }}
		transition={reduceMotion ? { duration: 0 } : transition}
	>
		<motion.div
			animate={{ opacity: 1, scale: 1 }}
			className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 border-[3px] border-[#102219] bg-[#102219] p-7 shadow-hard-xl sm:h-64 sm:w-64"
			initial={{ opacity: 0, scale: 0.7 }}
			transition={reduceMotion ? { duration: 0 } : transition}
		>
			<div className="mx-auto h-20 w-20 rounded-t-full border-[12px] border-[#f5faec] border-b-0" />
			<div className="mx-auto -mt-1 h-16 w-24 bg-[#f5faec]" />
			<p className="mt-7 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-lime">
				On your device
			</p>
		</motion.div>
		{["NO PAGE CONTENTS", "NO PASSWORDS", "NO KEYSTROKES"].map(
			(rule, index) => (
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="absolute border-2 border-[#102219] bg-[#f5faec] px-3 py-2 font-mono text-[10px] font-bold tracking-[0.08em] shadow-hard sm:text-xs"
					initial={{ opacity: 0, y: 38 }}
					key={rule}
					style={{
						left: `${7 + index * 28}%`,
						top: index === 1 ? "76%" : index === 0 ? "21%" : "67%",
					}}
					transition={
						reduceMotion
							? { duration: 0 }
							: { ...transition, delay: 0.16 + index * 0.08 }
					}
				>
					<span className="mr-2 text-[#e13d27]">×</span>
					{rule}
				</motion.div>
			),
		)}
	</motion.div>
);

const ExportScene = ({ reduceMotion }: { reduceMotion: boolean | null }) => (
	<motion.div
		animate={{ opacity: 1 }}
		className="absolute inset-0"
		exit={{ opacity: 0, scale: 0.96 }}
		initial={{ opacity: 0 }}
		transition={reduceMotion ? { duration: 0 } : transition}
	>
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className="absolute inset-x-[8%] top-[18%] border-[3px] border-[#102219] bg-[#f5faec] p-5 shadow-hard-xl sm:inset-x-[13%] sm:p-7"
			initial={{ opacity: 0, y: 100 }}
			transition={reduceMotion ? { duration: 0 } : transition}
		>
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#40584a]">
						Export context
					</p>
					<p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
						Your choice.
					</p>
				</div>
				<div className="border-2 border-[#102219] bg-lime px-3 py-2 font-mono text-xs font-bold uppercase">
					Send
				</div>
			</div>
			<div className="mt-7 grid grid-cols-3 gap-2">
				{["Local AI", "Your agent", "Your tool"].map((destination, index) => (
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="border-2 border-[#102219] bg-[#e9f4d6] px-2 py-3 text-center font-mono text-[9px] font-bold uppercase sm:text-[10px]"
						initial={{ opacity: 0, y: 24 }}
						key={destination}
						transition={
							reduceMotion
								? { duration: 0 }
								: { ...transition, delay: 0.15 + index * 0.08 }
						}
					>
						{destination}
					</motion.div>
				))}
			</div>
		</motion.div>
	</motion.div>
);
