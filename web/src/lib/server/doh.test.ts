import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupTxt, unquoteTxt } from './doh';

describe('unquoteTxt', () => {
	it('joins multiple quoted segments', () => {
		expect(unquoteTxt('"vigil-verify=abc" "def"')).toBe('vigil-verify=abcdef');
	});
	it('unescapes escaped chars', () => {
		expect(unquoteTxt('"a\\"b"')).toBe('a"b');
	});
	it('returns input as-is when no quotes are present', () => {
		expect(unquoteTxt('plain')).toBe('plain');
	});
});

describe('lookupTxt', () => {
	const realFetch = globalThis.fetch;
	let calls: string[] = [];

	beforeEach(() => {
		calls = [];
	});
	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
	});

	const respond = (body: unknown, ok = true, status = 200) =>
		new Response(JSON.stringify(body), {
			status: ok ? 200 : status,
			headers: { 'content-type': 'application/json' }
		});

	it('uses Cloudflare on first try and returns parsed TXT', async () => {
		globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
			calls.push(String(input));
			return respond({
				Status: 0,
				Answer: [{ type: 16, data: '"vigil-verify=token"' }]
			});
		}) as typeof fetch;

		const txts = await lookupTxt('_vigil-challenge.example.com');
		expect(txts).toEqual(['vigil-verify=token']);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain('cloudflare-dns.com');
	});

	it('falls back to Google when Cloudflare returns Status != 0', async () => {
		globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			calls.push(url);
			if (url.includes('cloudflare-dns.com')) {
				return respond({ Status: 2, Answer: [] }); // SERVFAIL
			}
			return respond({ Status: 0, Answer: [{ type: 16, data: '"from-google"' }] });
		}) as typeof fetch;

		const txts = await lookupTxt('example.com');
		expect(txts).toEqual(['from-google']);
		expect(calls).toHaveLength(2);
		expect(calls[1]).toContain('dns.google');
	});

	it('falls back to Google when Cloudflare fetch throws', async () => {
		globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes('cloudflare-dns.com')) throw new Error('network down');
			return respond({ Status: 0, Answer: [{ type: 16, data: '"recovered"' }] });
		}) as typeof fetch;

		const txts = await lookupTxt('example.com');
		expect(txts).toEqual(['recovered']);
	});

	it('throws when Google also fails (Status != 0)', async () => {
		globalThis.fetch = vi.fn(async () =>
			respond({ Status: 2 })
		) as typeof fetch;
		await expect(lookupTxt('example.com')).rejects.toThrow();
	});

	it('filters out non-TXT answers (CNAME, etc.)', async () => {
		globalThis.fetch = vi.fn(async () =>
			respond({
				Status: 0,
				Answer: [
					{ type: 5, data: 'cname.example.com.' },
					{ type: 16, data: '"keep-me"' }
				]
			})
		) as typeof fetch;
		expect(await lookupTxt('example.com')).toEqual(['keep-me']);
	});
});
