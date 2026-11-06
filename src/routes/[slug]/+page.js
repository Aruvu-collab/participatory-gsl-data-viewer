// Layer presets live in src/lib/presets/<name>.json. A page config layer
// `{ "preset": "osm-pois", "order": 9 }` is replaced by the preset, with the
// page's own fields taking precedence. A preset with a "layers" array is a
// bundle: it expands into several layers, and the page's fields (e.g.
// "visible") are applied to each of them; "order" shifts the bundle as a whole.
const presets = import.meta.glob('../../lib/presets/*.json', { import: 'default' });

async function expandPreset(layer) {
	if (!layer.preset) return [layer];
	const load = presets[`../../lib/presets/${layer.preset}.json`];
	if (!load) {
		console.warn(`Unknown layer preset "${layer.preset}", layer skipped`);
		return [];
	}
	/** @type {any} */
	const preset = structuredClone(await load());
	const { preset: _name, ...overrides } = layer;
	if (!preset.layers) return [{ ...preset, ...overrides }];
	// Bundle: a page "order" moves the whole bundle, keeping members'
	// spacing (e.g. roads stay just above the satellite imagery)
	const { order, ...rest } = overrides;
	const base = preset.layers[0].order ?? 0;
	return preset.layers.map((member) => ({
		...member,
		...rest,
		...(order != null && { order: order + ((member.order ?? base) - base) })
	}));
}

export const load = async ({ params }) => {
	// read file with slug name
	// const path = `${PUBLIC_SITE_URL}/contents/${params.slug}.json`;
	// console.log(path);
	// const file = await fetch(path).then(res => res.json());
	const file = await import(`../../lib/contents/${params.slug}.json`);
	const content = JSON.parse(JSON.stringify(file));
	content.layers = (await Promise.all(content.layers.map(expandPreset))).flat();
	return {
		slug: params.slug,
		content
	};
};
