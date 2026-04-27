import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth-cookies';
import { getSessionUser } from '$lib/server/session';

const PUBLIC_ROUTES = [/^\/auth\//, /^\/healthz$/];

export const handle: Handle = async ({ event, resolve }) => {
	const sid = event.cookies.get(SESSION_COOKIE);
	event.locals.user = sid ? await getSessionUser(sid) : null;

	const path = event.url.pathname;
	const isPublic = PUBLIC_ROUTES.some((re) => re.test(path));

	if (!event.locals.user && !isPublic) {
		const next = encodeURIComponent(path + event.url.search);
		redirect(303, `/auth/github?next=${next}`);
	}

	return resolve(event);
};
