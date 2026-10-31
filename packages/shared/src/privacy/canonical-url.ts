const TRACKING_PARAM =
	/^(utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref_src)$/i;

export const canonicalPageUrl = (raw: string): string => {
	const url = new URL(raw);
	url.hash = "";
	for (const key of [...url.searchParams.keys()])
		if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
	return url.toString();
};
