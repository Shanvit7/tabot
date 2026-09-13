// Root release script: on the Version Packages PR merge (changesets `publish`
// hook), idempotently tag + push v<version>, then dispatch the Chrome Web Store
// submit workflow. Single release path: only this script can fire a store release.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SUBMIT_WORKFLOW = "Submit Extension to Web Store";

const { version } = JSON.parse(
	readFileSync("./apps/extension/package.json", "utf8"),
);
const tag = `v${version}`;

const exists = execSync(`git ls-remote --tags origin ${tag}`).toString().trim();
if (exists) {
	console.log(`Tag ${tag} already exists on origin — nothing to do.`);
	process.exit(0);
}

execSync('git config user.name "github-actions[bot]"');
execSync(
	'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
);
execSync(`git tag ${tag}`);
execSync(`git push origin ${tag}`);
console.log(`Tagged and pushed ${tag}`);

execSync(`gh workflow run "${SUBMIT_WORKFLOW}" --ref main`);
console.log(`Dispatched ${SUBMIT_WORKFLOW}.`);
