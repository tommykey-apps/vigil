import { describe, expect, it } from 'vitest';
import { putItem } from './ddb';
import { getUserEmail } from './user-repo';

const SKIP = !process.env.AWS_ENDPOINT_URL;

describe.skipIf(SKIP)('user-repo (DynamoDB Local)', () => {
	it('returns email when PROFILE row exists with valid email', async () => {
		const uid = `user-${Date.now()}`;
		await putItem({
			Item: {
				pk: `USER#${uid}`,
				sk: 'PROFILE',
				login: 'octocat',
				email: 'octo@example.com',
				created_at: 100
			}
		});
		expect(await getUserEmail(uid)).toBe('octo@example.com');
	});

	it('returns null when row missing', async () => {
		expect(await getUserEmail(`absent-${Date.now()}`)).toBeNull();
	});

	it('returns null when email is missing or invalid', async () => {
		const uid = `user-noemail-${Date.now()}`;
		await putItem({
			Item: {
				pk: `USER#${uid}`,
				sk: 'PROFILE',
				login: 'noemail',
				created_at: 100
			}
		});
		expect(await getUserEmail(uid)).toBeNull();
	});
});
