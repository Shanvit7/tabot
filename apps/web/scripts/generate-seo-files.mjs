import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const defaultSiteUrl = "https://shanvit7.github.io/tabot";
const siteUrl = (process.env.VITE_SITE_URL || defaultSiteUrl).replace(
	/\/+$/,
	"",
);
const parsedSiteUrl = new URL(siteUrl);
if (
	parsedSiteUrl.protocol !== "https:" ||
	parsedSiteUrl.search ||
	parsedSiteUrl.hash
)
	throw new Error(
		"VITE_SITE_URL must be an HTTPS URL without query or fragment.",
	);

const publicDir = new URL("../public/", import.meta.url);
const outputDir = new URL("../.output/client/", import.meta.url);
for (const name of ["robots.txt", "sitemap.xml"]) {
	const source = readFileSync(new URL(name, publicDir), "utf8");
	const generated = source.replaceAll(defaultSiteUrl, siteUrl);
	if (generated.includes(defaultSiteUrl) && siteUrl !== defaultSiteUrl)
		throw new Error(`Failed to replace default site URL in ${name}.`);
	writeFileSync(new URL(name, outputDir), generated);
}

const sitemap = readFileSync(new URL("sitemap.xml", outputDir), "utf8");
const sitemapUrls = Array.from(
	sitemap.matchAll(/<loc>(.*?)<\/loc>/g),
	(match) => match[1],
);
assert.deepEqual(sitemapUrls, [`${siteUrl}/`, `${siteUrl}/privacy/`]);
assert.ok(
	readFileSync(new URL("robots.txt", outputDir), "utf8")
		.split(/\r?\n/)
		.includes(`Sitemap: ${siteUrl}/sitemap.xml`),
);
for (const route of [
	"home",
	"ai",
	"assistant",
	"settings",
	"mobile",
	"extension-not-connected",
]) {
	const html = readFileSync(new URL(`${route}/index.html`, outputDir), "utf8");
	assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
}

console.log(`Generated and checked SEO files for ${siteUrl}.`);
