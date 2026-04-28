import { getItem, putItem } from './ddb';
import type { DnsFacts } from './doh';

export interface DnsRow extends DnsFacts {
	updated_at: number;
	error?: string;
}

const userPk = (uid: string) => `USER#${uid}`;
const dnsSk = (host: string) => `DOMAIN#${host}#DNS`;

export const putDns = (uid: string, host: string, row: DnsRow) =>
	putItem({ Item: { pk: userPk(uid), sk: dnsSk(host), ...row } });

export async function getDns(uid: string, host: string): Promise<DnsRow | undefined> {
	const r = await getItem({ Key: { pk: userPk(uid), sk: dnsSk(host) } });
	return r.Item as DnsRow | undefined;
}
