// Checks an invite code without using it and records that this browser tab is
// editing with it (PostgREST /rpc/token_session). Returns the session name, expiry,
// uses, edits made with the code and how many people are editing with it now.
// ContributeMode calls this when Contribute opens, every 30 s while editing, and
// with leave: true (via sendBeacon) when the tab stops editing.
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { TokenInfo } from '$lib/contribute/validate';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ request }) => {
	if (!env.PGSL_API_URL || !env.PGSL_API_JWT) error(503, 'Contributions are not available right now');

	const body = await request.json().catch(() => null);
	const slug = body?.slug;
	const token = typeof body?.token === 'string' ? body.token.trim().toUpperCase() : '';
	const client = body?.client;
	if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) error(400, 'Unknown project');
	if (!token || token.length > 64) error(400, 'Invite code is missing');
	if (typeof client !== 'string' || !UUID.test(client)) error(400, 'Invalid request');

	let res: Response;
	try {
		res = await fetch(`${env.PGSL_API_URL.replace(/\/$/, '')}/rpc/token_session`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.PGSL_API_JWT}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ p_project: slug, p_token: token, p_client: client, p_leave: body?.leave === true }),
			signal: AbortSignal.timeout(8_000)
		});
	} catch (err) {
		console.error('contribute/token: PostgREST unreachable', err);
		error(502, 'Could not check the invite code right now');
	}

	const info = (await res.json().catch(() => null)) as TokenInfo | null;
	if (!res.ok || !info) {
		console.error('contribute/token: PostgREST error', res.status, info);
		error(502, 'Could not check the invite code right now');
	}
	return json(info);
};
