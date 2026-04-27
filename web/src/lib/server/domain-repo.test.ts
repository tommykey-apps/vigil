import { describe, expect, it } from 'vitest';
import {
	createDomain,
	deleteDomain,
	DomainExistsError,
	getDomain,
	listDomains,
	markVerified,
	regenToken
} from './domain-repo';
import { putItem } from './ddb';

const SKIP = !process.env.AWS_ENDPOINT_URL;

describe.skipIf(SKIP)('domain-repo (DynamoDB Local)', () => {
	const userId = `test-user-${Date.now()}`;

	it('createDomain returns a row with verify_token + expires_at', async () => {
		const hostname = `t1-${Date.now()}.example.com`;
		const row = await createDomain(userId, hostname);
		expect(row.hostname).toBe(hostname);
		expect(row.verify_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(row.verify_token_expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
		expect(row.verified_at).toBeUndefined();
		await deleteDomain(userId, hostname);
	});

	it('throws DomainExistsError on duplicate registration', async () => {
		const hostname = `t2-${Date.now()}.example.com`;
		await createDomain(userId, hostname);
		await expect(createDomain(userId, hostname)).rejects.toBeInstanceOf(DomainExistsError);
		await deleteDomain(userId, hostname);
	});

	it('listDomains excludes scanner sub-rows (DOMAIN#x#WHOIS etc.)', async () => {
		const hostname = `t3-${Date.now()}.example.com`;
		await createDomain(userId, hostname);
		// scanner が将来書く想定の sub-row を直接書き込んで filter を検証
		await putItem({
			Item: {
				pk: `USER#${userId}`,
				sk: `DOMAIN#${hostname}#WHOIS`,
				registrar: 'fake',
				updated_at: Math.floor(Date.now() / 1000)
			}
		});

		const rows = await listDomains(userId);
		const hits = rows.filter((r) => r.hostname === hostname);
		expect(hits).toHaveLength(1); // sub-row は除外される
		expect(hits[0].hostname).toBe(hostname);

		await deleteDomain(userId, hostname);
	});

	it('markVerified sets verified_at and removes verify_token', async () => {
		const hostname = `t4-${Date.now()}.example.com`;
		await createDomain(userId, hostname);
		await markVerified(userId, hostname);
		const row = await getDomain(userId, hostname);
		expect(row?.verified_at).toBeGreaterThan(0);
		expect(row?.verify_token).toBeUndefined();
		expect(row?.verify_token_expires_at).toBeUndefined();
		await deleteDomain(userId, hostname);
	});

	it('regenToken issues a fresh token and clears verified_at', async () => {
		const hostname = `t5-${Date.now()}.example.com`;
		const first = await createDomain(userId, hostname);
		await markVerified(userId, hostname);
		await regenToken(userId, hostname);
		const row = await getDomain(userId, hostname);
		expect(row?.verified_at).toBeUndefined();
		expect(row?.verify_token).toBeDefined();
		expect(row?.verify_token).not.toBe(first.verify_token);
		await deleteDomain(userId, hostname);
	});

	it('deleteDomain removes the row', async () => {
		const hostname = `t6-${Date.now()}.example.com`;
		await createDomain(userId, hostname);
		await deleteDomain(userId, hostname);
		expect(await getDomain(userId, hostname)).toBeUndefined();
	});
});
