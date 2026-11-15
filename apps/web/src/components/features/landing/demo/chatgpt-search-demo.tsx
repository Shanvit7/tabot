import { ArrowUp, Check, Globe2, Search } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
	ChatComposer,
	ChatGptShell,
	DemoCursor,
	Reveal,
	TabotMention,
} from "~/components/features/assistant/chatgpt-tutorial/primitives";
import {
	getTypedText,
	getVerificationStage,
} from "~/components/features/assistant/chatgpt-tutorial/timeline";
import {
	CHATGPT_SEARCH_ANSWER,
	CHATGPT_SEARCH_RESULTS,
	SEARCH_QUERY,
} from "~/components/features/landing/demo/paired-search-demo-data";

const resultTime = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "UTC",
});

/** A seekable ChatGPT UI demo using fictional projected activity, never viewer data. */
export const ChatGptSearchComposition = () => {
	const frame = useCurrentFrame();
	const stage = getVerificationStage(frame);
	const composing = stage === "compose";
	const searching = stage === "calling";

	return (
		<AbsoluteFill
			aria-hidden="true"
			className="bg-tutorial-browser font-chatgpt text-tutorial-ink"
		>
			<ChatGptShell plugins={false} headerless>
				<div
					className={`flex h-full flex-col items-center px-8 py-4 ${composing ? "justify-center" : ""}`}
				>
					<div className="w-full max-w-3xl">
						{composing ? (
							<>
								<h2 className="mb-8 text-center text-4xl font-normal">
									What would you like to find?
								</h2>
								<div className="relative">
									<ChatComposer tabot>
										{getTypedText(SEARCH_QUERY, frame, 20, 130) || ""}
									</ChatComposer>
									<span className="absolute bottom-4 right-5 flex size-10 items-center justify-center rounded-full bg-white text-black">
										<ArrowUp className="size-6" />
										<DemoCursor at={170} className="left-3 top-4" />
									</span>
								</div>
							</>
						) : (
							<>
								<div className="mb-4 ml-12 rounded-3xl bg-neutral-700/50 px-5 py-3 text-xl leading-7">
									<TabotMention /> {SEARCH_QUERY}
								</div>
								<div className="flex items-center gap-3 rounded-xl border border-tutorial-line px-4 py-3 text-lg">
									<span
										style={{
											opacity: searching
												? interpolate(frame % 30, [0, 15, 29], [0.45, 1, 0.45])
												: 1,
										}}
									>
										{searching ? (
											<Search className="size-5" />
										) : (
											<Check className="size-5" />
										)}
									</span>
									<span className="font-medium">Tabot</span>
									<span className="text-tutorial-muted">Search all</span>
									<span className="ml-auto text-tutorial-muted">
										{searching ? "Searching…" : "2 matches"}
									</span>
								</div>
								{stage === "answer" ? (
									<Reveal at={240}>
										<div className="mt-4 text-xl leading-7">
											<p className="mb-1 font-medium">ChatGPT</p>
											<p className="min-h-7">
												{getTypedText(CHATGPT_SEARCH_ANSWER, frame, 240, 55)}
											</p>
											<div className="mt-3 space-y-2">
												{CHATGPT_SEARCH_RESULTS.map((result, index) => (
													<Reveal key={result.site} at={310 + index * 24}>
														<div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
															<Globe2 className="size-5 shrink-0 text-tutorial-muted" />
															<span className="font-medium">
																{new URL(result.site).hostname}
															</span>
															<span className="ml-auto text-base text-tutorial-muted">
																{result.pageCount}{" "}
																{result.pageCount === 1 ? "page" : "pages"} ·{" "}
																{resultTime.format(result.lastSeen)} UTC
															</span>
														</div>
													</Reveal>
												))}
											</div>
										</div>
									</Reveal>
								) : null}
							</>
						)}
					</div>
				</div>
			</ChatGptShell>
		</AbsoluteFill>
	);
};
