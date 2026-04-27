const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export class DomainValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DomainValidationError';
	}
}

export function normalizeHostname(input: string): string {
	const trimmed = input.trim().toLowerCase().replace(/\.$/, '');
	if (!trimmed) throw new DomainValidationError('empty hostname');
	let url: URL;
	try {
		url = new URL(`https://${trimmed}`);
	} catch {
		throw new DomainValidationError('invalid hostname');
	}
	// path / port / userinfo を弾く: URL parse 後の hostname のみが入力と一致すべき
	if (url.hostname !== trimmed || url.pathname !== '/' || url.search !== '' || url.username !== '') {
		throw new DomainValidationError('invalid hostname');
	}
	return url.hostname;
}

export function validateHostname(input: string): string {
	const norm = normalizeHostname(input);
	if (norm.length > 253) throw new DomainValidationError('hostname too long');
	if (!HOSTNAME_RE.test(norm)) throw new DomainValidationError('invalid hostname format');
	if (norm.split('.').some((label) => label.length > 63))
		throw new DomainValidationError('label too long');
	return norm;
}
