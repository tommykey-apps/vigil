import type { Cookies } from '@sveltejs/kit';

type CookieOpts = Parameters<Cookies['set']>[2];

export const SESSION_COOKIE = 'vigil_session';
export const STATE_COOKIE = 'vigil_oauth_state';
export const VERIFIER_COOKIE = 'vigil_oauth_verifier';
export const NEXT_COOKIE = 'vigil_oauth_next';

const isProd = () => process.env.NODE_ENV === 'production';

const base = (): CookieOpts => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	secure: isProd()
});

export const sessionOpts = (): CookieOpts => ({
	...base(),
	maxAge: 14 * 24 * 3600
});

export const shortOpts = (): CookieOpts => ({
	...base(),
	maxAge: 600
});
