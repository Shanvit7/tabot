"use client";

// Dev-only performance inspector (react-scan). Runs at module eval like the
// old CDN script's beforeInteractive, and is tree-shaken from prod builds.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
	import("react-scan").then(({ scan }) => scan({ enabled: true }));
}

export default function ReactScan() {
	return null;
}
