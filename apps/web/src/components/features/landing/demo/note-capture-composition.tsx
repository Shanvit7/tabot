import {
	Globe2,
	MoreHorizontal,
	Pause,
	Puzzle,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import {
	AbsoluteFill,
	Easing,
	Img,
	interpolate,
	useCurrentFrame,
} from "remotion";
import {
	DemoCursor,
	Reveal,
} from "~/components/features/assistant/chatgpt-tutorial/primitives";
import { getTypedText } from "~/components/features/assistant/chatgpt-tutorial/timeline";
import {
	getNotesDemoStage,
	NOTE_PAGE,
	NOTE_SAVED_FRAME,
	NOTE_TEXT,
	NOTE_TYPE_DURATION,
	NOTE_TYPE_START,
} from "~/components/features/landing/demo/notes-demo-data";
import { LOGO_URL } from "~/lib/constants";

export const NoteCaptureComposition = () => {
	const frame = useCurrentFrame();
	const stage = getNotesDemoStage(frame);
	const isOpen = frame >= 18;
	const isSaving = stage === "saving";
	const isSaved = frame >= NOTE_SAVED_FRAME;
	const draft = isSaved
		? ""
		: getTypedText(NOTE_TEXT, frame, NOTE_TYPE_START, NOTE_TYPE_DURATION);
	const noteOpacity = interpolate(
		frame,
		[NOTE_SAVED_FRAME, NOTE_SAVED_FRAME + 18],
		[0, 1],
		{
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
			easing: Easing.out(Easing.cubic),
		},
	);

	return (
		<AbsoluteFill
			aria-hidden="true"
			className="bg-[#eef0ec] font-sans text-[#20241f]"
		>
			<div className="relative flex h-11 items-center gap-3 border-b border-[#d8dbd6] bg-white px-4 text-[#555b54]">
				<div className="flex items-center gap-2 text-lg">
					<span className="size-3 rounded-full bg-[#e96b5b]" />
					<span className="size-3 rounded-full bg-[#e4b24e]" />
					<span className="size-3 rounded-full bg-[#62a76a]" />
				</div>
				<RefreshCw aria-hidden="true" className="ml-3 size-4" />
				<div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#f0f1ef] px-3 text-xs">
					<Globe2 aria-hidden="true" className="size-3.5 shrink-0" />
					<span className="truncate">{NOTE_PAGE.url}</span>
				</div>
				<div className="flex items-center gap-3">
					<Img
						src={LOGO_URL}
						alt=""
						className="size-5 rounded object-contain"
					/>
					<Puzzle aria-hidden="true" className="size-4" />
					<MoreHorizontal aria-hidden="true" className="size-4" />
					<DemoCursor at={18} className="right-14 top-0" />
				</div>
			</div>

			<main className="absolute inset-x-0 bottom-0 top-11 overflow-hidden bg-[#f7f8f5]">
				<aside className="absolute inset-y-0 left-0 w-56 border-r border-[#e5e8e2] bg-white/80 px-6 py-8">
					<div className="mb-10 flex items-center gap-2 text-sm font-semibold tracking-wide text-[#35513d]">
						<span className="grid size-7 place-items-center rounded-lg bg-[#dcebdc] text-xs font-bold">
							A
						</span>
						ACME
					</div>
					<p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#939990]">
						Workspace
					</p>
					<div className="rounded-lg bg-[#eef3ed] px-3 py-2 text-xs font-medium text-[#36533c]">
						Getting started
					</div>
					<p className="mt-3 px-3 py-2 text-xs text-[#6d746b]">
						Product overview
					</p>
				</aside>
				<section className="absolute bottom-0 left-56 right-[470px] top-0 overflow-hidden px-14 py-16">
					<div className="mb-6 flex items-center gap-2 text-[11px] text-[#778075]">
						<span>Workspace</span>
						<span>/</span>
						<span>Getting started</span>
					</div>
					<p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#68836b]">
						ACME · PRODUCT
					</p>
					<h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.035em] text-[#263128]">
						Acme onboarding guide
					</h1>
					<p className="mt-5 max-w-lg text-sm leading-6 text-[#737a72]">
						A quick overview of the steps teams use to get a new workspace
						ready.
					</p>
					<div className="mt-10 h-px w-full bg-[#e1e5de]" />
					<div className="mt-8 space-y-3">
						<div className="h-2.5 w-[88%] rounded-full bg-[#e5e8e2]" />
						<div className="h-2.5 w-[74%] rounded-full bg-[#e5e8e2]" />
						<div className="h-2.5 w-[82%] rounded-full bg-[#e5e8e2]" />
						<div className="h-2.5 w-[63%] rounded-full bg-[#e5e8e2]" />
					</div>
					<Reveal at={40}>
						<div className="mt-12 max-w-lg rounded-xl border border-[#e3e7e0] bg-white p-5 shadow-[0_8px_32px_-24px_rgba(29,44,31,0.28)]">
							<p className="text-xs font-semibold text-[#354838]">
								Before you begin
							</p>
							<div className="mt-3 space-y-2.5">
								<div className="h-2 w-[93%] rounded-full bg-[#e7eae5]" />
								<div className="h-2 w-[80%] rounded-full bg-[#e7eae5]" />
								<div className="h-2 w-[69%] rounded-full bg-[#e7eae5]" />
							</div>
						</div>
					</Reveal>
				</section>
				{isOpen && (
					<aside
						className="absolute right-9 top-3 z-10 w-[420px] origin-top-right scale-[1.15] overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_-10px_rgba(18,30,20,0.3)]"
						style={{
							opacity: interpolate(frame, [18, 32], [0, 1], {
								extrapolateLeft: "clamp",
								extrapolateRight: "clamp",
							}),
							translate: `0 ${interpolate(frame, [18, 34], [-14, 0], {
								extrapolateLeft: "clamp",
								extrapolateRight: "clamp",
								easing: Easing.out(Easing.cubic),
							})}px`,
						}}
					>
						<header className="flex h-14 items-center justify-between border-b border-[#e8ebe6] px-4">
							<div className="flex items-center gap-2.5">
								<Img
									src={LOGO_URL}
									alt=""
									className="size-6 rounded object-contain"
								/>
								<div>
									<p className="text-sm font-semibold leading-5">Tabot</p>
									<p className="flex items-center gap-1.5 text-[11px] text-[#777e76]">
										<span className="size-1.5 rounded-full bg-[#9aca42]" />
										Tracking <span aria-hidden="true">·</span> 00:08:24
									</p>
								</div>
							</div>
							<span className="grid size-8 place-items-center rounded-md bg-[#f1f3ef] text-[#4a5149]">
								<Pause aria-hidden="true" className="size-4" />
							</span>
						</header>
						<div className="px-5 pb-5">
							<section className="flex h-[76px] items-center gap-3 border-b border-[#eceeea]">
								<Globe2
									aria-hidden="true"
									className="size-8 shrink-0 rounded-md border border-[#e6e9e3] bg-[#f7f8f6] p-1.5 text-[#7b8379]"
								/>
								<div className="min-w-0">
									<p className="truncate text-sm font-semibold">
										{NOTE_PAGE.title}
									</p>
									<p className="mt-0.5 truncate text-xs text-[#7b8279]">
										{NOTE_PAGE.host}
									</p>
								</div>
							</section>
							<section className="pt-3">
								<div className="mb-2 flex items-center justify-between">
									<h2 className="text-sm font-semibold">Notes</h2>
									<span className="rounded-md bg-[#f1f3ef] px-2 py-0.5 text-xs tabular-nums text-[#72796f]">
										{isSaved ? 1 : 0}
									</span>
								</div>
								<div className="flex h-9 items-center gap-2 rounded-md border border-[#e1e5de] bg-[#fafbf9] px-3">
									<Search
										aria-hidden="true"
										className="size-4 shrink-0 text-[#858c83]"
									/>
									<span className="text-xs text-[#687165]">
										Search this site's notes
									</span>
								</div>
								{!isSaved ? (
									<p className="py-4 text-xs text-[#747b72]">
										No notes on this page yet.
									</p>
								) : (
									<article
										className="mt-1 border-b border-[#e8ebe6] py-3"
										style={{
											opacity: noteOpacity,
											translate: `0 ${interpolate(frame, [NOTE_SAVED_FRAME, NOTE_SAVED_FRAME + 18], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })}px`,
										}}
									>
										<p className="text-[13px] leading-5 text-[#30372f]">
											{NOTE_TEXT}
										</p>
										<div className="mt-2 flex items-center justify-between text-[11px] text-[#858c83]">
											<span>Nov 15, 2026, 12:41 PM</span>
											<div className="flex items-center gap-3">
												<span className="font-medium text-[#4a5149]">Edit</span>
												<Trash2 aria-hidden="true" className="size-3.5" />
											</div>
										</div>
									</article>
								)}
							</section>
							<section className="border-t border-[#eceeea] pt-3">
								<p className="mb-2 text-sm font-semibold">Add a note</p>
								<div className="relative min-h-[84px] rounded-md border border-[#dce1d9] bg-white px-3 py-2.5 text-[13px] leading-5">
									{draft ? (
										<>
											<span>{draft}</span>
											{stage === "typing" && frame % 30 < 16 ? (
												<span className="ml-px inline-block h-4 border-l border-[#29362a] align-middle" />
											) : null}
										</>
									) : (
										<span className="text-[#687165]">
											What do you want to remember?
										</span>
									)}
									<DemoCursor at={64} className="right-4 top-8" />
								</div>
								<div className="mt-2 flex items-center justify-between gap-3">
									<span className="text-[10px] tabular-nums text-[#8a9188]">
										{draft.length}/4000
									</span>
									<div className="relative">
										<button
											type="button"
											tabIndex={-1}
											disabled={isSaving || isSaved || !draft.trim()}
											className={`min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold text-white disabled:cursor-not-allowed ${draft.trim() && !isSaved ? "bg-[#29362a]" : "bg-[#7d837a] opacity-50"}`}
										>
											{isSaving ? "Saving…" : "Save note"}
										</button>
										<DemoCursor at={190} className="right-6 top-0" />
									</div>
								</div>
							</section>
						</div>
					</aside>
				)}
			</main>
		</AbsoluteFill>
	);
};
