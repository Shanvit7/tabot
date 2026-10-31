const MAX_INSPECTED_NODES = 2000;
const MAX_SCANNED_CHARS = 100_000;
const MAX_WORDS = 8000;
const MAX_SEGMENTS = 4;
const MAX_SEGMENT_CHARS = 1000;
const EXCLUDED =
	"script,style,noscript,template,svg,canvas,iframe,input,textarea,select,option,[hidden],[aria-hidden='true'],[contenteditable]:not([contenteditable='false'])";

export interface VisibleExcerptResult {
	segments: string[];
	truncated: boolean;
	partial: boolean;
}

export const selectVisibleContentRoot = (doc: Document): Element =>
	doc.querySelector("main article") ??
	doc.querySelector("article") ??
	doc.querySelector("[role='main']") ??
	doc.querySelector("main") ??
	doc.body;

const hiddenElement = (element: Element): boolean => {
	if (element.matches(EXCLUDED)) return true;
	const style = getComputedStyle(element);
	return (
		style.display === "none" ||
		style.visibility === "hidden" ||
		style.visibility === "collapse" ||
		Number(style.opacity) === 0
	);
};

const visibleWord = (
	doc: Document,
	parent: Element,
	range: Range,
	isHidden: (element: Element) => boolean,
): boolean => {
	const rect = range.getBoundingClientRect();
	if (
		rect.width <= 0 ||
		rect.height <= 0 ||
		rect.left < 0 ||
		rect.top < 0 ||
		rect.right > doc.documentElement.clientWidth ||
		rect.bottom > doc.documentElement.clientHeight
	)
		return false;
	for (
		let ancestor: Element | null = parent;
		ancestor;
		ancestor = ancestor.parentElement
	) {
		if (isHidden(ancestor)) return false;
		const style = getComputedStyle(ancestor);
		if (
			/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)
		) {
			const bounds = ancestor.getBoundingClientRect();
			if (
				rect.left < bounds.left ||
				rect.right > bounds.right ||
				rect.top < bounds.top ||
				rect.bottom > bounds.bottom
			)
				return false;
		}
		if (ancestor === doc.body) break;
	}
	const topmost = doc.elementsFromPoint(
		rect.left + rect.width / 2,
		rect.top + rect.height / 2,
	)[0];
	return !topmost || topmost === parent || topmost.contains(parent);
};

/** Read only complete words whose ranges pass viewport, clipping and occlusion checks. */
export const extractVisibleExcerpts = (
	doc: Document,
	root?: Element,
): VisibleExcerptResult => {
	const contentRoot = root ?? selectVisibleContentRoot(doc);
	if (!contentRoot) return { segments: [], truncated: false, partial: true };
	const hiddenCache = new WeakMap<Element, boolean>();
	const isHidden = (element: Element) => {
		const cached = hiddenCache.get(element);
		if (cached !== undefined) return cached;
		const hidden = hiddenElement(element);
		hiddenCache.set(element, hidden);
		return hidden;
	};
	if (isHidden(contentRoot))
		return { segments: [], truncated: false, partial: true };
	const segments: string[] = [];
	let inspected = 0;
	let scannedChars = 0;
	let words = 0;
	let truncated = false;
	const walker = doc.createTreeWalker(
		contentRoot,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
		{
			acceptNode(node) {
				if (node.nodeType === Node.ELEMENT_NODE)
					return isHidden(node as Element)
						? NodeFilter.FILTER_REJECT
						: NodeFilter.FILTER_SKIP;
				return NodeFilter.FILTER_ACCEPT;
			},
		},
	);
	while (walker.nextNode()) {
		if (
			++inspected > MAX_INSPECTED_NODES ||
			scannedChars >= MAX_SCANNED_CHARS ||
			words >= MAX_WORDS
		) {
			truncated = true;
			break;
		}
		const node = walker.currentNode;
		if (node.nodeType !== Node.TEXT_NODE || !node.parentElement) continue;
		const text = node.nodeValue ?? "";
		const remaining = MAX_SCANNED_CHARS - scannedChars;
		const bounded = text.slice(0, remaining);
		scannedChars += bounded.length;
		if (bounded.length < text.length) truncated = true;
		const matches = bounded.matchAll(/\S+/gu);
		let excerpt = "";
		const range = doc.createRange();
		for (const match of matches) {
			if (++words > MAX_WORDS) {
				truncated = true;
				break;
			}
			const start = match.index;
			const end = start + match[0].length;
			range.setStart(node, start);
			range.setEnd(node, end);
			if (!visibleWord(doc, node.parentElement, range, isHidden)) continue;
			const separator = excerpt ? " " : "";
			if (
				excerpt.length + separator.length + match[0].length >
				MAX_SEGMENT_CHARS
			) {
				truncated = true;
				break;
			}
			excerpt += separator + match[0];
		}
		if (excerpt && segments.length < MAX_SEGMENTS) segments.push(excerpt);
		else if (excerpt) truncated = true;
		if (segments.length >= MAX_SEGMENTS && walker.nextNode()) {
			truncated = true;
			break;
		}
	}
	return { segments, truncated, partial: false };
};
