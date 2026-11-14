// Shared checks for contributions. Runs in the browser (instant feedback) and in
// /api/contribute (the real check). Nothing project-specific lives here: the
// project's taxonomy and bounds are passed in.

export type GeomKind = 'point' | 'line' | 'polygon';

export interface Subtype {
	label: string;
	osm?: Record<string, string>;
}
export interface TaxonomyClass {
	label: string;
	color?: string;
	geoms: GeomKind[];
	subtypes: Record<string, Subtype>;
}
export interface Taxonomy {
	name?: string;
	states?: Record<string, string>;
	classes: Record<string, TaxonomyClass>;
}
/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

export interface ContributeConfig {
	enabled: boolean;
	taxonomy: string;
	bounds: Bounds;
	pending_layer?: string;
	taxonomyData?: Taxonomy;
}

export interface SubmissionInput {
	slug?: string;
	token?: string;
	geometry?: any;
	one_class?: string;
	subtype?: string | null;
	one_state?: string | null;
	local_name?: string | null;
	notes?: string | null;
	author_name?: string | null;
	website?: string | null; // honeypot
}

/** Arguments for PostgREST /rpc/submit (p_project is added by the server) */
export interface SubmitPayload {
	p_token: string;
	p_layer: string;
	p_geojson: any;
	p_one_class: string;
	p_subtype: string | null;
	p_one_state: string | null;
	p_tags: Record<string, string>;
	p_local_name: string | null;
	p_notes: string | null;
	p_author_name: string;
}

export const GEOM_TO_LAYER: Record<GeomKind, string> = {
	point: 'one_points',
	line: 'one_lines',
	polygon: 'one_patches'
};

const GEOJSON_KIND: Record<string, GeomKind> = {
	Point: 'point',
	LineString: 'line',
	Polygon: 'polygon'
};

export const LIMITS = { author: 120, local: 200, notes: 1000, vertices: 2000 };

export function geomKind(geometry: any): GeomKind | null {
	return GEOJSON_KIND[geometry?.type] ?? null;
}

/** Classes that allow this kind of geometry, as [key, class] pairs */
export function classesFor(taxonomy: Taxonomy, kind: GeomKind) {
	return Object.entries(taxonomy.classes).filter(([, c]) => c.geoms.includes(kind));
}

export function buildTags(
	taxonomy: Taxonomy,
	cls: string,
	subtype: string | null,
	state: string | null,
	localName: string | null
): Record<string, string> {
	const tags: Record<string, string> = { ...(subtype ? taxonomy.classes[cls]?.subtypes[subtype]?.osm : {}) };
	tags['one:class'] = cls;
	if (state) tags['one:state'] = state;
	if (localName) tags['local_name'] = localName;
	return tags;
}

function clean(v: unknown, max: number): string | null {
	if (typeof v !== 'string') return null;
	const s = v.trim();
	return s ? s.slice(0, max) : null;
}

/** Positions of the geometry, or null if the shape is malformed */
function positions(geometry: any, kind: GeomKind): number[][] | null {
	const c = geometry.coordinates;
	if (!Array.isArray(c)) return null;
	if (kind === 'point') return [c];
	if (kind === 'line') return c.length >= 2 ? c : null;
	// polygon: closed rings of at least 4 positions
	if (!c.length) return null;
	for (const ring of c) {
		if (!Array.isArray(ring) || ring.length < 4) return null;
		const [a, b] = [ring[0], ring[ring.length - 1]];
		if (!Array.isArray(a) || !Array.isArray(b) || a[0] !== b[0] || a[1] !== b[1]) return null;
	}
	return c.flat();
}

export function validateSubmission(
	body: SubmissionInput,
	taxonomy: Taxonomy,
	bounds: Bounds
): { ok: true; payload: SubmitPayload } | { ok: false; error: string } {
	const fail = (error: string) => ({ ok: false as const, error });

	if (!body || typeof body !== 'object') return fail('Invalid request');
	if (typeof body.token !== 'string' || !body.token.trim()) return fail('Invite code is missing');

	const kind = geomKind(body.geometry);
	if (!kind) return fail('Draw a point, line or area');
	const pts = positions(body.geometry, kind);
	if (!pts) return fail('The drawn shape is incomplete');
	if (pts.length > LIMITS.vertices) return fail('The drawn shape has too many points');
	const [w, s, e, n] = bounds;
	for (const p of pts) {
		if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
			return fail('The drawn shape has invalid coordinates');
		if (p[0] < w || p[0] > e || p[1] < s || p[1] > n) return fail('The drawing is outside the mapping area');
	}

	const cls = typeof body.one_class === 'string' ? taxonomy.classes[body.one_class] : undefined;
	if (!cls) return fail('Choose a feature class');
	if (!cls.geoms.includes(kind)) return fail(`"${cls.label}" can't be mapped as a ${kind}`);

	const subtype = body.subtype || null;
	if (subtype && !cls.subtypes[subtype]) return fail('Choose a type from the list');

	const state = body.one_state || null;
	if (state && !(taxonomy.states && state in taxonomy.states)) return fail('Choose a condition from the list');

	const author = clean(body.author_name, LIMITS.author);
	if (!author) return fail('Author name is required');
	const local = clean(body.local_name, LIMITS.local);
	const notes = clean(body.notes, LIMITS.notes);
	const oneClass = body.one_class as string;

	return {
		ok: true,
		payload: {
			p_token: body.token.trim(),
			p_layer: GEOM_TO_LAYER[kind],
			p_geojson: { type: body.geometry.type, coordinates: body.geometry.coordinates },
			p_one_class: oneClass,
			p_subtype: subtype,
			p_one_state: state,
			p_tags: buildTags(taxonomy, oneClass, subtype, state, local),
			p_local_name: local,
			p_notes: notes,
			p_author_name: author
		}
	};
}
