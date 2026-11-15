import {
	SiGithub,
	SiGmail,
	SiGoogledrive,
	SiSupabase,
} from "@icons-pack/react-simple-icons";
import {
	ChevronDown,
	ChevronRight,
	FilePlus2,
	Heart,
	Mail,
	MessageCircle,
	Paperclip,
	Plus,
	Search,
	Settings,
} from "lucide-react";
import { useCurrentFrame } from "remotion";
import {
	DemoCursor,
	Reveal,
} from "~/components/features/assistant/chatgpt-tutorial/primitives";

export const PluginsPage = ({ menu = false }: { menu?: boolean }) => (
	<div className="h-full w-full bg-tutorial-browser">
		<div className="flex h-20 items-center gap-6 px-5 text-xl">
			<span className="rounded-full bg-white/10 px-5 py-3">Plugins</span>
			<span>Skills</span>
			<Settings className="ml-auto size-6 text-tutorial-muted" />
			<div className="relative">
				<span className="flex items-center gap-2 rounded-full bg-tutorial-ink px-5 py-3 text-black">
					Add <ChevronDown className="size-5" />
				</span>
				{menu ? (
					<div className="absolute right-0 top-16 z-10 w-80">
						<Reveal at={60}>
							<div className="rounded-2xl border border-white/10 bg-tutorial-panel p-2 text-lg shadow-xl">
								<p className="flex items-center gap-3 px-3 py-3">
									<MessageCircle className="size-5" />
									Create plugin
								</p>
								<p className="flex items-center gap-3 px-3 py-3">
									<FilePlus2 className="size-5" />
									Upload plugin archive
								</p>
								<div className="relative flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3">
									<Paperclip className="size-5" />
									Add custom MCP server
									<DemoCursor at={135} className="right-7 top-5" />
								</div>
							</div>
						</Reveal>
					</div>
				) : null}
			</div>
		</div>
		<div className="mx-auto max-w-4xl px-12 pt-6">
			<h2 className="text-3xl font-medium">Plugins</h2>
			<p className="mt-3 text-xl text-tutorial-muted">
				Connect plugins to let ChatGPT work across your tools
			</p>
			<div className="mt-7 flex items-center gap-3 rounded-full border border-tutorial-line bg-neutral-900 px-5 py-4 text-xl text-tutorial-muted">
				<Search className="size-6" />
				Search plugins
			</div>
			<h3 className="mt-7 flex items-center gap-2 border-b border-white/10 pb-4 text-2xl">
				Installed <ChevronRight className="size-5" />
			</h3>
			<div className="mt-4 flex gap-3">
				{[1, 2, 3].map((id) => (
					<span
						key={id}
						className="flex size-12 items-center justify-center rounded-xl border border-white/15"
					>
						<MessageCircle className="size-6" />
					</span>
				))}
			</div>
			<div className="mt-6 flex items-center gap-6 text-lg">
				<span className="rounded-full bg-white/10 px-5 py-2">Public</span>
				<span>Personal</span>
			</div>
			<h3 className="mb-6 mt-8 flex items-center gap-2 text-2xl">
				Popular <ChevronRight className="size-5" />
			</h3>
			<div className="grid grid-cols-2 gap-x-8 gap-y-6">
				{[
					{
						title: "Gmail",
						detail: "Read and manage Gmail",
						Icon: SiGmail,
						color: "text-red-400",
					},
					{
						title: "Google Drive",
						detail: "Drive, Docs, Sheets or Slides",
						Icon: SiGoogledrive,
						color: "text-yellow-400",
					},
					{
						title: "Health",
						detail: "Explore your health data",
						Icon: Heart,
						color: "text-red-400",
					},
					{
						title: "GitHub",
						detail: "Triage PRs, issues, CI, and publish flows",
						Icon: SiGithub,
						color: "text-white",
					},
					{
						title: "Supabase",
						detail: "Manage and query databases",
						Icon: SiSupabase,
						color: "text-emerald-400",
					},
					{
						title: "Outlook Email",
						detail: "Triage Outlook inboxes",
						Icon: Mail,
						color: "text-blue-400",
					},
				].map(({ title, detail, Icon, color }) => (
					<div key={title} className="flex items-start gap-3">
						<span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/15">
							<Icon className={`size-6 ${color}`} />
						</span>
						<div className="min-w-0">
							<p className="text-xl">{title}</p>
							<p className="mt-1 truncate text-base text-tutorial-muted">
								{detail}
							</p>
						</div>
						<Plus className="ml-auto mt-2 size-5 shrink-0 text-tutorial-muted" />
					</div>
				))}
			</div>
		</div>
	</div>
);

export const OpenScene = () => {
	const frame = useCurrentFrame();
	return (
		<>
			<PluginsPage menu={frame >= 60} />
			<DemoCursor at={45} className="right-10 top-12" />
		</>
	);
};
