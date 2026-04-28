import { describe, expect, it } from 'vitest';
import { getAlert, putAlert } from './alert-repo';

const SKIP = !process.env.AWS_ENDPOINT_URL;

describe.skipIf(SKIP)('alert-repo (DynamoDB Local)', () => {
	const userId = `alert-test-${Date.now()}`;

	it('round trip: putAlert → getAlert', async () => {
		const hostname = `t1-${Date.now()}.example.com`;
		await putAlert(userId, hostname, 'WHOIS_7D', { last_target: '1900000000', last_sent_at: 100 });
		const got = await getAlert(userId, hostname, 'WHOIS_7D');
		expect(got?.last_target).toBe('1900000000');
		expect(got?.last_sent_at).toBe(100);
	});

	it('returns undefined when row not present', async () => {
		const hostname = `t2-${Date.now()}.example.com`;
		expect(await getAlert(userId, hostname, 'SSL_30D')).toBeUndefined();
	});

	it('overwrites earlier row on second putAlert', async () => {
		const hostname = `t3-${Date.now()}.example.com`;
		await putAlert(userId, hostname, 'DNS_NS_CHANGED', { last_target: 'old', last_sent_at: 0 });
		await putAlert(userId, hostname, 'DNS_NS_CHANGED', { last_target: 'new', last_sent_at: 200 });
		const got = await getAlert(userId, hostname, 'DNS_NS_CHANGED');
		expect(got?.last_target).toBe('new');
		expect(got?.last_sent_at).toBe(200);
	});
});
