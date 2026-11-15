import { useInView } from "motion/react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { CHROME_LOGO_URL } from "~/lib/constants";

const AutomationBackRobot = ({ shellId }: { shellId: string }) => (
	<>
		{/* Robot sits behind the tab strip; its hands wrap over the rim. */}
		<path
			d="M501 131q-31 0-39 29m99-25q37-8 64 42"
			stroke="#64775b"
			strokeWidth="17"
			strokeLinecap="round"
		/>
		<path
			d="M501 128q-31 0-39 29m99-25q37-8 64 42"
			stroke="#dce5d3"
			strokeWidth="11"
			strokeLinecap="round"
		/>
		<rect
			x="498"
			y="119"
			width="66"
			height="62"
			rx="25"
			fill={`url(#${shellId})`}
			stroke="#819474"
			strokeWidth="1.5"
		/>
		<rect x="519" y="116" width="25" height="12" rx="4" fill="#9bad8e" />
		<circle cx="531" cy="148" r="9" fill="#25372a" />
		<path d="m528 143 7 5-7 5z" fill="#bcf04a" />
	</>
);

const AutomationBrowser = () => (
	<>
		{/* One recognisable Chrome window, not abstract input/output crates. */}
		<rect x="42" y="163" width="588" height="274" rx="17" fill="#dbe3d3" />
		<rect
			x="42"
			y="155"
			width="588"
			height="274"
			rx="17"
			fill="#fff"
			stroke="#aabb9d"
			strokeWidth="1.5"
		/>
		<path d="M59 155h554q17 0 17 17v25H42v-25q0-17 17-17" fill="#e6ecdf" />
		<circle cx="62" cy="177" r="3.5" fill="#a3b497" />
		<circle cx="76" cy="177" r="3.5" fill="#a3b497" />
		<circle cx="90" cy="177" r="3.5" fill="#a3b497" />
		<path
			d="M112 197v-25q0-8 8-8h104q8 0 8 8v25m8 0v-25q0-8 8-8h94q8 0 8 8v25"
			stroke="#cad5c1"
		/>
		<path d="M357 197v-25q0-8 8-8h138q8 0 8 8v25" fill="#fff" />
		<g className="automation-browser-type" fill="#54664a" fontSize="13">
			<text x="137" y="184">
				Research
			</text>
			<text x="264" y="184">
				Notes
			</text>
			<text x="390" y="184" fill="#243520" fontWeight="600">
				Weekly brief
			</text>
		</g>
		<path
			d="M125 178h5m114 0h5"
			stroke="#8b9e7f"
			strokeWidth="2"
			strokeLinecap="round"
		/>
		<circle cx="377" cy="179" r="3" fill="#91c800" />
		<path
			d="M526 177h10m-5-5v10"
			stroke="#6f8263"
			strokeWidth="1.5"
			strokeLinecap="round"
		/>

		{/* Toolbar details anchor the scene in the browser, not a factory. */}
		<path
			d="m65 212-5 5 5 5m-5-5h12m12-5 5 5-5 5m5-5h-12"
			stroke="#819474"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<rect x="105" y="206" width="452" height="23" rx="11.5" fill="#f3f6ef" />
		<image href={CHROME_LOGO_URL} x="116" y="210" width="15" height="15" />
		<text
			x="141"
			y="222"
			className="automation-browser-type"
			fill="#687b5b"
			fontSize="12"
		>
			Your browser, on repeat
		</text>
		<path d="M42 239h588" stroke="#e8ede3" />
		<circle cx="604" cy="217" r="2" fill="#839575" />
		<circle cx="604" cy="211" r="2" fill="#839575" />
		<circle cx="604" cy="223" r="2" fill="#839575" />

		<g className="automation-browser-type">
			<text x="77" y="277" fill="#1d3023" fontSize="23" fontWeight="600">
				Weekly brief
			</text>
			<text x="77" y="300" fill="#627557" fontSize="14">
				Your pages. Your workflow.
			</text>
			<path d="M88 337v58" stroke="#dce5d3" strokeWidth="2" />
			{[
				"Gather selected pages",
				"Prepare a brief",
				"Ready for your review",
			].map((label, index) => (
				<g
					key={label}
					className={`automation-step automation-step-${index}`}
					transform={`translate(0 ${index * 34})`}
				>
					<circle cx="88" cy="333" r="10" fill="#f0f4eb" stroke="#cbd7c1" />
					<circle
						className="automation-step-done"
						cx="88"
						cy="333"
						r="10"
						fill="#b8e84b"
					/>
					<path
						className="automation-step-done"
						d="m84 333 3 3 5-6"
						stroke="#344b25"
						strokeWidth="1.7"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<text x="111" y="338" fill="#3d5332" fontSize="15">
						{label}
					</text>
					<path d="M111 350h432" stroke="#eff2eb" />
				</g>
			))}
		</g>

		{/* Tap → sequential checks → quiet hold. All motion shares one clock. */}
		<g className="automation-play">
			<circle cx="581" cy="274" r="25" fill="#b8e84b" />
			<circle cx="581" cy="274" r="19" stroke="#9bc936" />
			<path d="m577 266 12 8-12 8z" fill="#2c421e" />
		</g>
		<circle
			className="automation-click-ring"
			cx="581"
			cy="274"
			r="29"
			stroke="#9fcf37"
			strokeWidth="1.5"
		/>
	</>
);

const AutomationFrontRobot = ({ shellId }: { shellId: string }) => (
	<>
		{/* Curved ceramic shell, inset face, hinged wrist and rim-gripping fingers. */}
		<g className="automation-head">
			<path
				d="m532 55 3-25"
				stroke="#7b8f6d"
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<circle
				cx="536"
				cy="25"
				r="6"
				fill="#b8e84b"
				stroke="#8da877"
				strokeWidth="1.5"
			/>
			<circle cx="534" cy="23" r="1.5" fill="#fff" />
			<rect
				x="468"
				y="79"
				width="15"
				height="24"
				rx="7"
				fill="#b0c29f"
				stroke="#819474"
				strokeWidth="1.5"
			/>
			<rect
				x="581"
				y="79"
				width="15"
				height="24"
				rx="7"
				fill="#b0c29f"
				stroke="#819474"
				strokeWidth="1.5"
			/>
			<rect
				x="478"
				y="53"
				width="108"
				height="80"
				rx="28"
				fill={`url(#${shellId})`}
				stroke="#819474"
				strokeWidth="1.5"
			/>
			<path
				d="M491 64q5-5 15-5h50"
				stroke="#fff"
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<rect x="487" y="66" width="90" height="54" rx="19" fill="#223b2c" />
			<path
				d="M499 71h43"
				stroke="#4a6350"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<g className="automation-gaze">
				<g className="automation-eyes" fill="#c2f261">
					<rect x="507" y="83" width="9" height="14" rx="4.5" />
					<rect x="544" y="83" width="9" height="14" rx="4.5" />
				</g>
				<path
					d="M521 104q9 8 18-1"
					stroke="#c2f261"
					strokeWidth="2"
					strokeLinecap="round"
				/>
			</g>
		</g>
		<rect
			x="451"
			y="151"
			width="28"
			height="18"
			rx="7"
			fill={`url(#${shellId})`}
			stroke="#819474"
			strokeWidth="1.5"
		/>
		<path
			d="M459 158v7m7-7v7m7-7v7"
			stroke="#a8ba98"
			strokeWidth="1.3"
			strokeLinecap="round"
		/>
		<circle
			cx="625"
			cy="177"
			r="12"
			fill="#b2c4a2"
			stroke="#7f946e"
			strokeWidth="1.5"
		/>
		<circle
			cx="625"
			cy="177"
			r="5"
			fill="#f1f5eb"
			stroke="#8da278"
			strokeWidth="1.5"
		/>
		<g className="automation-forearm">
			<path
				d="m625 177-34 47"
				stroke="#64775b"
				strokeWidth="15"
				strokeLinecap="round"
			/>
			<path
				d="m624 177-34 44"
				stroke="#dae5cf"
				strokeWidth="9"
				strokeLinecap="round"
			/>
			<path
				d="m587 225-8 12 1 10q0 4 4 4h4q4 0 4-4v-11l4-5"
				fill={`url(#${shellId})`}
				stroke="#819474"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="m583 236 4-5m-3 10 6-8"
				stroke="#a8ba98"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</g>
	</>
);

export const AutomationFigure = memo(() => {
	const shellId = useId();
	const stage = useRef<HTMLElement>(null);
	const inView = useInView(stage);
	const [pageVisible, setPageVisible] = useState(true);
	useEffect(() => {
		const sync = () => setPageVisible(!document.hidden);
		document.addEventListener("visibilitychange", sync);
		sync();
		return () => document.removeEventListener("visibilitychange", sync);
	}, []);

	return (
		<figure
			ref={stage}
			className="automation-scene relative w-full"
			data-motion={inView && pageVisible ? "running" : "paused"}
		>
			<svg
				viewBox="0 0 680 470"
				role="img"
				aria-label="Automation concept: a robot perched on Chrome presses play on a weekly brief. Selected pages become a draft for you to review."
				className="automation-figure block w-full"
				fill="none"
			>
				<defs>
					<linearGradient id={shellId} x1="0" y1="0" x2="0.8" y2="1">
						<stop stopColor="#fff" />
						<stop offset="0.55" stopColor="#e7edde" />
						<stop offset="1" stopColor="#aebfa2" />
					</linearGradient>
				</defs>

				<AutomationBackRobot shellId={shellId} />
				<AutomationBrowser />
				<AutomationFrontRobot shellId={shellId} />
			</svg>
		</figure>
	);
});
