import { Check, ChevronRight, Plus, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { DemoCursor } from "~/components/assistant/chatgpt-tutorial/primitives";

const Field = ({
	label,
	children,
	active = false,
}: {
	label: string;
	children: ReactNode;
	active?: boolean;
}) => (
	<div className="mt-4">
		<p className="mb-2 text-xl">{label}</p>
		<div
			className={`min-h-11 rounded-lg border bg-neutral-700/30 px-3 py-2 text-xl leading-7 ${active ? "border-blue-400 ring-1 ring-blue-400" : "border-tutorial-line"}`}
		>
			{children}
		</div>
	</div>
);

/** Screenshot-matched dialog. Form scroll is driven by Remotion, never browser scroll state. */
export const McpDialog = ({
	name,
	serverUrl,
	activeField,
	scroll = 0,
	acknowledged = false,
	review = false,
}: {
	name: string;
	serverUrl: string;
	activeField?: "name" | "url";
	scroll?: number;
	acknowledged?: boolean;
	review?: boolean;
}) => (
	<div className="absolute inset-0 flex items-center justify-center bg-black/45 p-5">
		<div className="flex h-full w-176 flex-col overflow-hidden rounded-3xl border border-white/5 bg-tutorial-panel shadow-2xl">
			<div className="flex shrink-0 items-center justify-between px-6 py-5">
				<h2 className="text-2xl font-semibold">Add custom MCP server</h2>
				<X className="size-5 text-tutorial-muted" />
			</div>
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<div className="px-6 pb-4" style={{ translate: `0 ${-scroll}rem` }}>
					<div className="flex items-center gap-3">
						<span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-tutorial-line">
							<Plus className="size-7" />
						</span>
						<div>
							<p className="text-xl">Icon (optional)</p>
							<p className="mt-1 text-base text-tutorial-muted">
								PNG only. Best results at 256 × 256 or larger. Max file size: 10
								KB
							</p>
						</div>
					</div>
					<Field label="Name" active={activeField === "name"}>
						<span className={name ? "" : "text-tutorial-muted"}>
							{name || "Custom Tool"}
						</span>
					</Field>
					<Field label="Description (optional)">
						<span className="text-tutorial-muted">
							Explain what it does in a few words
						</span>
					</Field>
					<div className="mt-5">
						<div className="mb-2 flex items-center justify-between text-xl">
							<span>Connection</span>
							<span className="flex rounded-xl bg-black/65 p-1 text-base">
								<span className="rounded-lg bg-black px-3 py-1">
									Server URL
								</span>
								<span className="px-3 py-1 text-tutorial-muted">Tunnel</span>
							</span>
						</div>
						<div
							className={`min-h-11 rounded-lg border bg-neutral-700/30 px-3 py-2 text-lg leading-7 ${activeField === "url" ? "border-blue-400 ring-1 ring-blue-400" : "border-tutorial-line"}`}
						>
							<span className={serverUrl ? "" : "text-tutorial-muted"}>
								{serverUrl || "https://example.com/mcp"}
							</span>
						</div>
					</div>
					<Field label="Authentication">OAuth</Field>
					<div className="mt-5 flex items-center gap-4 rounded-xl border border-white/10 p-4 text-tutorial-muted">
						<div>
							<p className="text-lg">Advanced OAuth settings</p>
							<p className="mt-1 text-base leading-6">
								Review discovered OAuth settings, or enter them manually, then
								choose a client setup method and configure default scopes
							</p>
						</div>
						<ChevronRight className="size-5 shrink-0" />
					</div>
					<div className="mt-5 flex items-center gap-3 rounded-lg border border-orange-400/30 bg-black/85 px-4 py-4 text-lg">
						<TriangleAlert className="size-5 shrink-0 text-tutorial-warning" />
						<p>
							Custom MCP servers introduce risk.{" "}
							<span className="underline">Learn more</span>
						</p>
					</div>
					<div className="relative mt-4 rounded-2xl bg-black p-5">
						<p className="mb-3 text-xl">I understand and want to continue</p>
						<div className="flex items-start gap-3 text-lg leading-7 text-tutorial-muted">
							<span
								className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded border ${acknowledged ? "border-white bg-white text-black" : "border-tutorial-line"}`}
							>
								{acknowledged ? <Check className="size-5" /> : null}
							</span>
							<p>
								Only connect to MCP servers you trust. An untrusted server may
								access or steal information shared through app use, or trick
								ChatGPT into using tools in unintended ways, including changing
								or deleting data.
							</p>
						</div>
						{review ? <DemoCursor at={175} className="left-8 top-16" /> : null}
					</div>
				</div>
				<span className="absolute right-1 top-0 h-full w-1 rounded-full bg-white/5">
					<span
						className="block h-40 rounded-full bg-white/25"
						style={{ translate: `0 ${scroll}rem` }}
					/>
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-3 bg-tutorial-panel px-6 py-4 text-lg">
				<span className="mr-auto underline underline-offset-4">
					Read the guide
				</span>
				<span className="rounded-full border border-tutorial-line px-5 py-2">
					Cancel
				</span>
				<span
					className={`relative rounded-full px-5 py-2 ${acknowledged ? "bg-tutorial-ink text-black" : "bg-white/25 text-black/75"}`}
				>
					Create as a plugin
					{review ? <DemoCursor at={285} className="right-5 top-6" /> : null}
				</span>
			</div>
		</div>
	</div>
);
