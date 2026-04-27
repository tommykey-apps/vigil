import type { PageServerLoad } from './$types';
import { listDomains } from '$lib/server/domain-repo';

export const load: PageServerLoad = async ({ locals }) => {
	const domains = await listDomains(locals.user!.id);
	return {
		user: locals.user,
		domains
	};
};
