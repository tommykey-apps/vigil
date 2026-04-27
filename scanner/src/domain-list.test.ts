import { afterAll, describe, expect, it } from 'vitest';
import { putItem, deleteItem } from './ddb';
import { listVerifiedDomains } from './domain-list';

const SKIP = !process.env.AWS_ENDPOINT_URL;

describe.skipIf(SKIP)('listVerifiedDomains (DynamoDB Local)', () => {
	const tag = `dl-test-${Date.now()}`;

	const seedKeys: Array<{ pk: string; sk: string }> = [];

	const seed = async (item: Record<string, unknown>) => {
		seedKeys.push({ pk: item.pk as string, sk: item.sk as string });
		await putItem({ Item: item });
	};

	afterAll(async () => {
		for (const k of seedKeys) {
			try {
				await deleteItem({ Key: k });
			} catch {
				/* ignore */
			}
		}
	});

	it('includes only verified DOMAIN rows and excludes sub-rows / unverified', async () => {
		const userA = `${tag}-A`;
		const userB = `${tag}-B`;

		// 1: verified DOMAIN row → 含むべき
		await seed({
			pk: `USER#${userA}`,
			sk: `DOMAIN#alpha-${tag}.example.com`,
			hostname: `alpha-${tag}.example.com`,
			created_at: 100,
			verified_at: 200
		});

		// 2: 別ユーザーの verified DOMAIN row → 含むべき
		await seed({
			pk: `USER#${userB}`,
			sk: `DOMAIN#beta-${tag}.example.org`,
			hostname: `beta-${tag}.example.org`,
			created_at: 100,
			verified_at: 200
		});

		// 3: 未 verify (verified_at なし) → 除外
		await seed({
			pk: `USER#${userA}`,
			sk: `DOMAIN#unverified-${tag}.example.com`,
			hostname: `unverified-${tag}.example.com`,
			created_at: 100,
			verify_token: 'tok',
			verify_token_expires_at: 99999999
		});

		// 4: sub-row (DOMAIN#x#WHOIS) → 除外
		await seed({
			pk: `USER#${userA}`,
			sk: `DOMAIN#alpha-${tag}.example.com#WHOIS`,
			registrar: 'fake',
			updated_at: 100,
			verified_at: 999 // worst case: わざと verified_at 付き sub-row も除外されるか
		});

		const all = await listVerifiedDomains();
		const tagged = all.filter((d) => d.hostname.includes(tag));

		const hostnames = tagged.map((d) => d.hostname).sort();
		expect(hostnames).toEqual(
			[`alpha-${tag}.example.com`, `beta-${tag}.example.org`].sort()
		);

		const userIds = new Set(tagged.map((d) => d.userId));
		expect(userIds.has(userA)).toBe(true);
		expect(userIds.has(userB)).toBe(true);
	});
});
