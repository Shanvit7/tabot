import { CLAUDE_MCP_SERVER_URL as MCP_SERVER_URL } from "@tabot/shared";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { McpDialog } from "~/components/features/assistant/chatgpt-tutorial/mcp-dialog";
import { PluginsPage } from "~/components/features/assistant/chatgpt-tutorial/open-scene";
import { getTypedText } from "~/components/features/assistant/chatgpt-tutorial/timeline";

export const DetailsScene = () => {
	const frame = useCurrentFrame();
	return (
		<>
			<PluginsPage />
			<McpDialog
				name={getTypedText("Tabot", frame, 30, 30)}
				serverUrl={getTypedText(MCP_SERVER_URL, frame, 105, 105)}
				activeField={frame < 90 ? "name" : frame < 240 ? "url" : undefined}
				scroll={interpolate(frame, [240, 285], [0, 8], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
					easing: Easing.inOut(Easing.cubic),
				})}
			/>
		</>
	);
};
