import { CLAUDE_MCP_SERVER_URL as MCP_SERVER_URL } from "@tabot/shared";
import {
	Easing,
	interpolate,
	useCurrentFrame,
	useCurrentScale,
} from "remotion";
import { McpDialog } from "~/components/features/assistant/chatgpt-tutorial/mcp-dialog";
import { PluginsPage } from "~/components/features/assistant/chatgpt-tutorial/open-scene";

export const AuthorizeScene = () => {
	const frame = useCurrentFrame();
	const scale = useCurrentScale();
	return (
		<>
			<PluginsPage />
			<McpDialog
				name="Tabot"
				serverUrl={MCP_SERVER_URL}
				scroll={interpolate(frame, [15, 90], [8, 23 + Math.max(7, 4 / scale)], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
					easing: Easing.inOut(Easing.cubic),
				})}
				acknowledged={frame >= 180}
				review
			/>
		</>
	);
};
