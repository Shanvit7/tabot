import { chatGptPromptUrl, type Memory, memoryPrompt } from "@tabot/shared";
import { AskChatGpt } from "~/components/context-graph/assistant-cta";
import { Panel } from "~/components/context-graph/panel";
import {
	ago,
	browsingTrail,
	memoryTitle,
	prettySite,
} from "~/lib/context-graph-data";

export const MemoryDetail = ({
	memory,
	assistantConnected,
	onClose,
}: {
	memory: Memory;
	assistantConnected: boolean;
	onClose: () => void;
}) => {
	const domains = (memory.fingerprint?.domains ?? []).toSorted(
		(a, b) => b.weight - a.weight,
	);
	const total = domains.reduce((sum, entry) => sum + entry.weight, 0) || 1;
	const sequence = browsingTrail(memory.fingerprint?.orderedOrigins ?? []);
	const sightings = memory.occurrences?.length ?? memory.contextCount;
	const now = Date.now();
	return (
		<Panel
			kicker="A pattern you repeat"
			title={memoryTitle(memory)}
			onClose={onClose}
		>
			<dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#2f4738] py-3 text-sm">
				<div>
					<dt className="text-xs text-[#8fae95]">Spotted</dt>
					<dd className="mt-1 font-medium tabular-nums text-[#e8f3e8]">
						{sightings} {sightings === 1 ? "time" : "times"}
					</dd>
				</div>
				<div>
					<dt className="text-xs text-[#8fae95]">Last seen</dt>
					<dd className="mt-1 font-medium text-[#e8f3e8]">
						{ago(now - memory.lastSeen)}
					</dd>
				</div>
			</dl>
			{sequence.length > 0 && (
				<section aria-label="Your browsing trail" className="mt-5">
					<h4 className="text-sm font-medium text-[#cfe4d4]">
						Your browsing trail
					</h4>
					<ol className="mt-3">
						{sequence.map(({ origin, key }, index) => (
							<li
								key={key}
								className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0"
							>
								{index < sequence.length - 1 && (
									<span
										aria-hidden="true"
										className="absolute bottom-0 left-3.5 top-7 w-px bg-[#2f4738]"
									/>
								)}
								<span
									aria-hidden="true"
									className="grid size-7 place-items-center rounded-full border border-[#2f4738] bg-[#16271c] text-xs tabular-nums text-[#bfff00]"
								>
									{index + 1}
								</span>
								<div className="min-w-0">
									<p className="text-sm font-medium leading-7 text-[#e8f3e8]">
										{prettySite(origin)}
									</p>
								</div>
							</li>
						))}
					</ol>
				</section>
			)}
			{domains.length > 0 && (
				<>
					<p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f8f78]">
						Where it happens
					</p>
					<p className="mt-1 text-xs text-[#8fae95]">
						Share of recorded activity
					</p>
					<ul className="mt-3 space-y-3">
						{domains.slice(0, 6).map((entry) => (
							<li key={entry.domain}>
								<div className="flex items-baseline justify-between gap-3 text-sm">
									<span className="min-w-0 text-[#e8f3e8]">
										{prettySite(entry.domain)}
									</span>
									<span className="shrink-0 text-xs tabular-nums text-[#8fae95]">
										{Math.round((entry.weight / total) * 100)}%
									</span>
								</div>
								<div
									aria-hidden="true"
									className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#2f4738]"
								>
									<div
										className="h-full rounded-full bg-[#bfff00]"
										style={{ width: `${(entry.weight / total) * 100}%` }}
									/>
								</div>
							</li>
						))}
					</ul>
				</>
			)}
			<AskChatGpt
				href={chatGptPromptUrl(memoryPrompt(memory.id))}
				connected={assistantConnected}
			/>
		</Panel>
	);
};
