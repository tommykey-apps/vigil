import { describe, expect, it } from 'vitest';
import { getDns, putDns, type DnsRow } from './dns-repo';

const SKIP = !process.env.AWS_ENDPOINT_URL;

describe.skipIf(SKIP)('dns-repo (DynamoDB Local)', () => {
	const userId = `dns-test-${Date.now()}`;

	it('round trip: putDns → getDns returns the row', async () => {
		const hostname = `t1-${Date.now()}.example.com`;
		const row: DnsRow = {
			a: ['1.2.3.4'],
			aaaa: ['2001:db8::1'],
			ns: ['ns1.example.com', 'ns2.example.com'],
			mx: [{ priority: 10, exchange: 'mail.example.com' }],
			txt: ['v=spf1 -all'],
			soa: 'ns1.example.com. hostmaster. 1 7200 3600 1209600 3600',
			caa: ['0 issue "letsencrypt.org"'],
			dnssec_ad: true,
			updated_at: Math.floor(Date.now() / 1000)
		};
		await putDns(userId, hostname, row);
		const got = await getDns(userId, hostname);
		expect(got?.a).toEqual(['1.2.3.4']);
		expect(got?.mx).toEqual([{ priority: 10, exchange: 'mail.example.com' }]);
		expect(got?.dnssec_ad).toBe(true);
		expect(got?.soa).toBe('ns1.example.com. hostmaster. 1 7200 3600 1209600 3600');
	});

	it('drops undefined attributes (soa omitted, error stored)', async () => {
		const hostname = `t2-${Date.now()}.example.com`;
		const row: DnsRow = {
			a: [],
			aaaa: [],
			ns: [],
			mx: [],
			txt: [],
			caa: [],
			dnssec_ad: false,
			updated_at: Math.floor(Date.now() / 1000),
			error: 'doh 503'
		};
		await putDns(userId, hostname, row);
		const got = await getDns(userId, hostname);
		expect(got?.error).toBe('doh 503');
		expect(got?.soa).toBeUndefined();
		expect(got?.a).toEqual([]);
		expect(got?.dnssec_ad).toBe(false);
	});

	it('overwrites earlier row on second putDns', async () => {
		const hostname = `t3-${Date.now()}.example.com`;
		await putDns(userId, hostname, {
			a: [], aaaa: [], ns: [], mx: [], txt: [], caa: [],
			dnssec_ad: false, updated_at: 100, error: 'first'
		});
		await putDns(userId, hostname, {
			a: ['9.9.9.9'], aaaa: [], ns: [], mx: [], txt: [], caa: [],
			dnssec_ad: true, updated_at: 200
		});
		const got = await getDns(userId, hostname);
		expect(got?.a).toEqual(['9.9.9.9']);
		expect(got?.error).toBeUndefined();
	});
});
