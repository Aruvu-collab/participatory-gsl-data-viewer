// Receives a contribution from ContributeMode, checks it against the project's
// taxonomy and bounds, and saves it through PostgREST (/rpc/submit). The database
// checks the invite code, rate limit and mapping area again, and stores the row
// as pending. Secrets: PGSL_API_URL, PGSL_API_JWT.
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { loadContributeConfig } from '$lib/contribute/load';
import { validateSubmission, type SubmissionInput } from '$lib/contribute/validate';
import type { RequestHandler } from './$types';

const MAX_BODY = 50_000;

export const POST: RequestHandler = async ({ request }) => {
	if (!env.PGSL_API_URL || !env.PGSL_API_JWT) {
		console.error('contribute: PGSL_API_URL / PGSL_API_JWT not set');
		error(503, 'Contributions are not available right now');
	}

	const text = await request.text();
	if (text.length > MAX_BODY) error(413, 'Submission is too large');
	let body: SubmissionInput;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Invalid request');
	}

	// Honeypot: bots fill every field. Pretend it worked, save nothing.
	if (body.website) return json({ ok: true });

	if (typeof body.slug !== 'string' || !/^[a-z0-9-]+$/.test(body.slug)) error(400, 'Unknown project');
	const config = await loadContributeConfig(body.slug);
	if (!config?.taxonomyData) error(404, 'Contributions are not enabled for this map');

	const v = validateSubmission(body, config.taxonomyData, config.bounds);
	if (!v.ok) error(400, v.error);

	let res: Response;
	try {
		res = await fetch(`${env.PGSL_API_URL.replace(/\/$/, '')}/rpc/submit`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.PGSL_API_JWT}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ p_project: body.slug, ...v.payload }),
			signal: AbortSignal.timeout(10_000)
		});
	} catch (err) {
		console.error('contribute: PostgREST unreachable', err);
		error(502, 'Could not save right now, please try again');
	}

	const result = await res.json().catch(() => null);
	if (res.ok) return json({ ok: true, id: result?.id ?? null });

	// 4xx from the database (bad invite code, rate limit, invalid shape) go to the user;
	// anything else is logged and hidden.
	// Database check constraints (geom_valid / geom_type): self-crossing or broken shapes
	if (result?.code === '23514') error(400, 'The shape is invalid (for example, its edges cross). Please redraw it.');
	// 401 and 42501 (permission denied) mean the JWT or grants are wrong: a setup problem, not the user's.
	if (res.status >= 400 && res.status < 500 && res.status !== 401 && result?.code !== '42501') {
		error(res.status, result?.message ?? 'Submission was rejected');
	}
	console.error('contribute: PostgREST error', res.status, result);
	error(502, 'Could not save right now, please try again');
};
