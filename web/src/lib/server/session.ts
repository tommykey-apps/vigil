import { deleteItem, getItem, putItem, updateItem } from './ddb';
import { newOpaqueId } from './pkce';

const SESSION_TTL_SEC = 14 * 24 * 3600;

export interface SessionUser {
	id: string;
	login: string;
	email: string | null;
}

export async function createSession(userId: string): Promise<string> {
	const id = newOpaqueId();
	const now = Math.floor(Date.now() / 1000);
	await putItem({
		Item: {
			pk: `SESSION#${id}`,
			sk: 'META',
			user_id: userId,
			created_at: now,
			ttl: now + SESSION_TTL_SEC
		}
	});
	return id;
}

export async function getSessionUser(id: string): Promise<SessionUser | null> {
	const sess = await getItem({ Key: { pk: `SESSION#${id}`, sk: 'META' } });
	if (!sess.Item) return null;
	const ttl = sess.Item.ttl as number | undefined;
	if (ttl !== undefined && ttl < Math.floor(Date.now() / 1000)) return null;

	const userId = sess.Item.user_id as string;
	const profile = await getItem({ Key: { pk: `USER#${userId}`, sk: 'PROFILE' } });
	if (!profile.Item) return null;

	return {
		id: userId,
		login: profile.Item.login as string,
		email: (profile.Item.email as string | null | undefined) ?? null
	};
}

export const deleteSession = (id: string) =>
	deleteItem({ Key: { pk: `SESSION#${id}`, sk: 'META' } });

export const upsertUser = (githubId: string, login: string, email: string | null) =>
	updateItem({
		Key: { pk: `USER#${githubId}`, sk: 'PROFILE' },
		UpdateExpression:
			'SET login = :login, email = :email, created_at = if_not_exists(created_at, :now)',
		ExpressionAttributeValues: {
			':login': login,
			':email': email,
			':now': Math.floor(Date.now() / 1000)
		}
	});
