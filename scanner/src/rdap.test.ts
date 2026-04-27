import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bootstrap from './fixtures/bootstrap-dns.json' with { type: 'json' };
import rdapCom from './fixtures/rdap-com.json' with { type: 'json' };
import rdapOrg from './fixtures/rdap-org.json' with { type: 'json' };
import rdapRedacted from './fixtures/rdap-redacted.json' with { type: 'json' };
import {
	_resetBootstrapCacheForTests,
	buildTldMap,
	lookupWhois,
	parseRdap,
	resolveBaseUrl
} from './rdap';

describe('buildTldMap', () => {
	it('maps .com to Verisign and .org (PIR) variants', () => {
		const m = buildTldMap(bootstrap);
		expect(m.get('com')).toBe('https://rdap.verisign.com/com/v1/');
		expect(m.get('org')).toBe('https://rdap.publicinterestregistry.org/rdap/');
		expect(m.get('nl')).toBe('https://rdap.sidn.nl/');
	});

	it('appends trailing slash when missing', () => {
		const m = buildTldMap({ services: [[['x'], ['https://r.example/no-slash']]] });
		expect(m.get('x')).toBe('https://r.example/no-slash/');
	});

	it('skips entries with empty url array', () => {
		const m = buildTldMap({ services: [[['empty'], []]] });
		expect(m.has('empty')).toBe(false);
	});
});

describe('parseRdap', () => {
	it('extracts expiration / registrar / nameservers / statuses from .com fixture', () => {
		const facts = parseRdap(rdapCom);
		expect(facts.expires_at).toBeGreaterThan(0);
		expect(facts.registration_at).toBeGreaterThan(0);
		expect(facts.expires_at).toBeGreaterThan(facts.registration_at!);
		expect(facts.nameservers.length).toBeGreaterThan(0);
		expect(facts.nameservers[0]).toBe(facts.nameservers[0].toLowerCase());
		expect(typeof facts.registrar === 'string' || facts.registrar === undefined).toBe(true);
		expect(facts.redacted).toBe(false);
	});

	it('parses .org fixture (different registry)', () => {
		const facts = parseRdap(rdapOrg);
		expect(facts.expires_at).toBeGreaterThan(0);
		expect(Array.isArray(facts.statuses)).toBe(true);
	});

	it('marks redacted=true on GDPR-redacted .nl fixture and tolerates missing fields', () => {
		const facts = parseRdap(rdapRedacted);
		expect(facts.redacted).toBe(true);
		// .nl は expiration を redact するため undefined 可
		expect(facts.expires_at === undefined || facts.expires_at > 0).toBe(true);
	});

	it('returns safe defaults on totally empty input', () => {
		const facts = parseRdap({});
		expect(facts.nameservers).toEqual([]);
		expect(facts.statuses).toEqual([]);
		expect(facts.redacted).toBe(false);
		expect(facts.registrar).toBeUndefined();
		expect(facts.expires_at).toBeUndefined();
	});
});

describe('lookupWhois (fetch stubbed)', () => {
	const realFetch = globalThis.fetch;
	beforeEach(() => {
		_resetBootstrapCacheForTests();
	});
	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	const json = (body: unknown, init: ResponseInit = {}) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'content-type': 'application/json' },
			...init
		});

	it('resolves base URL via bootstrap and returns parsed facts on 200', async () => {
		globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes('data.iana.org')) return json(bootstrap);
			if (url.includes('rdap.verisign.com')) return json(rdapCom);
			throw new Error(`unexpected fetch ${url}`);
		}) as typeof fetch;

		const facts = await lookupWhois('example.com');
		expect(facts.expires_at).toBeGreaterThan(0);
	});

	it('throws unknown_tld for TLDs not in bootstrap', async () => {
		globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes('data.iana.org')) return json(bootstrap);
			throw new Error(`unexpected fetch ${url}`);
		}) as typeof fetch;

		await expect(lookupWhois('foo.unknown-tld')).rejects.toThrow('unknown_tld');
	});

	it('retries on 429 with Retry-After and eventually succeeds', async () => {
		vi.useFakeTimers();
		let calls = 0;
		globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes('data.iana.org')) return json(bootstrap);
			calls++;
			if (calls === 1) {
				return new Response('rate limited', {
					status: 429,
					headers: { 'retry-after': '1' }
				});
			}
			return json(rdapCom);
		}) as typeof fetch;

		const promise = lookupWhois('example.com');
		await vi.advanceTimersByTimeAsync(1500);
		const facts = await promise;
		expect(facts.expires_at).toBeGreaterThan(0);
		expect(calls).toBe(2);
	});

	it('throws rdap_<status> when 5xx persists past max retries', async () => {
		vi.useFakeTimers();
		globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes('data.iana.org')) return json(bootstrap);
			return new Response('boom', { status: 503 });
		}) as typeof fetch;

		const promise = lookupWhois('example.com');
		// suppress unhandled-rejection during fake-timer advancement
		promise.catch(() => undefined);
		await vi.advanceTimersByTimeAsync(20_000); // 1s + 2s + 4s = 7s で全 retry 消化
		await expect(promise).rejects.toThrow(/rdap_503/);
	});
});

describe('resolveBaseUrl with cached bootstrap', () => {
	beforeEach(() => {
		_resetBootstrapCacheForTests();
	});
	afterEach(() => {
		globalThis.fetch = globalThis.fetch;
		vi.restoreAllMocks();
	});

	it('caches bootstrap so it is fetched once across calls', async () => {
		const fetchSpy = vi.fn(async () =>
			new Response(JSON.stringify(bootstrap), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		globalThis.fetch = fetchSpy as typeof fetch;
		expect(await resolveBaseUrl('example.com')).toBe('https://rdap.verisign.com/com/v1/');
		expect(await resolveBaseUrl('example.org')).toBe('https://rdap.publicinterestregistry.org/rdap/');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
