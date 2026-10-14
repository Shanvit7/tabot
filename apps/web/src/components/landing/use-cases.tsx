import ClaudeMono from "@lobehub/icons/es/Claude/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { CLAUDE_CONNECTORS_URL } from "@tabot/shared";
import { Button } from "~/components/ui/button";

export const AssistantIntegration = ({
	extensionInstalled,
	isMobileDevice,
}: {
	extensionInstalled: boolean | null;
	isMobileDevice: boolean;
}) => (
	<section
		id="ai-assistants"
		className="border-b-2 border-black bg-white px-5 py-12 sm:px-10 sm:py-16 lg:px-14"
	>
		<div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
			<div>
				<h2 className="max-w-lg text-[clamp(2rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.02em]">
					Ask ChatGPT or Claude about your browsing.
				</h2>
				<p className="mt-4 max-w-lg text-lg leading-8 text-landing-muted">
					Connect Tabot to an AI assistant to ask about sites you visited and
					patterns in your activity.
				</p>
			</div>
			<div className="border-y border-black py-5">
				<p className="text-lg leading-8">
					Ask things like “Which sites did I visit most today?” or “What do I
					keep coming back to?”
				</p>
				<p className="mt-3 text-base leading-7 text-landing-muted">
					When you ask, your connected assistant requests selected activity
					details from your extension. Tabot’s online connection service passes
					requests and results; it does not store browsing history or tool
					results. The extension must be installed and online.
				</p>
				<div className="mt-5 flex flex-wrap gap-3">
					{extensionInstalled !== null && !isMobileDevice && (
						<Button
							asChild
							variant="outline"
							className="text-base font-semibold normal-case tracking-normal"
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
					<Button
						asChild
						variant="outline"
						className="text-base font-semibold normal-case tracking-normal"
					>
						<a
							href={CLAUDE_CONNECTORS_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							<span className="inline-flex items-center gap-2">
								<ClaudeMono aria-hidden="true" className="size-4" />
								Connect Tabot to Claude
							</span>
						</a>
					</Button>
				</div>
			</div>
		</div>
	</section>
);
