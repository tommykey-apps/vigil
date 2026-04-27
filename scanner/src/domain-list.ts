import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDdb, TABLE } from './ddb';

export interface VerifiedDomain {
	userId: string;
	hostname: string;
}

export async function listVerifiedDomains(): Promise<VerifiedDomain[]> {
	const out: VerifiedDomain[] = [];
	let ExclusiveStartKey: Record<string, unknown> | undefined;
	do {
		const r = await getDdb().send(
			new ScanCommand({
				TableName: TABLE,
				FilterExpression:
					'begins_with(pk, :u) AND begins_with(sk, :d) AND attribute_exists(verified_at)',
				ExpressionAttributeValues: { ':u': 'USER#', ':d': 'DOMAIN#' },
				ExclusiveStartKey
			})
		);
		for (const it of r.Items ?? []) {
			const skVal = it.sk as string;
			if (skVal.split('#').length !== 2) continue; // sub-row (DOMAIN#x#WHOIS 等) を除外
			out.push({
				userId: (it.pk as string).slice('USER#'.length),
				hostname: skVal.slice('DOMAIN#'.length)
			});
		}
		ExclusiveStartKey = r.LastEvaluatedKey;
	} while (ExclusiveStartKey);
	return out;
}
