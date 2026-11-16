import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { Search, StickyNote } from "lucide-react";
import { useInView } from "motion/react";
import { lazy, memo, Suspense, useRef, useState } from "react";
import FluidTabs from "~/components/ui/motion/tabs/fluid-tabs";
import { Skeleton } from "~/components/ui/skeleton";

const ChatGptSearchDemo = lazy(
	() => import("~/components/features/landing/demo/chatgpt-search-player"),
);
const TabotSearchDemo = lazy(
	() => import("~/components/features/landing/demo/tabot-search-player"),
);
const NotesDemo = lazy(
	() => import("~/components/features/landing/demo/notes-demo"),
);

const DemoLoading = ({
	label,
	className,
}: {
	label: string;
	className: string;
}) => (
	<div
		role="status"
		aria-label={`Loading ${label} demo`}
		className={`aspect-8/5 overflow-hidden rounded-2xl border border-work-line ${className}`}
	>
		<div
			aria-hidden="true"
			className="mx-auto flex h-full max-w-2xl flex-col gap-5 p-5 sm:gap-7 sm:p-8"
		>
			<div className="flex items-center gap-3 border-b border-current/10 pb-4">
				<Skeleton className="size-7 shrink-0 rounded-full motion-reduce:animate-none" />
				<Skeleton className="h-3 w-28 motion-reduce:animate-none" />
				<Skeleton className="ml-auto h-3 w-12 motion-reduce:animate-none" />
			</div>
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4">
				<Skeleton className="mx-auto h-4 w-2/5 motion-reduce:animate-none" />
				<Skeleton className="h-11 w-full rounded-xl motion-reduce:animate-none" />
				<div className="flex flex-col gap-3 pt-2">
					<Skeleton className="h-3 w-full motion-reduce:animate-none" />
					<Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
					<Skeleton className="h-3 w-2/3 motion-reduce:animate-none" />
				</div>
			</div>
		</div>
	</div>
);

const scenes = [
	{
		id: "chatgpt",
		title: "Search in ChatGPT",
		shortTitle: "ChatGPT",
		icon: OpenAIMono,
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
										<DemoLoading
											label="ChatGPT search"
											className="bg-tutorial-browser text-white"
										/>
									}
								>
									<ChatGptSearchDemo />
								</Suspense>
							) : null
						) : scene.id === "tabot" ? (
							selected === 1 && inView ? (
								<Suspense
									fallback={
										<DemoLoading
											label="Tabot search"
											className="bg-background text-foreground"
										/>
									}
								>
									<TabotSearchDemo />
								</Suspense>
							) : null
						) : selected === 2 && inView ? (
							<Suspense
								fallback={
									<DemoLoading
										label="saved notes"
										className="bg-[#eef0ec] text-work-muted"
									/>
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
