import {
	ArrowRight,
	Check,
	Clock3,
	FileText,
	Globe2,
	MessageCircle,
	Search,
	StickyNote,
} from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";

const scenes = [
	{
		id: "notes",
		title: "Saved notes",
		icon: StickyNote,
		heading: "Request a saved note in ChatGPT.",
		description:
			"Ask ChatGPT to retrieve a note you wrote in Tabot. The requested note text is returned in the result.",
		caption: "Note text leaves your device only when requested.",
	},
	{
		id: "activity",
		title: "Site activity",
		icon: Clock3,
		heading: "Ask about sites and times.",
		description:
			"Request supported activity from the records Tabot retained while tracking was on.",
		caption:
			"Results omit page titles, paths, and page text. They are not a complete history.",
	},
	{
		id: "search",
		title: "Local search",
		icon: Search,
		heading: "Search retained pages and notes.",
		description:
			"Search pages, excerpts, and notes in Tabot. Review results in the dashboard.",
		caption: "Search and review work without a ChatGPT connection.",
	},
] as const;

export const ProductDemo = () => {
	const [selected, setSelected] = useState(0);
	const [retrieved, setRetrieved] = useState(false);
	const [query, setQuery] = useState("supplier");
	const scene = scenes[selected];
	const select = (index: number) => {
		setSelected(index);
		setRetrieved(false);
	};
	const hasSearchResult =
		/supplier|delivery|order|minimum|sample/i.test(query) || !query.trim();
	return (
		<div className="mt-10 sm:mt-12">
			<div
				role="tablist"
				aria-label="Choose a demo"
				className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-2xl bg-work-surface p-1.5 sm:rounded-full"
			>
				{scenes.map((item, index) => (
					<button
						key={item.id}
						type="button"
						role="tab"
						id={`task-${item.id}`}
						aria-controls={`scene-${item.id}`}
						aria-selected={selected === index}
						tabIndex={selected === index ? 0 : -1}
						onClick={() => select(index)}
						onKeyDown={(event) => {
							const next =
								event.key === "ArrowRight"
									? (index + 1) % scenes.length
									: event.key === "ArrowLeft"
										? (index + scenes.length - 1) % scenes.length
										: event.key === "Home"
											? 0
											: event.key === "End"
												? scenes.length - 1
												: null;
							if (next !== null) {
								event.preventDefault();
								select(next);
								document.getElementById(`task-${scenes[next].id}`)?.focus();
							}
						}}
						className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-medium text-work-muted transition-colors hover:text-work-ink aria-selected:bg-work-ink aria-selected:text-white sm:rounded-full sm:px-6"
					>
						<item.icon aria-hidden="true" className="size-4" />
						{item.title}
					</button>
				))}
			</div>
			{scenes.map((item, index) => (
				<div
					key={item.id}
					role="tabpanel"
					id={`scene-${item.id}`}
					aria-labelledby={`task-${item.id}`}
					hidden={selected !== index}
					className="mt-10 outline-offset-8"
				>
					{selected === index ? (
						<div className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
							<div className="lg:max-w-[350px]">
								<h3 className="text-balance font-display text-[28px] leading-[1.12] tracking-[-0.025em] sm:text-4xl">
									{scene.heading}
								</h3>
								<p className="mt-5 text-[17px] leading-relaxed text-work-muted">
									{scene.description}
								</p>
								<p className="mt-7 flex items-start gap-2 text-sm leading-relaxed text-work-muted">
									<Check
										aria-hidden="true"
										className="mt-0.5 size-4 shrink-0"
									/>
									{scene.caption}
								</p>
								<a
									href="#how-it-works"
									className="mt-6 inline-flex min-h-12 items-center gap-2 text-sm font-medium underline decoration-work-line underline-offset-4 hover:decoration-work-ink"
								>
									How to get started{" "}
									<ArrowRight aria-hidden="true" className="size-4" />
								</a>
							</div>
							<div className="landing-demo-enter overflow-hidden rounded-2xl bg-[#ecf1e7] p-3 sm:p-7">
								<div className="overflow-hidden rounded-xl bg-white shadow-[0_12px_30px_-18px_#243e2655]">
									<div className="flex items-center justify-between border-b border-work-line px-4 py-3 text-xs text-work-muted">
										<span className="flex items-center gap-2">
											<span className="size-2 rounded-full bg-[#b1c1a8]" />
											{scene.id === "search"
												? "Tabot · search"
												: "ChatGPT conversation"}
										</span>
										<span className="rounded bg-work-surface px-2 py-1 text-[10px]">
											Demo data
										</span>
									</div>
									<div className="min-h-[325px] p-5 sm:min-h-[350px] sm:p-7">
										{scene.id === "search" ? (
											<>
												<label
													htmlFor="sample-search"
													className="mb-2 block text-xs font-medium text-work-muted"
												>
													Try a search
												</label>
												<div className="flex items-center gap-2 rounded-lg border border-work-line px-3">
													<Search
														className="size-4 shrink-0 text-work-muted"
														aria-hidden="true"
													/>
													<input
														id="sample-search"
														type="search"
														value={query}
														onChange={(event) => setQuery(event.target.value)}
														className="min-h-12 w-full min-w-0 bg-transparent text-sm outline-none"
														placeholder="Try supplier or delivery"
													/>
												</div>
												<p
													className="mt-5 text-xs text-work-muted"
													role="status"
												>
													{hasSearchResult
														? "1 result · demo data"
														: "No match in the demo data. Try “supplier” or “delivery”."}
												</p>
												{hasSearchResult ? (
													<div className="mt-4 rounded-lg bg-work-surface p-4">
														<div className="flex items-center gap-2 text-xs text-work-muted">
															<Globe2 className="size-3.5" />
															supplier.example
														</div>
														<p className="mt-2 font-medium">
															A supplier worth following up with
														</p>
														<div className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-work-muted">
															<StickyNote className="mt-0.5 size-4 shrink-0" />
															<p>
																Ask about minimum order and delivery schedule.
															</p>
														</div>
														<span className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-work-muted">
															<FileText className="size-3" />
															Saved note · demo
														</span>
													</div>
												) : null}
											</>
										) : (
											<>
												<div className="ml-auto max-w-[92%] rounded-2xl rounded-br-sm bg-[#eaf0e5] px-4 py-3 text-[14px] leading-relaxed">
													{scene.id === "notes"
														? "Find my saved notes for this supplier’s website."
														: "Which sites did I visit yesterday afternoon?"}
												</div>
												{retrieved ? (
													<div
														className="landing-demo-enter mt-6"
														role="status"
													>
														<div className="flex items-center gap-2 text-xs font-medium">
															<span className="flex size-6 items-center justify-center rounded-full bg-lime">
																<Check className="size-3.5" />
															</span>
															Tabot returned{" "}
															{scene.id === "notes"
																? "a saved note"
																: "site activity"}
														</div>
														{scene.id === "notes" ? (
															<div className="mt-3 rounded-lg bg-work-surface p-4">
																<div className="mb-2 text-xs text-work-muted">
																	supplier.example · Your note
																</div>
																<p className="text-sm leading-relaxed">
																	Ask about minimum order and delivery schedule.
																</p>
															</div>
														) : (
															<div className="mt-3 divide-y divide-work-line rounded-lg bg-work-surface px-4">
																{[
																	["supplier.example", "14:10"],
																	["reference.example", "14:32"],
																].map(([site, time]) => (
																	<div
																		key={site}
																		className="flex items-center justify-between gap-3 py-3 text-sm"
																	>
																		<span>{site}</span>
																		<span className="text-xs tabular-nums text-work-muted">
																			{time}
																		</span>
																	</div>
																))}
															</div>
														)}
														<p className="mt-4 flex items-center gap-2 text-xs leading-relaxed text-work-muted">
															<MessageCircle className="size-3.5 shrink-0" />
															{scene.id === "notes"
																? "The requested note text is included in the result."
																: "Sites and times only."}
														</p>
													</div>
												) : (
													<div className="mt-7">
														<p className="text-sm leading-relaxed text-work-muted">
															{scene.id === "notes"
																? "Your note is saved locally. View the requested note."
																: "View the returned sites and times."}
														</p>
														<Button
															onClick={() => setRetrieved(true)}
															className="mt-5 min-h-12 gap-2 rounded-full bg-work-ink px-5 text-white hover:bg-[#2a4332]"
														>
															{scene.id === "notes"
																? "Show the saved note"
																: "Show the activity result"}
															<ArrowRight />
														</Button>
													</div>
												)}
											</>
										)}
									</div>
								</div>
							</div>
						</div>
					) : null}
				</div>
			))}
		</div>
	);
};
