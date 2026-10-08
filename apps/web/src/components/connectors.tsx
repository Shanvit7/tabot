import ClaudeMono from "@lobehub/icons/es/Claude/components/Mono";
import GeminiMono from "@lobehub/icons/es/Gemini/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { useAssistantConnection } from "~/providers/assistant-connection";

// Where the user adds the Tabot MCP connector in ChatGPT.
const CHATGPT_URL = "https://chatgpt.com/plugins?search=Tabot";
const CTA_CLASS =
	"flex min-h-16 flex-col items-center justify-center gap-1 rounded-[8px] border px-2 py-2";

// Home waits for extension data before mounting this section; resolve the deep link then.
export const focusConnectorsHeading = (heading: HTMLHeadingElement | null) => {
	if (!heading || window.location.hash !== "#connectors-heading") return;
	heading.scrollIntoView();
	heading.focus({ preventScroll: true });
};

export const Connectors = () => {
	const connected = useAssistantConnection();
	const ChatGptTile = connected === false ? "a" : "div";

	return (
		<section
			aria-labelledby="connectors-heading"
			className="work-rule mt-14 border-t pt-6"
		>
			<div>
				<h2
					ref={focusConnectorsHeading}
					id="connectors-heading"
					tabIndex={-1}
					className="scroll-mt-6 text-lg font-semibold"
				>
					AI Assistants
				</h2>
				<p className="mt-1 text-[13px] leading-5 text-(--work-muted)">
					Give your AI assistant context from what you&apos;re browsing.
				</p>
				<div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
					<ChatGptTile
						href={connected === false ? CHATGPT_URL : undefined}
						target={connected === false ? "_blank" : undefined}
						rel={connected === false ? "noopener noreferrer" : undefined}
						className={`${CTA_CLASS} border-(--work-ink) bg-(--work-ink) text-white no-underline ${connected === false ? "hover:bg-[#304939]" : "cursor-default"}`}
					>
						<span className="flex flex-col items-center gap-2 text-[15px] font-medium sm:flex-row">
							<OpenAIMono className="size-5 shrink-0" aria-hidden="true" />
							{connected ? "ChatGPT" : "Connect ChatGPT"}
						</span>
						<span role="status" className="text-center text-[13px] leading-5">
							{connected === true
								? "Connected"
								: connected === false
									? ""
									: connected === undefined
										? "Checking…"
										: "Status unknown"}
						</span>
						{connected === false && (
							<span className="sr-only">(opens ChatGPT in a new tab)</span>
						)}
					</ChatGptTile>
					{[
						{ name: "Claude", Icon: ClaudeMono },
						{ name: "Gemini", Icon: GeminiMono },
					].map(({ name, Icon }) => (
						<button
							key={name}
							type="button"
							disabled
							className={`${CTA_CLASS} cursor-not-allowed border-(--work-line) bg-(--work-surface) text-(--work-muted)`}
						>
							<span className="flex flex-col items-center gap-2 text-[15px] font-medium sm:flex-row">
								<Icon className="size-5 shrink-0" aria-hidden="true" />
								{name}
							</span>
							<span className="whitespace-nowrap text-[13px] leading-5">
								Coming soon
							</span>
						</button>
					))}
				</div>
				{connected === null && (
					<p className="mt-3 text-[13px] leading-5 text-(--work-muted)">
						Can&apos;t reach Tabot. Reload the extension to check your
						connection.
					</p>
				)}
				<p className="mt-4 text-[13px] leading-5 text-(--work-muted)">
					Your browsing stays private. Only what you choose to share is sent to
					AI assistants, with sensitive details automatically removed.
				</p>
			</div>
		</section>
	);
};
