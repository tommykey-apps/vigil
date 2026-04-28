import { getItem, putItem } from './ddb';
import type { AlertKind } from './alert';

export interface AlertRow {
	last_sent_at: number; // epoch sec (baseline 保存時は 0)
	last_target: string;
}

const userPk = (uid: string) => `USER#${uid}`;
const alertSk = (host: string, kind: AlertKind) => `DOMAIN#${host}#ALERT#${kind}`;

export const putAlert = (uid: string, host: string, kind: AlertKind, row: AlertRow) =>
	putItem({ Item: { pk: userPk(uid), sk: alertSk(host, kind), ...row } });

export async function getAlert(
	uid: string,
	host: string,
	kind: AlertKind
): Promise<AlertRow | undefined> {
	const r = await getItem({ Key: { pk: userPk(uid), sk: alertSk(host, kind) } });
	return r.Item as AlertRow | undefined;
}
