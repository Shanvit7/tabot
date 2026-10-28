const { copyFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

module.exports = () => {
	const output = process.env.NODE_ENV === 'production' ? 'chrome-mv3-prod' : 'chrome-mv3-dev';
	const directory = resolve('build', output);
	mkdirSync(directory, { recursive: true });
	copyFileSync('node_modules/@taladb/web/pkg/taladb_web_bg.wasm', resolve(directory, 'taladb_web_bg.wasm'));
};
