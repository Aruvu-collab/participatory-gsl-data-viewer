// Builds map styling, labels, legend entries and popup labels for contribution
// layers from the project's taxonomy, so colours and names live in one place.
// A page layer opts in with "taxonomy_style": "area" | "line" | "point" | "pending".
import type { Taxonomy } from './validate';

export type TaxonomyStyle = 'area' | 'line' | 'point' | 'pending';

const FALLBACK = '#666666';
const PENDING = '#fb8c00';

/** ["match", ["get", prop], k1, v1, ..., fallback], or just the fallback if there are no entries */
function matchExpr(prop: string, pairs: [string, string][], fallback: unknown) {
	if (pairs.length === 0) return fallback;
	return ['match', ['get', prop], ...pairs.flat(), fallback];
}

export function classColorExpr(taxonomy: Taxonomy) {
	const pairs = Object.entries(taxonomy.classes).map(
		([key, c]) => [key, c.color ?? FALLBACK] as [string, string]
	);
	return matchExpr('one_class', pairs, FALLBACK);
}

/** Local name if given, otherwise the readable subtype name, otherwise the raw code */
export function labelExpr(taxonomy: Taxonomy) {
	const pairs: [string, string][] = [];
	const seen = new Set<string>();
	for (const c of Object.values(taxonomy.classes)) {
		for (const [key, s] of Object.entries(c.subtypes ?? {})) {
			if (seen.has(key)) continue; // a match expression may not repeat a label
			seen.add(key);
			pairs.push([key, s.label]);
		}
	}
	return [
		'coalesce',
		['get', 'local_name'],
		matchExpr('subtype', pairs, ['coalesce', ['get', 'subtype'], ''])
	];
}

// Fields every popup lists, in order, even when blank ("Not recorded").
// The pending view publishes fewer columns, so it gets its own list.
const POPUP_FIELDS: Record<TaxonomyStyle, string[]> = {
	area: ['one_class', 'subtype', 'one_state', 'local_name', 'author_name', 'notes', 'submitted_at'],
	line: ['one_class', 'subtype', 'one_state', 'local_name', 'author_name', 'notes', 'submitted_at'],
	point: ['one_class', 'subtype', 'one_state', 'local_name', 'author_name', 'notes', 'submitted_at'],
	pending: ['layer', 'one_class', 'subtype', 'author_name', 'notes', 'submitted_at']
};

export function popupConfig(taxonomy: Taxonomy, style?: TaxonomyStyle) {
	const classes: Record<string, string> = {};
	const subtypes: Record<string, string> = {};
	for (const [ck, c] of Object.entries(taxonomy.classes)) {
		classes[ck] = c.label;
		for (const [sk, s] of Object.entries(c.subtypes ?? {})) subtypes[sk] = s.label;
	}
	return {
		// "tags" (JSON) is not shown raw; its OSM tags are listed separately via `tags`
		hide: ['tags', 'project', 'id'],
		tags: 'tags',
		fields: style ? POPUP_FIELDS[style] : [],
		labels: {
			one_class: 'Class',
			subtype: 'Type',
			one_state: 'State',
			local_name: 'Local name',
			author_name: 'Mapped by',
			notes: 'Notes',
			submitted_at: 'Submitted',
			layer: 'Geometry'
		},
		values: {
			one_class: classes,
			subtype: subtypes,
			one_state: { ...(taxonomy.states ?? {}) },
			layer: { one_patches: 'Area', one_lines: 'Line', one_points: 'Point' }
		}
	};
}

const geomFilter = (op: '==' | '!=', type: string) => [op, ['geometry-type'], type];

function layersSpec(style: TaxonomyStyle, color: unknown) {
	switch (style) {
		case 'area':
			return [
				{ type: 'fill', paint: { 'fill-color': color, 'fill-opacity': 0.3 } },
				{ type: 'line', paint: { 'line-color': color, 'line-width': 2 } }
			];
		case 'line':
			return [{ type: 'line', paint: { 'line-color': color, 'line-width': 3 } }];
		case 'point':
			return [
				{
					type: 'circle',
					paint: {
						'circle-color': color,
						'circle-radius': 6,
						'circle-stroke-width': 2,
						'circle-stroke-color': '#ffffff'
					}
				}
			];
		case 'pending':
			return [
				{
					type: 'fill',
					filter: geomFilter('==', 'Polygon'),
					paint: { 'fill-color': PENDING, 'fill-opacity': 0.12 }
				},
				{
					type: 'line',
					filter: geomFilter('!=', 'Point'),
					paint: { 'line-color': PENDING, 'line-width': 2, 'line-dasharray': [2, 2] }
				},
				{
					type: 'circle',
					filter: geomFilter('==', 'Point'),
					paint: {
						'circle-color': '#ffffff',
						'circle-radius': 5,
						'circle-stroke-width': 2,
						'circle-stroke-color': PENDING
					}
				}
			];
	}
}

const LABEL_LAYOUT: Record<TaxonomyStyle, Record<string, unknown>> = {
	area: { 'text-size': 12 },
	line: { 'text-size': 12, 'symbol-placement': 'line' },
	point: { 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.9] },
	pending: {}
};

/**
 * Returns the layer with layers_spec, label, legend_items and popup filled in
 * from the taxonomy. Fields the page config sets explicitly are kept.
 */
export function applyTaxonomyStyle(layer: any, taxonomy: Taxonomy | undefined | null) {
	const style = layer?.taxonomy_style as TaxonomyStyle | undefined;
	if (!style || !taxonomy) return layer;
	if (!['area', 'line', 'point', 'pending'].includes(style)) {
		console.warn(`Layer "${layer.name}": unknown taxonomy_style "${style}"`);
		return layer;
	}
	const isPending = style === 'pending';
	const color = classColorExpr(taxonomy);
	const legendItems = isPending
		? [{ label: 'Waiting for review', color: PENDING }]
		: Object.values(taxonomy.classes).map((c) => ({ label: c.label, color: c.color ?? FALLBACK }));

	return {
		color: isPending ? PENDING : undefined,
		...layer,
		geometry_type:
			layer.geometry_type ??
			(style === 'area' ? 'polygon' : style === 'line' ? 'line' : style === 'point' ? 'point' : undefined),
		layers_spec: layer.layers_spec ?? layersSpec(style, color),
		...(!isPending && {
			label: layer.label ?? labelExpr(taxonomy),
			style: {
				...layer.style,
				symbol_layout: layer.style?.symbol_layout ?? LABEL_LAYOUT[style]
			}
		}),
		legend_items: layer.legend_items ?? legendItems,
		popup: layer.popup ?? popupConfig(taxonomy, style)
	};
}
