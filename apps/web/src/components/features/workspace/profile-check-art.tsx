import { type CSSProperties, Fragment, useId } from "react";
import {
	PROFILE_CHECK_GEOMETRY as ART,
	type ProfileCheckPart,
} from "~/components/features/workspace/profile-check-geometry";
import "~/components/illustrations/anatomy/iso.css";
import "~/components/features/workspace/profile-check.css";

const Part = ({ part }: { part: ProfileCheckPart }) => (
	<g
		className={[
			part.motion && "profile-check-carriage",
			part.name === "status.lamp.1" && "profile-check-pulse",
		]
			.filter(Boolean)
			.join(" ")}
		data-material={part.material}
	>
		<g className="iso-solid">
			<path className="iso-fill" d={part.paths.fill} />
			{part.paths.shades.map((d) =>
				d ? <path key={d} className="iso-shade" d={d} /> : null,
			)}
			<path className="iso-top" d={part.paths.top} />
			<path
				className="iso-line iso-crease"
				data-tone="faint"
				d={part.paths.crease}
			/>
			{part.paths.bevel ? (
				<path
					className="iso-line iso-bevel"
					data-tone="faint"
					d={part.paths.bevel}
				/>
			) : null}
			<path
				className="iso-line iso-edge"
				data-tone={part.tone}
				d={part.paths.outline}
			/>
		</g>
	</g>
);

export const ProfileCheckArt = () => {
	const lightId = useId();
	return (
		<figure
			className="iso profile-check mx-auto w-full max-w-[34rem]"
			data-theme="light"
		>
			<svg
				className="iso-svg"
				viewBox={`0 0 ${ART.width} ${ART.height}`}
				role="img"
				aria-label="A profile-check instrument scans a Chrome logo and tests its connection."
			>
				<defs>
					<linearGradient id={lightId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor="var(--primary)" stopOpacity="0.08" />
						<stop offset="1" stopColor="var(--primary)" stopOpacity="0.45" />
					</linearGradient>
					<clipPath id={`${lightId}-clip`}>
						<path d={ART.scanLight.curtain} />
					</clipPath>
				</defs>
				<path className="iso-halo" d={ART.halo} />
				{ART.parts.map((part) => (
					<Fragment key={part.name}>
						{part.name === "carriage.bridge" && (
							<g className="profile-check-carriage text-primary">
								<path d={ART.scanLight.curtain} fill={`url(#${lightId})`} />
								<g clipPath={`url(#${lightId}-clip)`}>
									<path
										d={ART.scanLight.source}
										className="profile-check-beam-flow opacity-0"
										stroke="currentColor"
										strokeWidth="4"
										style={
											{
												"--profile-check-light-drop": `${ART.scanLight.drop}px`,
											} as CSSProperties
										}
									/>
								</g>
								<path
									d={ART.scanLight.footprint}
									stroke="currentColor"
									strokeWidth="2"
								/>
							</g>
						)}
						<Part part={part} />
						{part.name === "profile.chrome" && (
							<image
								href={`${import.meta.env.BASE_URL}chrome.svg`}
								width="22"
								height="22"
								transform={ART.chromeLogoTransform}
							/>
						)}
					</Fragment>
				))}
			</svg>
			<figcaption className="sr-only">
				Tabot is checking this Chrome profile.
			</figcaption>
		</figure>
	);
};
