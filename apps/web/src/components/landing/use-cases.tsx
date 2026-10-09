import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Button } from "~/components/ui/button";

export const ChatGPTIntegration = ({
	extensionInstalled,
	isMobileDevice,
}: {
	extensionInstalled: boolean | null;
	isMobileDevice: boolean;
}) => (
	<section
		id="chatgpt"
		className="border-b-2 border-black bg-white px-5 py-12 sm:px-10 sm:py-16 lg:px-14"
	>
		<div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
			<div>
				<h2 className="max-w-lg text-[clamp(1.75rem,3vw,2.25rem)] font-semibold leading-[1.2] tracking-[-0.02em]">
					Ask ChatGPT about your browsing.
				</h2>
				<p className="mt-4 max-w-lg text-base leading-7 text-landing-muted">
					Connect Tabot to ChatGPT to ask about sites you visited and patterns
					in your activity.
				</p>
			</div>
			<div className="border-y border-black py-5">
				<p className="text-base leading-7">
					Ask things like “Which sites did I visit most today?” or “What do I
					keep coming back to?”
				</p>
				<p className="mt-3 text-sm leading-6 text-landing-muted">
					When you ask, ChatGPT requests selected activity details from your
					extension. Tabot’s online connection service passes requests and
					results; it does not store browsing history or tool results.
				</p>
				{extensionInstalled !== null && !isMobileDevice && (
					<Button
						asChild
						variant="outline"
						className="mt-5 text-sm font-semibold normal-case tracking-normal"
					>
						<a
							href={
								extensionInstalled
									? `${import.meta.env.BASE_URL}home#connectors-heading`
									: "#get-started"
							}
						>
							{extensionInstalled ? (
								<>
									Connect Tabot to{" "}
									<span className="inline-flex items-center gap-1">
										<OpenAIMono aria-hidden="true" className="size-4" />
										ChatGPT
									</span>
								</>
							) : (
								"Get Tabot for Chrome"
							)}
						</a>
					</Button>
				)}
			</div>
		</div>
	</section>
);
