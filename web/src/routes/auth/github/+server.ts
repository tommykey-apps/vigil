import { redirect, type RequestHandler } from '@sveltejs/kit';
import { NEXT_COOKIE, STATE_COOKIE, VERIFIER_COOKIE, shortOpts } from '$lib/server/auth-cookies';
import { buildAuthorizeUrl } from '$lib/server/github';
import { newState, newVerifier } from '$lib/server/pkce';

export const GET: RequestHandler = ({ url, cookies }) => {
	const state = newState();
	const verifier = newVerifier();
	cookies.set(STATE_COOKIE, state, shortOpts());
	cookies.set(VERIFIER_COOKIE, verifier, shortOpts());

	const next = url.searchParams.get('next');
	if (next && next.startsWith('/') && !next.startsWith('//')) {
		cookies.set(NEXT_COOKIE, next, shortOpts());
	}

	redirect(303, buildAuthorizeUrl(state, verifier));
};
