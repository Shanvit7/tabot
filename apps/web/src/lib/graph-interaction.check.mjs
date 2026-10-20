import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({
	configFile: false,
	cacheDir: 'node_modules/.vite-graph-check',
	root: fileURLToPath(new URL('../../', import.meta.url)),
	resolve: { alias: { '~': fileURLToPath(new URL('../', import.meta.url)) } },
	ssr: { noExternal: ['@lobehub/icons'] },
	server: { middlewareMode: true },
	appType: 'custom',
	plugins: [
		{
			name: 'check-graph-renderer',
			enforce: 'pre',
			resolveId: (id) => (id === 'check-network' ? '\0check-network' : null),
			load: (id) =>
				id === '\0check-network'
					? 'export const NetworkGraph = (props) => { globalThis.checkNetworkProps = props; return null; };'
					: null,
			transform: (source, id) =>
				/\/lib\/(context-graph|activity-flow)\.tsx$/.test(id)
					? source.replace(/(['"])~\/lib\/network-graph\1/g, "'check-network'")
					: undefined,
		},
	],
});
try {
	const { ContextGraph } = await server.ssrLoadModule(
		'/src/lib/context-graph.tsx',
	);
	const { layoutNetwork, networkFocus } = await server.ssrLoadModule(
		'/src/lib/network-graph-data.ts',
	);
	const contexts = Array.from({ length: 60 }, (_, index) => ({
		id: String(index),
		startTimestamp: index * 60000,
		endTimestamp: (index + 1) * 60000,
		duration: 60000,
		sessionIds: [],
		domains: [{ domain: 'example.test', eventCount: 2 }],
	}));
	const props = {
		contexts,
		sessions: [],
		memories: [{ id: 'pattern', kind: 'recurrent', contextIds: ['0', '1'] }],
		assistantConnected: false,
		initialSelectedId: 'c:0',
		limits: { contexts: 60, sites: 10, memories: 1 },
	};
	renderToStaticMarkup(createElement(ContextGraph, props));
	const home = globalThis.checkNetworkProps;
	assert.equal(home.selectedId, 'c:0');
	assert.equal(
		home.data.nodes.length,
		62,
		'renderer must not add a smaller neighborhood cap',
	);
	const snapshot = JSON.stringify(home.data);
	const layout = layoutNetwork(home.data);
	assert.equal(layout.nodes.length, 62);
	assert.equal(layout.edges.length, 62);
	assert.equal(layout.layered, true);
	assert.deepEqual(
		layoutNetwork(home.data),
		layout,
		'same input must never jump to a new layout',
	);
	for (const node of layout.nodes) {
		assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
		assert.ok(node.x >= 0 && node.x + node.width <= layout.width);
		assert.ok(node.y + 44 <= layout.height);
		for (const other of layout.nodes) {
			if (node.id === other.id) continue;
			assert.ok(
				node.x + node.width <= other.x ||
					other.x + other.width <= node.x ||
					node.y + 44 <= other.y ||
					other.y + 44 <= node.y,
				'node labels and touch targets must not overlap',
			);
		}
	}
	assert.deepEqual([...networkFocus(home.data, 'm:pattern')].sort(), [
		'c:0',
		'c:1',
		'm:pattern',
	]);
	assert.equal(networkFocus(home.data, null), null);
	layout.nodes[0].x = 999;
	assert.equal(
		JSON.stringify(home.data),
		snapshot,
		'layout cannot mutate aggregates',
	);
	renderToStaticMarkup(
		createElement(ContextGraph, { ...props, query: 'no-such-place' }),
	);
	assert.equal(globalThis.checkNetworkProps.hits.size, 0);
	assert.equal(
		globalThis.checkNetworkProps.selectedId,
		null,
		'search dismisses excluded selection',
	);

	const { ActivityFlowGraph } = await server.ssrLoadModule(
		'/src/lib/activity-flow.tsx',
	);
	const flow = {
		nodes: ['one', 'two'].map((id) => ({
			id,
			label: id,
			events: 2,
			activeMs: 1000,
			visits: 1,
			days: 1,
		})),
		links: [
			{ source: 'one', target: 'two', count: 3 },
			{ source: 'two', target: 'one', count: 1 },
		],
		totalMs: 2000,
		stats: { activeDays: 1 },
	};
	const before = JSON.stringify(flow);
	renderToStaticMarkup(
		createElement(ActivityFlowGraph, { flow, assistantConnected: false }),
	);
	const activity = globalThis.checkNetworkProps;
	assert.ok(activity.data.edges.every((edge) => edge.directed));
	const directed = layoutNetwork(activity.data);
	assert.equal(directed.edges.length, 2, 'reciprocal moves remain distinct');
	assert.notEqual(directed.edges[0].path, directed.edges[1].path);
	assert.ok(directed.edges.every((edge) => !/NaN|Infinity/.test(edge.path)));
	assert.equal(JSON.stringify(flow), before);
	assert.deepEqual(layoutNetwork({ nodes: [], edges: [] }).nodes, []);
	assert.equal(
		layoutNetwork({
			...activity.data,
			edges: [{ source: 'missing', target: 'one' }],
		}).edges.length,
		0,
	);

	const dense = {
		nodes: Array.from({ length: 418 }, (_, index) => ({
			id: `${index}`,
			label: `${index}`,
			kind: index < 300 ? 'context' : index < 400 ? 'site' : 'memory',
		})),
		edges: [],
	};
	const started = performance.now();
	assert.equal(layoutNetwork(dense).nodes.length, 418);
	const elapsed = performance.now() - started;
	assert.ok(
		elapsed < 1000,
		'bounded maps must lay out without iterative physics',
	);

	// Real renderer SSR supplies usable buttons/paths, not a WebGL loading screen.
	const { NetworkGraph } = await server.ssrLoadModule(
		'/src/lib/network-graph.tsx',
	);
	const render = (overrides = {}) =>
		renderToStaticMarkup(
			createElement(NetworkGraph, {
				...home,
				label: 'Activity graph',
				...overrides,
			}),
		);
	const html = render();
	assert.ok(html.includes('Select a graph node'));
	assert.ok(html.includes('Zoom in') && html.includes('Fit graph'));
	assert.ok(html.includes('aria-pressed="true"'));
	assert.equal((html.match(/data-node-id=/g) ?? []).length, 62);
	assert.doesNotMatch(html, /<canvas|Loading graph|hardware acceleration/);
	assert.match(html, /Browsing stretches/);
	assert.match(render({ hits: new Set(), selectedId: null }), /0 matches/);
	assert.match(
		render({ data: { nodes: [], edges: [] }, selectedId: null }),
		/No browsing in this map yet/,
	);
	const arrows = render({ ...activity });
	assert.equal((arrows.match(/marker-end=/g) ?? []).length, 2);
	console.log(
		`graph-interaction.check: passed; 418-node layout ${elapsed.toFixed(2)}ms`,
	);
} finally {
	delete globalThis.checkNetworkProps;
	await server.close();
}
