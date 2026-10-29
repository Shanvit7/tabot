import assert from "node:assert/strict";
import {
	link,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendLocalLabelRecord,
	parseCliArgs,
	parsePairLabels,
	parseSourceLabels,
	queryContainsUrl,
	resolveSafeLabelPath,
} from "../recall/local-labeler";

assert.deepEqual(parseCliArgs(["--", "export.jsonl"]), ["export.jsonl"]);
assert.deepEqual(parseCliArgs(["export.jsonl"]), ["export.jsonl"]);
assert.deepEqual(parseSourceLabels("1=r, 3=i, 4=a", 4), [
	{ index: 1, label: "relevant" },
	{ index: 3, label: "irrelevant" },
	{ index: 4, label: "ambiguous" },
]);
assert.deepEqual(parseSourceLabels("", 2), []);
assert.throws(() => parseSourceLabels("0=r", 2), /invalid-source-labels/);
assert.throws(() => parseSourceLabels("1=r,1=i", 2), /invalid-source-labels/);
assert.deepEqual(parsePairLabels("1-2=r, 2-3=u, 1-3=a", 3), [
	{ left: 1, right: 2, label: "related" },
	{ left: 2, right: 3, label: "unrelated" },
	{ left: 1, right: 3, label: "ambiguous" },
]);
assert.deepEqual(parsePairLabels("", 2), []);
assert.throws(() => parsePairLabels("1-1=r", 2), /invalid-pair-labels/);
assert.throws(() => parsePairLabels("1-2=r,2-1=u", 2), /duplicate-pair-label/);
assert.throws(() => parsePairLabels("1-3=r", 2), /invalid-pair-labels/);
assert.equal(queryContainsUrl("https://example.com/path"), true);
assert.equal(queryContainsUrl("file:///private/data"), true);
assert.equal(queryContainsUrl("chrome://settings"), true);
assert.equal(queryContainsUrl("custom-scheme://local/path"), true);
assert.equal(queryContainsUrl("localhost:3000/path"), true);
assert.equal(queryContainsUrl("127.0.0.1:8080/path"), true);
assert.equal(queryContainsUrl("example.com/path"), true);
assert.equal(queryContainsUrl("why did I visit Product Hunt?"), false);

const checkLocalOutput = async () => {
	const repo = await mkdtemp(join(tmpdir(), "tabot-labeler-repo-"));
	const outside = await mkdtemp(join(tmpdir(), "tabot-labeler-outside-"));
	try {
		const repoLink = join(outside, "repo-link");
		await symlink(repo, repoLink, "dir");
		await assert.rejects(
			resolveSafeLabelPath(repo, join(repoLink, "labels.jsonl")),
			/labels-must-stay-outside-repository/,
		);

		const inRepoFile = join(repo, "linked-labels.jsonl");
		const linkedOutput = join(outside, "labels.jsonl");
		await writeFile(inRepoFile, "");
		await symlink(inRepoFile, linkedOutput);
		await assert.rejects(
			appendLocalLabelRecord(repo, linkedOutput, { sourceId: "id" }),
		);
		assert.equal(await readFile(inRepoFile, "utf8"), "");

		const hardlinkRepoFile = join(repo, "hardlinked-labels.jsonl");
		const hardlinkOutput = join(outside, "hardlinked-labels.jsonl");
		await writeFile(hardlinkRepoFile, "original");
		await link(hardlinkRepoFile, hardlinkOutput);
		await assert.rejects(
			appendLocalLabelRecord(repo, hardlinkOutput, { sourceId: "id" }),
			/labels-must-stay-outside-repository/,
		);
		assert.equal(await readFile(hardlinkRepoFile, "utf8"), "original");

		const output = join(outside, "safe", "labels.jsonl");
		await appendLocalLabelRecord(repo, output, {
			sourceId: "event-id",
			label: "relevant",
		});
		assert.equal(
			await readFile(output, "utf8"),
			'{"sourceId":"event-id","label":"relevant"}\n',
		);
		assert.equal((await stat(output)).mode & 0o777, 0o600);
	} finally {
		await Promise.all([
			rm(repo, { recursive: true, force: true }),
			rm(outside, { recursive: true, force: true }),
		]);
	}
};

await checkLocalOutput();
console.log("local-labeler: parsing, URL exclusion, and output safety passed");
