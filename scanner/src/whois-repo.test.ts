import { describe, expect, it } from 'vitest';
import { getWhois, putWhois, type WhoisRow } from './whois-repo';

const SKIP = !process.env.AWS_ENDPOINT_URL;

describe.skipIf(SKIP)('whois-repo (DynamoDB Local)', () => {
	const userId = `whois-test-${Date.now()}`;

	it('round trip: putWhois → getWhois returns the row', async () => {
		const hostname = `t1-${Date.now()}.example.com`;
		const row: WhoisRow = {
			registrar: 'TestReg',
			expires_at: 1900000000,
			registration_at: 1700000000,
			nameservers: ['ns1.example.com', 'ns2.example.com'],
			statuses: ['active'],
			redacted: false,
			updated_at: Math.floor(Date.now() / 1000)
		};
		await putWhois(userId, hostname, row);
		const got = await getWhois(userId, hostname);
		expect(got?.registrar).toBe('TestReg');
		expect(got?.expires_at).toBe(1900000000);
		expect(got?.nameservers).toEqual(['ns1.example.com', 'ns2.example.com']);
	});

	it('drops undefined attributes (registrar omitted)', async () => {
		const hostname = `t2-${Date.now()}.example.com`;
		const row: WhoisRow = {
			nameservers: [],
			statuses: [],
			redacted: false,
			updated_at: Math.floor(Date.now() / 1000),
			error: 'unknown_tld'
		};
		await putWhois(userId, hostname, row);
		const got = await getWhois(userId, hostname);
		expect(got?.error).toBe('unknown_tld');
		expect(got?.registrar).toBeUndefined();
		expect(got?.expires_at).toBeUndefined();
	});

	it('overwrites earlier row on second putWhois', async () => {
		const hostname = `t3-${Date.now()}.example.com`;
		await putWhois(userId, hostname, {
			nameservers: [],
			statuses: [],
			redacted: false,
			updated_at: 100,
			error: 'first'
		});
		await putWhois(userId, hostname, {
			registrar: 'Second',
			nameservers: ['ns1.x'],
			statuses: ['active'],
			redacted: false,
			updated_at: 200
		});
		const got = await getWhois(userId, hostname);
		expect(got?.registrar).toBe('Second');
		expect(got?.error).toBeUndefined();
	});
});
