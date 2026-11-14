// Layer presets live in src/lib/presets/<name>.json. A page config layer
// `{ "preset": "osm-pois", "order": 9 }` is replaced by the preset, with the
// page's own fields taking precedence. A preset with a "layers" array is a
// bundle: it expands into several layers, and the page's fields (e.g.
// "visible") are applied to each of them; "order" shifts the bundle as a whole.
import { loadTaxonomy } from '$lib/contribute/load';
import { applyTaxonomyStyle } from '$lib/contribute/style';

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
	// "contribute": { "taxonomy": "<name>" } loads src/lib/contents/taxonomies/<name>.json
	if (content.contribute?.enabled && content.contribute.taxonomy) {
		const taxonomy = await loadTaxonomy(content.contribute.taxonomy);
		if (taxonomy) {
			content.contribute.taxonomyData = taxonomy;
			// Layers with "taxonomy_style" get colours, labels, legend and popup names from the taxonomy
			content.layers = content.layers.map((/** @type {any} */ l) => applyTaxonomyStyle(l, taxonomy));
		} else {
			console.warn(`Unknown taxonomy "${content.contribute.taxonomy}", contributions disabled`);
			content.contribute.enabled = false;
		}
	}
	return {
		slug: params.slug,
		content
	};
};
