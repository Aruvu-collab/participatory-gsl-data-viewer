// Loads a project's contribute config and its taxonomy by name. Used by the
// page loader and by /api/contribute, so the server never trusts a taxonomy
// sent from the browser.
import type { ContributeConfig, Taxonomy } from './validate';

const taxonomies = import.meta.glob('../contents/taxonomies/*.json', { import: 'default' });
const contents = import.meta.glob('../contents/*.json', { import: 'default' });

export async function loadTaxonomy(name: string): Promise<Taxonomy | null> {
	const load = taxonomies[`../contents/taxonomies/${name}.json`];
	return load ? ((await load()) as Taxonomy) : null;
}

/** The project's contribute config with its taxonomy attached, or null if contributions are off */
export async function loadContributeConfig(slug: string): Promise<ContributeConfig | null> {
	const load = contents[`../contents/${slug}.json`];
	if (!load) return null;
	const content = (await load()) as { contribute?: ContributeConfig };
	const config = content.contribute;
	if (!config?.enabled || !config.taxonomy || !config.bounds) return null;
	const taxonomyData = await loadTaxonomy(config.taxonomy);
	if (!taxonomyData) return null;
	return { ...config, taxonomyData };
}
