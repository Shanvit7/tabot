"use client";

import { Link, useMatchRoute } from "@tanstack/react-router";
import { cva, type VariantProps } from "class-variance-authority";
import type { MotionProps } from "motion/react";
import {
	type MotionValue,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import React, { type PropsWithChildren, useRef } from "react";
import { Bot } from "~/components/animate-ui/icons/hugeicons/bot";
import { CircuitBoard } from "~/components/animate-ui/icons/hugeicons/circuit-board";
import { Home03 } from "~/components/animate-ui/icons/hugeicons/home-03";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export interface AppleDockProps extends VariantProps<typeof appleDockVariants> {
	className?: string;
	iconSize?: number;
	iconMagnification?: number;
	disableMagnification?: boolean;
	iconDistance?: number;
	direction?: "top" | "middle" | "bottom";
	children: React.ReactNode;
}

const DEFAULT_SIZE = 40;
const DEFAULT_MAGNIFICATION = 60;
const DEFAULT_DISTANCE = 140;
const DEFAULT_DISABLEMAGNIFICATION = false;

const appleDockVariants = cva(
	"supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10 mx-auto mt-8 flex h-[58px] w-max items-center justify-center gap-2 rounded-2xl border p-2 backdrop-blur-md",
);

const AppleDock = React.forwardRef<HTMLDivElement, AppleDockProps>(
	(
		{
			className,
			children,
			iconSize = DEFAULT_SIZE,
			iconMagnification = DEFAULT_MAGNIFICATION,
			disableMagnification = DEFAULT_DISABLEMAGNIFICATION,
			iconDistance = DEFAULT_DISTANCE,
			direction = "middle",
			...props
		},
		ref,
	) => {
		const mouseX = useMotionValue(Infinity);

		const renderChildren = () => {
			return React.Children.map(children, (child) => {
				if (
					React.isValidElement<AppleDockIconProps>(child) &&
					child.type === AppleDockIcon
				) {
					return React.cloneElement(child, {
						...child.props,
						mouseX: mouseX,
						size: iconSize,
						magnification: iconMagnification,
						disableMagnification: disableMagnification,
						distance: iconDistance,
					});
				}
				return child;
			});
		};

		return (
			<motion.div
				ref={ref}
				onMouseMove={(e) => mouseX.set(e.pageX)}
				onMouseLeave={() => mouseX.set(Infinity)}
				{...props}
				className={cn(appleDockVariants({ className }), {
					"items-start": direction === "top",
					"items-center": direction === "middle",
					"items-end": direction === "bottom",
				})}
			>
				{renderChildren()}
			</motion.div>
		);
	},
);

AppleDock.displayName = "AppleDock";

export interface AppleDockIconProps
	extends Omit<MotionProps & React.HTMLAttributes<HTMLDivElement>, "children"> {
	size?: number;
	magnification?: number;
	disableMagnification?: boolean;
	distance?: number;
	padding?: number;
	mouseX?: MotionValue<number>;
	className?: string;
	children?: React.ReactNode;
	props?: PropsWithChildren;
}

const AppleDockIcon = ({
	size = DEFAULT_SIZE,
	magnification = DEFAULT_MAGNIFICATION,
	disableMagnification,
	distance = DEFAULT_DISTANCE,
	padding: paddingOverride,
	mouseX,
	className,
	children,
	...props
}: AppleDockIconProps) => {
	const ref = useRef<HTMLDivElement>(null);
	const padding = paddingOverride ?? Math.max(6, size * 0.2);
	const defaultMouseX = useMotionValue(Infinity);

	const distanceCalc = useTransform(mouseX ?? defaultMouseX, (val: number) => {
		const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
		return val - bounds.x - bounds.width / 2;
	});

	const targetSize = disableMagnification ? size : magnification;

	const sizeTransform = useTransform(
		distanceCalc,
		[-distance, 0, distance],
		[size, targetSize, size],
	);

	const scaleSize = useSpring(sizeTransform, {
		mass: 0.1,
		stiffness: 150,
		damping: 12,
	});

	return (
		<motion.div
			ref={ref}
			style={{
				width: scaleSize,
				height: scaleSize,
				...(paddingOverride === 0 ? {} : { padding }),
			}}
			className={cn(
				"flex aspect-square cursor-pointer items-center justify-center rounded-full",
				paddingOverride === 0 && "p-0",
				disableMagnification && "hover:bg-muted-foreground transition-colors",
				className,
			)}
			{...props}
		>
			<div className="flex size-full items-center justify-center">
				{children}
			</div>
		</motion.div>
	);
};

AppleDockIcon.displayName = "AppleDockIcon";

export const Dock = ({ chatGptConnected }: { chatGptConnected: boolean }) => {
	const reduceMotion = useReducedMotion();
	const matchRoute = useMatchRoute();
	const navigation = [
		{ to: "/home", label: "Home", Icon: Home03 },
		{ to: "/assistant", label: "Assistant", Icon: Bot },
		{ to: "/ai", label: "AI", Icon: CircuitBoard },
	] as const;

	return (
		<nav
			aria-label="Primary navigation"
			className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-50 -translate-x-1/2"
		>
			<TooltipProvider>
				<AppleDock
					className="mt-0 h-auto w-fit gap-1 rounded-2xl border-work-line bg-white/95 p-1.5 shadow-[0_12px_40px_-20px_rgba(21,37,27,0.4)] backdrop-blur-xl"
					iconSize={60}
					iconMagnification={68}
				>
					{navigation.map(({ to, label, Icon }) => {
						const isActive = matchRoute({ to, fuzzy: false });
						const disabled = to === "/home" && !chatGptConnected;

						return (
							<AppleDockIcon key={to} className="rounded-xl" padding={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											to={to}
											activeOptions={{ exact: true }}
											aria-disabled={disabled}
											tabIndex={disabled ? -1 : undefined}
											onClick={(event) => {
												if (disabled) event.preventDefault();
											}}
											className={`relative flex size-full flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-xl px-1 text-work-muted transition-colors hover:text-work-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work-ink [&[data-status=active]]:text-primary-foreground ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
										>
											{isActive && (
												<motion.span
													aria-hidden="true"
													layoutId="tabot-dock-active"
													initial={false}
													transition={
														reduceMotion
															? { duration: 0 }
															: { type: "spring", stiffness: 420, damping: 34 }
													}
													className="absolute inset-0 rounded-xl bg-primary"
												/>
											)}
											<Icon
												aria-hidden="true"
												size={20}
												animate={false}
												animateOnHover={reduceMotion ? false : "default"}
												className="relative z-10"
											/>
											<span className="relative z-10 text-xs font-medium">
												{label}
											</span>
										</Link>
									</TooltipTrigger>
									{disabled && (
										<TooltipContent>
											Connect ChatGPT first to use Home.
										</TooltipContent>
									)}
								</Tooltip>
							</AppleDockIcon>
						);
					})}
				</AppleDock>
			</TooltipProvider>
		</nav>
	);
};
