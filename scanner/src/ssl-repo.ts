import { getItem, putItem } from './ddb';
import type { SslFacts } from './tls';

export interface SslRow extends SslFacts {
	updated_at: number;
	error?: string;
}

const userPk = (uid: string) => `USER#${uid}`;
const sslSk = (host: string) => `DOMAIN#${host}#SSL`;

export const putSsl = (uid: string, host: string, row: SslRow) =>
	putItem({ Item: { pk: userPk(uid), sk: sslSk(host), ...row } });

export async function getSsl(uid: string, host: string): Promise<SslRow | undefined> {
	const r = await getItem({ Key: { pk: userPk(uid), sk: sslSk(host) } });
	return r.Item as SslRow | undefined;
}
