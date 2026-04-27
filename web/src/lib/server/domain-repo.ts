import { deleteItem, getItem, putItem, queryItems, updateItem } from './ddb';
import { newOpaqueId } from './pkce';

const VERIFY_TTL_SEC = 3600;

export interface DomainRow {
	hostname: string;
	created_at: number;
	verify_token?: string;
	verify_token_expires_at?: number;
	verified_at?: number;
}

const userPk = (userId: string) => `USER#${userId}`;
const domainSk = (hostname: string) => `DOMAIN#${hostname}`;

export class DomainExistsError extends Error {
	constructor() {
		super('DOMAIN_EXISTS');
		this.name = 'DomainExistsError';
	}
}

export async function createDomain(userId: string, hostname: string): Promise<DomainRow> {
	const now = Math.floor(Date.now() / 1000);
	const token = newOpaqueId();
	const row: DomainRow = {
		hostname,
		created_at: now,
		verify_token: token,
		verify_token_expires_at: now + VERIFY_TTL_SEC
	};
	try {
		await putItem({
			Item: { pk: userPk(userId), sk: domainSk(hostname), ...row },
			ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
		});
	} catch (e) {
		if ((e as { name?: string }).name === 'ConditionalCheckFailedException')
			throw new DomainExistsError();
		throw e;
	}
	return row;
}

function pickRow(item: Record<string, unknown>): DomainRow {
	return {
		hostname: item.hostname as string,
		created_at: item.created_at as number,
		verify_token: item.verify_token as string | undefined,
		verify_token_expires_at: item.verify_token_expires_at as number | undefined,
		verified_at: item.verified_at as number | undefined
	};
}

export async function listDomains(userId: string): Promise<DomainRow[]> {
	const r = await queryItems({
		KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
		ExpressionAttributeValues: { ':pk': userPk(userId), ':sk': 'DOMAIN#' }
	});
	return (r.Items ?? [])
		// scanner が将来書く DOMAIN#<host>#WHOIS / #SSL / #DNS 等の sub-row を除外
		.filter((it) => (it.sk as string).split('#').length === 2)
		.map(pickRow);
}

export async function getDomain(userId: string, hostname: string): Promise<DomainRow | undefined> {
	const r = await getItem({ Key: { pk: userPk(userId), sk: domainSk(hostname) } });
	return r.Item ? pickRow(r.Item) : undefined;
}

export const markVerified = (userId: string, hostname: string) =>
	updateItem({
		Key: { pk: userPk(userId), sk: domainSk(hostname) },
		UpdateExpression: 'SET verified_at = :n REMOVE verify_token, verify_token_expires_at',
		ExpressionAttributeValues: { ':n': Math.floor(Date.now() / 1000) }
	});

export function regenToken(userId: string, hostname: string): Promise<unknown> {
	const now = Math.floor(Date.now() / 1000);
	return updateItem({
		Key: { pk: userPk(userId), sk: domainSk(hostname) },
		UpdateExpression: 'SET verify_token = :t, verify_token_expires_at = :e REMOVE verified_at',
		ExpressionAttributeValues: { ':t': newOpaqueId(), ':e': now + VERIFY_TTL_SEC }
	});
}

export const deleteDomain = (userId: string, hostname: string) =>
	deleteItem({ Key: { pk: userPk(userId), sk: domainSk(hostname) } });
