import { MessageSquare, Search, StickyNote } from "lucide-react";
import { useInView } from "motion/react";
import { lazy, memo, Suspense, useRef, useState } from "react";
import FluidTabs from "~/components/ui/motion/tabs/fluid-tabs";

const ChatGptSearchDemo = lazy(
	() => import("~/components/features/landing/demo/chatgpt-search-player"),
);
const TabotSearchDemo = lazy(
	() => import("~/components/features/landing/demo/tabot-search-player"),
);
const NotesDemo = lazy(
	() => import("~/components/features/landing/demo/notes-demo"),
);

const scenes = [
	{
		id: "chatgpt",
		title: "Search in ChatGPT",
		shortTitle: "ChatGPT",
		icon: MessageSquare,
	},
	{ id: "tabot", title: "Search in Tabot", shortTitle: "Tabot", icon: Search },
	{ id: "notes", title: "Saved notes", shortTitle: "Notes", icon: StickyNote },
] as const;

export const ProductDemo = memo(() => {
	const [selected, setSelected] = useState(0);
	const stage = useRef<HTMLDivElement>(null);
	const inView = useInView(stage);

	return (
		<div ref={stage} className="mt-10 sm:mt-12">
			<FluidTabs
				activeIndex={selected}
				onActiveIndexChange={setSelected}
				className="mx-auto w-full max-w-md"
			>
				<FluidTabs.List
					aria-label="Choose a Tabot demo"
					className="bg-work-surface"
				>
					{scenes.map((scene) => (
						<FluidTabs.Tab
							key={scene.id}
							id={`task-${scene.id}`}
							aria-controls={`scene-${scene.id}`}
							label={scene.title}
							className="min-h-12 cursor-pointer gap-1.5 px-2 text-work-ink sm:gap-2 sm:px-4"
						>
							<FluidTabs.Icon>
								<scene.icon aria-hidden="true" />
							</FluidTabs.Icon>
							<FluidTabs.Label className="sm:hidden">
								{scene.shortTitle}
							</FluidTabs.Label>
							<FluidTabs.Label className="hidden sm:inline">
								{scene.title}
							</FluidTabs.Label>
						</FluidTabs.Tab>
					))}
				</FluidTabs.List>
			</FluidTabs>
			<div className="mt-8">
				{scenes.map((scene, index) => (
					<div
						key={scene.id}
						role="tabpanel"
						id={`scene-${scene.id}`}
						aria-labelledby={`task-${scene.id}`}
						hidden={selected !== index}
					>
						{!inView && selected === index ? (
							<div
								aria-hidden="true"
								className="aspect-8/5 rounded-2xl bg-work-surface"
							/>
						) : null}
						{scene.id === "chatgpt" ? (
							selected === 0 && inView ? (
								<Suspense
									fallback={
										<div
											role="status"
											className="grid aspect-8/5 place-items-center rounded-2xl bg-tutorial-browser text-white"
										>
											Loading ChatGPT search…
										</div>
									}
								>
									<ChatGptSearchDemo />
								</Suspense>
							) : null
						) : scene.id === "tabot" ? (
							selected === 1 && inView ? (
								<Suspense
									fallback={
										<div
											role="status"
											className="grid aspect-8/5 place-items-center rounded-2xl bg-background text-foreground"
										>
											Loading Tabot search…
										</div>
									}
								>
									<TabotSearchDemo />
								</Suspense>
							) : null
						) : selected === 2 && inView ? (
							<Suspense
								fallback={
									<div
										role="status"
										className="grid aspect-8/5 place-items-center rounded-2xl bg-[#eef0ec] text-work-muted"
									>
										Loading Notes demo…
									</div>
								}
							>
								<NotesDemo />
							</Suspense>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
});
