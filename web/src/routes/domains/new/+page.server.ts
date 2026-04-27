import { fail, redirect, type Actions } from '@sveltejs/kit';
import { createDomain, DomainExistsError } from '$lib/server/domain-repo';
import { DomainValidationError, validateHostname } from '$lib/server/domain-validation';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const fd = await request.formData();
		const raw = String(fd.get('hostname') ?? '');

		let hostname: string;
		try {
			hostname = validateHostname(raw);
		} catch (e) {
			const message = e instanceof DomainValidationError ? e.message : 'invalid hostname';
			return fail(400, { hostname: raw, error: `無効なドメイン名です (${message})` });
		}

		try {
			await createDomain(locals.user!.id, hostname);
		} catch (e) {
			if (e instanceof DomainExistsError) {
				return fail(409, { hostname: raw, error: '既に登録済みです' });
			}
			throw e;
		}

		redirect(303, `/domains/${encodeURIComponent(hostname)}`);
	}
};
