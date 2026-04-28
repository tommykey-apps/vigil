import { getItem } from './ddb';

export async function getUserEmail(userId: string): Promise<string | null> {
	const r = await getItem({ Key: { pk: `USER#${userId}`, sk: 'PROFILE' } });
	const email = (r.Item as { email?: string | null } | undefined)?.email;
	return typeof email === 'string' && email.includes('@') ? email : null;
}
