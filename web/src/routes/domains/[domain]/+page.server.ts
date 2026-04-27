import { error, fail, redirect } from '@sveltejs/kit';
import { lookupTxt } from '$lib/server/doh';
import { deleteDomain, getDomain, markVerified, regenToken } from '$lib/server/domain-repo';
import { DomainValidationError, validateHostname } from '$lib/server/domain-validation';
import type { Actions, PageServerLoad } from './$types';

function safeValidate(raw: string): string {
	try {
		return validateHostname(raw);
	} catch (e) {
		if (e instanceof DomainValidationError) error(404, 'not found');
		throw e;
	}
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const hostname = safeValidate(params.domain);
	const row = await getDomain(locals.user!.id, hostname);
	if (!row) error(404, 'not found');
	return { domain: row };
};

export const actions: Actions = {
	verify: async ({ locals, params }) => {
		const hostname = safeValidate(params.domain);
		const row = await getDomain(locals.user!.id, hostname);
		if (!row) error(404, 'not found');

		if (row.verified_at) return { ok: true, alreadyVerified: true };
		if (!row.verify_token || !row.verify_token_expires_at) {
			return fail(400, { error: 'token がありません。再発行してください。', expired: true });
		}
		if (row.verify_token_expires_at < Math.floor(Date.now() / 1000)) {
			return fail(410, { error: 'token が期限切れです。再発行してください。', expired: true });
		}

		const expected = `vigil-verify=${row.verify_token}`;
		let txts: string[];
		try {
			txts = await lookupTxt(`_vigil-challenge.${hostname}`);
		} catch {
			return fail(502, { error: 'DNS lookup に失敗しました。数秒待って再試行してください。' });
		}

		if (!txts.some((t) => t === expected)) {
			return fail(400, {
				error: 'TXT が一致しません。propagation を待って再試行してください。',
				seen: txts
			});
		}

		await markVerified(locals.user!.id, hostname);
		return { ok: true };
	},

	regen: async ({ locals, params }) => {
		const hostname = safeValidate(params.domain);
		await regenToken(locals.user!.id, hostname);
		return { ok: true, regenerated: true };
	},

	delete: async ({ locals, params }) => {
		const hostname = safeValidate(params.domain);
		await deleteDomain(locals.user!.id, hostname);
		redirect(303, '/');
	}
};
