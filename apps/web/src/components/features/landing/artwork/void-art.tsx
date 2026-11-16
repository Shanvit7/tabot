import { memo, useId } from "react";
import geometry from "~/components/features/landing/artwork/void-geometry.json";

// The four terrain layers and cleft are the approved carved-void checkpoint.
// Preserve painter's order: each segment's outer face, inner face, then top.
export const VoidArt = memo(() => {
	const id = useId();
	const ref = (name: string) => `url(#${id}-${name})`;
	return (
		<svg
			className="void-art"
			viewBox="0 0 1440 940"
			preserveAspectRatio="xMidYMid slice"
			role="img"
			aria-label="Lost in a stack of context? That light is Tabot. An arrow points to the glowing orb."
			focusable="false"
		>
			<defs>
				<radialGradient id={`${id}-shadow`}>
					<stop stopColor="#65745f" stopOpacity=".24" />
					<stop offset="1" stopColor="#65745f" stopOpacity="0" />
				</radialGradient>
				<radialGradient id={`${id}-orb`} cx=".3" cy=".22" r=".85">
					<stop stopColor="#fffff2" />
					<stop offset=".17" stopColor="#efffb4" />
					<stop offset=".42" stopColor="#ceff4d" />
					<stop offset=".66" stopColor="#9bd31a" />
					<stop offset=".86" stopColor="#4d7813" />
					<stop offset="1" stopColor="#223b13" />
				</radialGradient>
				<radialGradient id={`${id}-spill`}>
					<stop stopColor="#ccff61" stopOpacity=".8" />
					<stop offset=".35" stopColor="#bbf500" stopOpacity=".32" />
					<stop offset="1" stopColor="#bbf500" stopOpacity="0" />
				</radialGradient>
				<linearGradient id={`${id}-shine`}>
					<stop stopColor="#fff" stopOpacity="0" />
					<stop offset=".43" stopColor="#fff" stopOpacity="0" />
					<stop offset=".5" stopColor="#fff" stopOpacity=".8" />
					<stop offset=".57" stopColor="#fff" stopOpacity="0" />
					<stop offset="1" stopColor="#fff" stopOpacity="0" />
				</linearGradient>
				<linearGradient id={`${id}-veil`} x2="0" y2="1">
					<stop stopColor="#f6f8f3" stopOpacity=".75" />
					<stop offset=".35" stopColor="#f6f8f3" stopOpacity=".82" />
					<stop offset=".58" stopColor="#f6f8f3" stopOpacity="0" />
				</linearGradient>
				<filter id={`${id}-blur`} x="-50%" y="-100%" width="200%" height="300%">
					<feGaussianBlur stdDeviation="8" />
				</filter>
				<clipPath id={`${id}-sphere`}>
					<circle cx="641" cy="605" r="27" />
				</clipPath>
				<clipPath id={`${id}-surfaces`}>
					<path
						d={geometry.levels
							.flatMap((level) => level.paths.map((paths) => paths[2]))
							.join("")}
					/>
				</clipPath>
			</defs>
			<rect width="1440" height="940" fill="#f3f6ef" />
			<g className="void-world">
				<path d="M0 600Q250 510 480 630t470-3 490-12v325H0Z" fill="#e8eee3" />
				<path d="M0 728Q240 630 460 748t470-5 510-7v204H0Z" fill="#dfe8d9" />
				<ellipse cx="720" cy="620" rx="860" ry="345" fill={ref("shadow")} />
				{geometry.levels.map((level, index) => (
					<g
						key={level.paths[0][0]}
						className={`void-stratum void-stratum-${index}`}
					>
						{level.paths.map((paths) => (
							<g key={paths[0]}>
								{paths.map((d, face) => (
									<path
										key={d}
										d={d}
										fill={level.faces[face].fill}
										stroke={level.faces[face].stroke}
										strokeWidth={level.faces[face]["stroke-width"]}
										strokeLinejoin="round"
									/>
								))}
							</g>
						))}
					</g>
				))}
				<g clipPath={ref("surfaces")}>
					<rect
						className="void-terrain-light"
						x="-600"
						y="0"
						width="400"
						height="940"
						fill={ref("shine")}
						transform="rotate(-18 720 470)"
					/>
				</g>
				<g className="void-cleft">
					{geometry.cleft.map((path, index) => (
						<path
							key={path.d}
							d={path.d}
							className={path.class}
							data-shade={"data-shade" in path ? path["data-shade"] : undefined}
							data-floor={index >= 7 || undefined}
						/>
					))}
				</g>
				<ellipse
					className="void-spill"
					cx="641"
					cy="624"
					rx="75"
					ry="31"
					fill={ref("spill")}
				/>
				<ellipse
					className="void-orb-shadow"
					cx="641"
					cy="638"
					rx="26"
					ry="7"
					fill="#17251b"
					opacity=".55"
					filter={ref("blur")}
				/>
				<g className="void-orb">
					<circle
						cx="641"
						cy="605"
						r="36"
						fill={ref("spill")}
						filter={ref("blur")}
					/>
					<circle
						cx="641"
						cy="605"
						r="27"
						fill={ref("orb")}
						stroke="#dcff88"
						strokeWidth=".6"
					/>
					<g clipPath={ref("sphere")}>
						<rect
							className="void-orb-shine"
							x="571"
							y="567"
							width="75"
							height="80"
							fill={ref("shine")}
						/>
					</g>
					<ellipse
						cx="631"
						cy="589"
						rx="9"
						ry="4"
						fill="#fffff1"
						opacity=".92"
						transform="rotate(-32 631 589)"
					/>
					<path
						d="M622 612Q626 626 640 628"
						fill="none"
						stroke="#d9ff79"
						strokeWidth="1.4"
						strokeLinecap="round"
						opacity=".6"
					/>
				</g>
			</g>
			<rect width="1440" height="940" fill={ref("veil")} />
			<g className="void-world">
				<g className="void-annotation">
					<g className="void-annotation-reveal">
						<text
							x="750"
							y="458"
							className="fill-work-ink font-sans text-sm font-normal"
						>
							<tspan x="750">Lost in a stack of context?</tspan>
							<tspan x="750" dy="21" className="fill-work-ink font-medium">
								That light is Tabot.
							</tspan>
						</text>
					</g>
				</g>
				<defs>
					<linearGradient id={`${id}-pointer-ink`} x1="0" y1="0" x2="0" y2="1">
						<stop stopColor="var(--work-ink)" />
						<stop offset=".6" stopColor="var(--work-muted)" />
						<stop offset=".85" stopColor="var(--lime)" />
					</linearGradient>
					<path
						id={`${id}-pointer-desktop`}
						d="M793 510 C846 567 727 546 727 592 S707 655 680 620"
						pathLength="1"
					/>
					<path
						id={`${id}-pointer-mobile`}
						d="M660 491 C733 515 732 582 715 615 S694 639 680 620"
						pathLength="1"
					/>
					<mask
						id={`${id}-pointer-mask`}
						maskUnits="userSpaceOnUse"
						x="620"
						y="480"
						width="240"
						height="190"
					>
						<g fill="none" stroke="white" strokeWidth="9" strokeLinecap="round">
							<use
								href={`#${id}-pointer-desktop`}
								className="void-pointer-reveal hidden md:block"
							/>
							<use
								href={`#${id}-pointer-mobile`}
								className="void-pointer-reveal md:hidden"
							/>
						</g>
					</mask>
				</defs>
				<g
					fill="none"
					strokeWidth="3.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<g
						mask={ref("pointer-mask")}
						stroke={ref("pointer-ink")}
						strokeDasharray=".008 .04"
					>
						<use href={`#${id}-pointer-desktop`} className="hidden md:block" />
						<use href={`#${id}-pointer-mobile`} className="md:hidden" />
					</g>
					<path
						className="void-pointer-tip stroke-lime"
						d="M680 636 Q681 628 680 620 Q689 623 697 623"
					/>
				</g>
			</g>
		</svg>
	);
});
