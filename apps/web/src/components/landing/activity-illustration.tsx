import SiGmail from "@icons-pack/react-simple-icons/icons/SiGmail";
import SiGoogledocs from "@icons-pack/react-simple-icons/icons/SiGoogledocs";
import SiGooglesheets from "@icons-pack/react-simple-icons/icons/SiGooglesheets";
import { ArrowRight, ChevronDown, Globe, History, Pause } from "lucide-react";

const sites = [
	{ domain: "docs.google.com", Icon: SiGoogledocs, color: "text-[#4285f4]" },
	{ domain: "mail.google.com", Icon: SiGmail, color: "text-[#ea4335]" },
	{
		domain: "sheets.google.com",
		Icon: SiGooglesheets,
		color: "text-[#0f9d58]",
	},
] as const;

// Presentational copy of the current popup. Sample sites, never visitor history.
// Values use the popup's 400px baseline, inside a preview capped at that width.
export const ExtensionPreview = ({
	dotOpacity = 1,
	scroll = 0,
}: {
	dotOpacity?: number;
	scroll?: number;
}) => (
	<div className="flex h-full w-full flex-col overflow-hidden bg-white font-[ui-sans-serif,system-ui,sans-serif] text-preview-ink @container">
		<header className="flex shrink-0 items-center justify-between gap-[3cqw] border-b border-preview-line px-[5cqw] py-[3cqw]">
			<div className="flex items-center gap-[2.5cqw]">
				<img
					src={`${import.meta.env.BASE_URL}logo.png`}
					alt=""
					className="size-[8cqw] rounded-[2cqw]"
				/>
				<span className="text-[4.5cqw] font-semibold tracking-tight">
					Tabot
				</span>
			</div>
			<div className="flex gap-[2cqw] text-[3cqw] font-medium">
				<span className="flex h-[11cqw] w-[26cqw] items-center justify-center gap-[2cqw] rounded-[1.5cqw] bg-preview-trace text-preview-text">
					<span
						className="size-[2cqw] rounded-full bg-lime"
						style={{ opacity: dotOpacity }}
					/>
					Observing
				</span>
				<span className="flex h-[11cqw] w-[26cqw] items-center justify-center gap-[1.5cqw] rounded-[1.5cqw] border border-preview-line bg-preview-surface">
					<Pause strokeWidth={1.5} className="size-[3.5cqw]" />
					Pause
				</span>
			</div>
		</header>
		<div className="min-h-0 flex-1 overflow-hidden px-[5cqw]">
			<div
				className="pb-[4cqw] pt-[4cqw]"
				style={{ translate: `0 ${-scroll}cqw` }}
			>
				<p className="text-[6cqw] font-semibold leading-tight tracking-tight">
					Your activity across tabs.
				</p>
				<p className="mt-[2cqw] text-[3.5cqw] leading-[1.7] text-preview-muted">
					Tabot records the sites you visit and how you move between them.
				</p>
				<div className="mt-[5cqw] rounded-[3cqw] bg-preview-trace p-[4cqw] text-preview-text">
					<p className="text-[4cqw] font-medium">docs.google.com</p>
					<div className="relative mt-[4cqw] grid grid-cols-[minmax(0,1fr)_14cqw] items-center gap-[6cqw]">
						<svg
							aria-hidden="true"
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							className="pointer-events-none absolute inset-0 h-full w-full text-preview-muted"
						>
							{sites.map(({ domain }, index) => (
								<path
									key={domain}
									d={`M60 ${((index + 0.5) / sites.length) * 100} C76 ${((index + 0.5) / sites.length) * 100} 70 50 90 50`}
									fill="none"
									stroke="currentColor"
									strokeWidth="0.5"
								/>
							))}
						</svg>
						<div className="relative min-w-0 space-y-[2cqw]">
							{sites.map(({ domain, Icon, color }) => (
								<div
									key={domain}
									className="flex h-[10cqw] min-w-0 items-center gap-[2cqw] rounded-[1.5cqw] bg-preview-raised px-[2cqw] text-[3cqw]"
								>
									<span className="flex size-[6cqw] shrink-0 items-center justify-center rounded-[1.5cqw] bg-white">
										<Icon className={`size-[4cqw] ${color}`} />
									</span>
									<span className="truncate">{domain}</span>
								</div>
							))}
						</div>
						<div className="relative flex size-[14cqw] flex-col items-center justify-center gap-[1cqw] rounded-[3cqw] border border-preview-muted bg-preview-raised">
							<History strokeWidth={1.5} className="size-[5cqw] text-lime" />
							<span className="text-[3cqw] font-medium">Activity</span>
						</div>
					</div>
					<div className="mt-[2cqw] flex min-h-[11cqw] items-center justify-between text-[3cqw]">
						<span>View all sites</span>
						<ChevronDown strokeWidth={1.5} className="size-[4cqw]" />
					</div>
				</div>
				<div className="mt-[5cqw]">
					<p className="text-[3.5cqw] font-medium">Earlier activity</p>
					<div className="mt-[2cqw] flex h-[14cqw] items-center gap-[3cqw] border-b border-preview-line">
						<Globe
							strokeWidth={1.5}
							className="size-[4cqw] text-preview-muted"
						/>
						<span className="flex-1 text-[3.5cqw] font-medium">
							calendar.google.com
						</span>
						<ArrowRight strokeWidth={1.5} className="size-[4cqw]" />
					</div>
				</div>
			</div>
		</div>
		<footer className="shrink-0 border-t border-preview-line px-[5cqw] py-[3cqw]">
			<div className="flex h-[11cqw] items-center justify-between rounded-[2cqw] bg-preview-ink px-[4cqw] text-[3.5cqw] font-semibold text-white">
				<span>Review activity</span>
				<ArrowRight strokeWidth={1.5} className="size-[4cqw]" />
			</div>
			<div className="mt-[2cqw] flex min-h-[11cqw] items-center justify-between gap-[3cqw] text-[3cqw] text-preview-muted">
				<span>Recorded on this device. You choose what to share.</span>
				<span className="shrink-0 font-medium">Open Tabot</span>
			</div>
		</footer>
	</div>
);
