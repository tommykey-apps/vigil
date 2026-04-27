import { describe, expect, it } from 'vitest';
import { getSsl, putSsl, type SslRow } from './ssl-repo';

const SKIP = !process.env.AWS_ENDPOINT_URL;

describe.skipIf(SKIP)('ssl-repo (DynamoDB Local)', () => {
	const userId = `ssl-test-${Date.now()}`;

	it('round trip: putSsl → getSsl returns the row', async () => {
		const hostname = `t1-${Date.now()}.example.com`;
		const row: SslRow = {
			issuer: 'Test CA',
			subject: hostname,
			san: [hostname, `www.${hostname}`],
			valid_from: 1700000000,
			valid_to: 1900000000,
			authorized: true,
			fingerprint256: 'AA:BB',
			serial_number: 'DEADBEEF',
			updated_at: Math.floor(Date.now() / 1000)
		};
		await putSsl(userId, hostname, row);
		const got = await getSsl(userId, hostname);
		expect(got?.issuer).toBe('Test CA');
		expect(got?.valid_to).toBe(1900000000);
		expect(got?.san).toEqual([hostname, `www.${hostname}`]);
		expect(got?.authorized).toBe(true);
	});

	it('drops undefined attributes (issuer/valid_to omitted)', async () => {
		const hostname = `t2-${Date.now()}.example.com`;
		const row: SslRow = {
			san: [],
			authorized: false,
			updated_at: Math.floor(Date.now() / 1000),
			error: 'tls_timeout'
		};
		await putSsl(userId, hostname, row);
		const got = await getSsl(userId, hostname);
		expect(got?.error).toBe('tls_timeout');
		expect(got?.issuer).toBeUndefined();
		expect(got?.valid_to).toBeUndefined();
		expect(got?.fingerprint256).toBeUndefined();
		expect(got?.authorized).toBe(false);
	});

	it('overwrites earlier row on second putSsl', async () => {
		const hostname = `t3-${Date.now()}.example.com`;
		await putSsl(userId, hostname, {
			san: [],
			authorized: false,
			updated_at: 100,
			error: 'first'
		});
		await putSsl(userId, hostname, {
			issuer: "Let's Encrypt",
			subject: hostname,
			san: [hostname],
			valid_to: 1900000000,
			authorized: true,
			updated_at: 200
		});
		const got = await getSsl(userId, hostname);
		expect(got?.issuer).toBe("Let's Encrypt");
		expect(got?.error).toBeUndefined();
	});
});
