import type { ActivitySearchResult, HistorySearchResult } from "@tabot/shared";

export const SEARCH_DEMO_DURATION = 20 * 30;
export const SEARCH_QUERY = "Search on Acme company";
export const CHATGPT_SEARCH_ANSWER = "Found 2 pages on Acme company.";

const profileTime = Date.UTC(2026, 10, 12, 14, 10);
const marketTime = Date.UTC(2026, 10, 12, 14, 25);

// MCP receives site-level activity references; page title and excerpt stay in local Tabot search.
export const CHATGPT_SEARCH_RESULTS = [
	{
		site: "https://acme.example",
		firstSeen: profileTime,
		lastSeen: profileTime,
		eventCount: 1,
		pageCount: 1,
		matchedFrom: ["auto-snippet"],
		matchedTerms: ["acme", "company"],
		anchors: [
			{
				kind: "page",
				id: "demo-acme-company-profile",
				timestamp: profileTime,
			},
		],
	},
	{
		site: "https://market-brief.example",
		firstSeen: marketTime,
		lastSeen: marketTime,
		eventCount: 1,
		pageCount: 1,
		matchedFrom: ["auto-snippet"],
		matchedTerms: ["acme", "company"],
		anchors: [
			{
				kind: "page",
				id: "demo-acme-market-profile",
				timestamp: marketTime,
			},
		],
	},
] satisfies ActivitySearchResult[];

export const TABOT_SEARCH_RESULTS = [
	{
		url: "https://acme.example/company-overview",
		host: "acme.example",
		firstSeen: profileTime,
		lastSeen: profileTime,
		eventCount: 1,
		pageCount: 1,
		estimatedActiveMs: 12 * 60_000,
		excerpt:
			"Acme is a manufacturing company focused on industrial safety and workplace equipment.",
		pageExcerptAvailable: true,
		pageTitle: "Acme Company | About",
		evidenceKinds: ["auto-snippet"],
		matchedTerms: ["acme", "company"],
		sources: [
			{
				kind: "page",
				id: "demo-acme-company-profile",
				timestamp: profileTime,
				url: "https://acme.example/company-overview",
				evidenceKind: "auto-snippet",
			},
		],
		sourceCount: 1,
		score: 0.98,
	},
	{
		url: "https://market-brief.example/acme-company-profile",
		host: "market-brief.example",
		firstSeen: marketTime,
		lastSeen: marketTime,
		eventCount: 1,
		pageCount: 1,
		estimatedActiveMs: 6 * 60_000,
		excerpt:
			"Company overview, key products, and recent updates from Acme’s manufacturing operations.",
		pageExcerptAvailable: true,
		pageTitle: "Acme Company Profile",
		evidenceKinds: ["auto-snippet"],
		matchedTerms: ["acme", "company"],
		sources: [
			{
				kind: "page",
				id: "demo-acme-market-profile",
				timestamp: marketTime,
				url: "https://market-brief.example/acme-company-profile",
				evidenceKind: "auto-snippet",
			},
		],
		sourceCount: 1,
		score: 0.91,
	},
] satisfies HistorySearchResult[];

export const TABOT_SEARCH_COUNTS = {
	Everything: 4,
	Sites: 2,
	Pages: TABOT_SEARCH_RESULTS.length,
	Notes: 0,
};

export const getTabotSearchStage = (frame: number) => {
	if (frame < 130) return "search";
	if (frame < 175) return "results";
	if (frame < 220) return "select-pages";
	if (frame < 300) return "period";
	return "pages";
};
