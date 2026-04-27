import { redirect, type RequestHandler } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth-cookies';
import { deleteSession } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const sid = cookies.get(SESSION_COOKIE);
	if (sid) {
		try {
			await deleteSession(sid);
		} catch {
			// session row may already be gone (TTL or earlier delete) — ignore
		}
		cookies.delete(SESSION_COOKIE, { path: '/' });
	}
	redirect(303, '/');
};
