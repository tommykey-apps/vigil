import { getItem, putItem } from './ddb';
import type { WhoisFacts } from './rdap';

export interface WhoisRow extends WhoisFacts {
	updated_at: number;
	error?: string;
}

const userPk = (uid: string) => `USER#${uid}`;
const whoisSk = (host: string) => `DOMAIN#${host}#WHOIS`;

export const putWhois = (uid: string, host: string, row: WhoisRow) =>
	putItem({ Item: { pk: userPk(uid), sk: whoisSk(host), ...row } });
// removeUndefinedValues: true (ddb.ts marshallOptions) で undefined 属性は省略される

export async function getWhois(uid: string, host: string): Promise<WhoisRow | undefined> {
	const r = await getItem({ Key: { pk: userPk(uid), sk: whoisSk(host) } });
	return r.Item as WhoisRow | undefined;
}
