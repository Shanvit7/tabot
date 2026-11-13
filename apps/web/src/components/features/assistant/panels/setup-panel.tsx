import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Check, ChevronDown, Copy, Download } from "lucide-react";

export const AssistantSetupPanel = ({
	connectUrl,
	serverUrl,
	description,
	copyStatus,
	descriptionCopyStatus,
	onCopyServerUrl,
	onCopyDescription,
}: {
	connectUrl: string;
	serverUrl: string;
	description: string;
	copyStatus: "idle" | "copied" | "error";
	descriptionCopyStatus: "idle" | "copied" | "error";
	onCopyServerUrl: () => void;
	onCopyDescription: () => void;
}) => (
	<div className="max-w-3xl">
		<div className="mb-2 flex items-center justify-between gap-3">
			<h2 className="text-base font-semibold text-work-ink">Setup steps</h2>
			<a
				href={connectUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-lime/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				<OpenAIMono aria-hidden="true" className="size-4" />
				Ask ChatGPT to help
				<span className="sr-only">(opens in a new tab)</span>
			</a>
		</div>
		<ol className="divide-y divide-work-line border-y border-work-line">
			{[
				[
					"Use the same Chrome profile",
					"Keep Tabot open in the profile you use for ChatGPT.",
				],
				[
					"Add a custom MCP server",
					"ChatGPT → Plugins → Add → Add custom MCP server.",
				],
				[
					"Configure Tabot",
					"Name it Tabot, choose OAuth, and paste the server URL below. Leave advanced settings unchanged.",
				],
				[
					"Review and authorize",
					"Approve in Chrome, then enable in ChatGPT. Browsing data stays on-device; Tabot’s relay stores none of it. Only requested results reach ChatGPT.",
				],
				[
					"Ask about your browsing activity",
					"Find pages or notes, see activity around a visit, or ask ChatGPT for a timeline or summary.",
				],
			].map(([title, stepDescription], index) => (
				<li key={title} className="flex items-start gap-3 py-2 sm:gap-4">
					<span
						aria-hidden="true"
						className="w-6 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-work-muted"
					>
						{String(index + 1).padStart(2, "0")}
					</span>
					<div className="min-w-0">
						<h3 className="text-sm font-medium leading-5 text-work-ink">
							{title}
						</h3>
						<p className="text-sm leading-5 text-work-muted">
							{stepDescription}
						</p>
						{index === 2 && (
							<div className="mt-3 text-sm">
								<div>
									<h4 className="font-medium text-work-ink">Server URL</h4>
									<div className="mt-2 flex flex-wrap items-center gap-2">
										<code className="min-w-0 flex-1 basis-48 select-text break-all rounded-md bg-work-raised px-3 py-2 font-mono text-xs leading-5 text-work-ink">
											{serverUrl}
										</code>
										<button
											type="button"
											onClick={onCopyServerUrl}
											aria-label={
												copyStatus === "copied"
													? "Tabot server URL copied"
													: "Copy Tabot server URL"
											}
											className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-work-line px-3 text-xs font-medium text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										>
											{copyStatus === "copied" ? (
												<Check aria-hidden="true" className="size-3.5" />
											) : (
												<Copy aria-hidden="true" className="size-3.5" />
											)}
											<span role="status">
												{copyStatus === "copied" ? "Copied URL" : "Copy URL"}
											</span>
										</button>
									</div>
									{copyStatus === "error" && (
										<p role="status" className="mt-1 text-xs text-work-muted">
											Couldn’t copy. Select the URL to copy it manually.
										</p>
									)}
								</div>
								<details className="group/details mt-3 border-t border-work-line">
									<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-work-muted transition-colors hover:text-work-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
										<ChevronDown
											aria-hidden="true"
											className="size-4 shrink-0 transition-transform group-open/details:rotate-180 motion-reduce:transition-none"
										/>
										<span className="font-medium">
											Add description and logo
										</span>
										<span className="text-xs">Optional</span>
									</summary>
									<div className="space-y-4 pb-3 pl-6">
										<div>
											<h4 className="font-medium text-work-ink">Description</h4>
											<p className="mt-2 max-w-prose select-text rounded-md bg-work-raised px-3 py-2 text-sm leading-6 text-work-ink">
												{description}
											</p>
											<button
												type="button"
												onClick={onCopyDescription}
												aria-label={
													descriptionCopyStatus === "copied"
														? "Description copied"
														: "Copy description"
												}
												className="mt-2 inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-work-line px-3 text-xs font-medium text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											>
												{descriptionCopyStatus === "copied" ? (
													<Check aria-hidden="true" className="size-3.5" />
												) : (
													<Copy aria-hidden="true" className="size-3.5" />
												)}
												<span role="status">
													{descriptionCopyStatus === "copied"
														? "Copied description"
														: "Copy description"}
												</span>
											</button>
											{descriptionCopyStatus === "error" && (
												<p
													role="status"
													className="mt-1 text-xs text-work-muted"
												>
													Couldn’t copy. Select the description to copy it
													manually.
												</p>
											)}
										</div>
										<div className="border-t border-work-line pt-4">
											<h4 className="font-medium text-work-ink">Logo</h4>
											<div className="mt-2 flex flex-wrap items-center gap-3">
												<img
													src={`${import.meta.env.BASE_URL}logo.png`}
													alt="Tabot logo preview"
													width="64"
													height="64"
													className="size-16 shrink-0 rounded-lg border border-work-line object-contain"
												/>
												<a
													href={`${import.meta.env.BASE_URL}logo.png`}
													download="tabot-logo.png"
													className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-work-line px-3 text-xs font-medium text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
												>
													<Download aria-hidden="true" className="size-3.5" />{" "}
													Download logo
												</a>
											</div>
										</div>
									</div>
								</details>
							</div>
						)}
					</div>
				</li>
			))}
		</ol>
	</div>
);
