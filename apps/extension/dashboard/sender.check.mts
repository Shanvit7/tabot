import assert from "node:assert/strict";
import { isDashboardSender } from "./sender";

for (const url of [
	"http://localhost:3000/home",
	"http://localhost:3001/activities",
	"https://shanvit7.github.io/tabot/home",
])
	assert.equal(isDashboardSender(url), true, `${url} should be allowed`);

for (const url of [
	undefined,
	"http://localhost:3002/home",
	"http://127.0.0.1:3000/home",
	"https://shanvit7.github.io.evil.example/tabot/home",
	"https://shanvit7.github.io/other",
	"https://user:secret@shanvit7.github.io/tabot/home",
	"not a URL",
])
	assert.equal(isDashboardSender(url), false, `${url} should be rejected`);

console.log("dashboard sender: trusted dashboard origins and ports passed");
