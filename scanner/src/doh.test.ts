import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupDns, parseMx, unquoteTxt } from './doh';

const realFetch = globalThis.fetch;

const json = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init
	});

// host & type に応じた response を返す mock factory
type Responder = (url: string) => Response | Promise<Response>;

function setFetch(responder: Responder) {
	globalThis.fetch = vi.fn(async (input: string | URL | Request) =>
		responder(String(input))
	) as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = realFetch;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('unquoteTxt', () => {
	it('joins multiple quoted segments', () => {
		expect(unquoteTxt('"vigil-verify=abc" "def"')).toBe('vigil-verify=abcdef');
	});
	it('returns input as-is when no quotes', () => {
		expect(unquoteTxt('plain')).toBe('plain');
	});
});

describe('parseMx', () => {
	it('parses "10 mail.example.com." to {priority, exchange}', () => {
		expect(parseMx('10 mail.example.com.')).toEqual({ priority: 10, exchange: 'mail.example.com' });
	});
	it('lowercases exchange', () => {
		expect(parseMx('5 MAIL.example.COM.')).toEqual({ priority: 5, exchange: 'mail.example.com' });
	});
	it('returns undefined on malformed input', () => {
		expect(parseMx('garbage')).toBeUndefined();
		expect(parseMx('10mail.example.com')).toBeUndefined();
	});
});

describe('lookupDns', () => {
	function answer(type: number, data: string) {
		return { type, data };
	}

	it('parses A / AAAA / NS / MX / TXT / SOA / CAA from Cloudflare 200 responses', async () => {
		setFetch((url) => {
			if (!url.includes('cloudflare-dns.com')) throw new Error('should not fall back');
			const t = Number(new URL(url).searchParams.get('type'));
			const map: Record<number, unknown> = {
				1: { Status: 0, AD: true, Answer: [answer(1, '1.2.3.4'), answer(1, '5.6.7.8')] },
				28: { Status: 0, AD: true, Answer: [answer(28, '2001:db8::1')] },
				2: {
					Status: 0,
					AD: true,
					Answer: [answer(2, 'ns1.example.com.'), answer(2, 'NS2.example.COM.')]
				},
				15: { Status: 0, AD: true, Answer: [answer(15, '10 mail.example.com.')] },
				16: { Status: 0, AD: true, Answer: [answer(16, '"hello" "world"')] },
				6: {
					Status: 0,
					AD: true,
					Answer: [answer(6, 'ns1.example.com. hostmaster.example.com. 1 7200 3600 1209600 3600')]
				},
				257: { Status: 0, AD: true, Answer: [answer(257, '0 issue "letsencrypt.org"')] }
			};
			return json(map[t] ?? { Status: 3, AD: true, Answer: [] });
		});

		const facts = await lookupDns('example.com');
		expect(facts.a).toEqual(['1.2.3.4', '5.6.7.8']);
		expect(facts.aaaa).toEqual(['2001:db8::1']);
		expect(facts.ns).toEqual(['ns1.example.com', 'ns2.example.com']); // 末尾ドット + lowercase
		expect(facts.mx).toEqual([{ priority: 10, exchange: 'mail.example.com' }]);
		expect(facts.txt).toEqual(['helloworld']);
		expect(facts.soa).toBe('ns1.example.com. hostmaster.example.com. 1 7200 3600 1209600 3600');
		expect(facts.caa).toEqual(['0 issue "letsencrypt.org"']);
		expect(facts.dnssec_ad).toBe(true);
	});

	it('falls back to Google when Cloudflare returns Status != 0/3', async () => {
		setFetch((url) => {
			if (url.includes('cloudflare-dns.com'))
				return json({ Status: 2, Answer: [] }); // SERVFAIL
			// Google
			const t = Number(new URL(url).searchParams.get('type'));
			if (t === 1) return json({ Status: 0, AD: false, Answer: [answer(1, '9.9.9.9')] });
			return json({ Status: 0, AD: false, Answer: [] });
		});
		const facts = await lookupDns('example.com');
		expect(facts.a).toEqual(['9.9.9.9']);
	});

	it('treats both-resolver failure as empty answer (partial failure)', async () => {
		setFetch(() => json({ Status: 5, Answer: [] }));
		const facts = await lookupDns('example.com');
		expect(facts.a).toEqual([]);
		expect(facts.dnssec_ad).toBe(false); // status -1 だと AD は集約 false
	});

	it('treats NXDOMAIN (Status=3) as empty answer (no error)', async () => {
		setFetch(() => json({ Status: 3, AD: true, Answer: [] }));
		const facts = await lookupDns('nonexistent.example');
		expect(facts.a).toEqual([]);
		expect(facts.ns).toEqual([]);
		// AD: true で全 type なので集約は true
		expect(facts.dnssec_ad).toBe(true);
	});

	it('aggregates AD=false when ANY type lacks AD', async () => {
		setFetch((url) => {
			const t = Number(new URL(url).searchParams.get('type'));
			if (t === 1) return json({ Status: 0, AD: true, Answer: [answer(1, '1.2.3.4')] });
			// 他の type は AD なし
			return json({ Status: 0, Answer: [] });
		});
		const facts = await lookupDns('example.com');
		expect(facts.dnssec_ad).toBe(false);
	});

	it('filters out non-matching answer types (CNAME, etc.)', async () => {
		setFetch((url) => {
			const t = Number(new URL(url).searchParams.get('type'));
			if (t === 1) {
				return json({
					Status: 0,
					AD: true,
					Answer: [
						{ type: 5, data: 'cdn.example.com.' }, // CNAME
						{ type: 1, data: '1.2.3.4' }
					]
				});
			}
			return json({ Status: 0, AD: true, Answer: [] });
		});
		const facts = await lookupDns('example.com');
		expect(facts.a).toEqual(['1.2.3.4']);
	});

	it('retries on 429 with Retry-After and eventually succeeds', async () => {
		vi.useFakeTimers();
		const counts: Record<number, number> = {};
		setFetch((url) => {
			const t = Number(new URL(url).searchParams.get('type'));
			counts[t] = (counts[t] ?? 0) + 1;
			if (t === 1 && counts[1] === 1) {
				return new Response('rate limited', {
					status: 429,
					headers: { 'retry-after': '1' }
				});
			}
			return json({ Status: 0, AD: true, Answer: t === 1 ? [answer(1, '1.2.3.4')] : [] });
		});

		const promise = lookupDns('example.com');
		// すべての type の retry を消化
		await vi.advanceTimersByTimeAsync(5000);
		const facts = await promise;
		expect(facts.a).toEqual(['1.2.3.4']);
		expect(counts[1]).toBe(2); // 1 回 retry
	});

	it('drops malformed answer entries defensively', async () => {
		setFetch((url) => {
			const t = Number(new URL(url).searchParams.get('type'));
			if (t === 1) {
				return json({
					Status: 0,
					AD: true,
					Answer: [
						null,
						{ type: 1 }, // data 欠損
						{ type: 1, data: 42 }, // data 非 string
						{ type: 1, data: '1.2.3.4' }
					]
				});
			}
			return json({ Status: 0, AD: true, Answer: [] });
		});
		const facts = await lookupDns('example.com');
		expect(facts.a).toEqual(['1.2.3.4']);
	});

	it('returns empty soa when no SOA record', async () => {
		setFetch(() => json({ Status: 0, AD: true, Answer: [] }));
		const facts = await lookupDns('example.com');
		expect(facts.soa).toBeUndefined();
	});
});
