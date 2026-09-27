import { spawn } from "node:child_process";
import { watch } from "node:fs";

let deploying = false;
let pending = false;
let timer;

const deploy = async () => {
	if (deploying) {
		pending = true;
		return;
	}
	deploying = true;
	do {
		pending = false;
		const child = spawn(
			"pnpm",
			["exec", "wrangler", "deploy", "--config", "wrangler.dev.toml"],
			{ stdio: "inherit" },
		);
		const code = await new Promise((resolve) => {
			child.once("error", (error) => {
				console.error(error);
				resolve(1);
			});
			child.once("close", resolve);
		});
		if (code !== 0)
			console.error("Dev Worker deploy failed; waiting for changes to retry.");
	} while (pending);
	deploying = false;
};

const schedule = () => {
	clearTimeout(timer);
	timer = setTimeout(() => void deploy(), 500);
};

watch("src", { recursive: true }, schedule);
watch("wrangler.dev.toml", schedule);
void deploy();
