import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { redirect, type RequestHandler } from '@sveltejs/kit';
import {
	NEXT_COOKIE,
	SESSION_COOKIE,
	STATE_COOKIE,
	VERIFIER_COOKIE,
	sessionOpts,
	shortOpts
} from '$lib/server/auth-cookies';
import { exchangeCode, fetchUser } from '$lib/server/github';
import { createSession, upsertUser } from '$lib/server/session';

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

const clearShort = (cookies: import('@sveltejs/kit').Cookies) => {
	cookies.delete(STATE_COOKIE, { path: '/' });
	cookies.delete(VERIFIER_COOKIE, { path: '/' });
	cookies.delete(NEXT_COOKIE, { path: '/' });
};

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const stateCookie = cookies.get(STATE_COOKIE);
	const verifier = cookies.get(VERIFIER_COOKIE);

	if (!code || !state || !stateCookie || !safeEqual(state, stateCookie)) {
		clearShort(cookies);
		redirect(303, '/?error=auth_state');
	}
	if (!verifier) {
		clearShort(cookies);
		redirect(303, '/?error=auth_verifier');
	}

	let accessToken: string;
	try {
		accessToken = await exchangeCode(code, verifier);
	} catch {
		clearShort(cookies);
		redirect(303, '/?error=auth_code');
	}

	let user;
	try {
		user = await fetchUser(accessToken);
	} catch {
		clearShort(cookies);
		redirect(303, '/?error=auth_user');
	}

	await upsertUser(user.id, user.login, user.email);
	const sessionId = await createSession(user.id);
	cookies.set(SESSION_COOKIE, sessionId, sessionOpts());

	const next = cookies.get(NEXT_COOKIE);
	clearShort(cookies);
	const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
	redirect(303, dest);
};
