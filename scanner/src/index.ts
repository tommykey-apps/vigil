import { Logger } from '@aws-lambda-powertools/logger';
import type { ScheduledHandler } from 'aws-lambda';
import { listVerifiedDomains, type VerifiedDomain } from './domain-list';
import { lookupWhois } from './rdap';
import { putWhois, type WhoisRow } from './whois-repo';

const CONCURRENCY = 5;
const logger = new Logger({ serviceName: 'vigil-scanner' });

export const handler: ScheduledHandler = async (event) => {
	logger.info('scanner invoked', { event });

	let domains: VerifiedDomain[];
	try {
		domains = await listVerifiedDomains();
	} catch (err) {
		logger.error('list_failed', { err });
		return;
	}
	logger.info('scanning', { count: domains.length });

	const queue = [...domains];

	const worker = async () => {
		while (queue.length > 0) {
			const d = queue.shift();
			if (!d) return;
			const now = Math.floor(Date.now() / 1000);
			try {
				const facts = await lookupWhois(d.hostname);
				const row: WhoisRow = { ...facts, updated_at: now };
				await putWhois(d.userId, d.hostname, row);
				logger.info('rdap_ok', { host: d.hostname, expires_at: facts.expires_at });
			} catch (err) {
				const msg = (err as Error).message ?? 'unknown';
				logger.warn('rdap_failed', { host: d.hostname, msg });
				const errorRow: WhoisRow = {
					nameservers: [],
					statuses: [],
					redacted: false,
					updated_at: now,
					error: msg
				};
				await putWhois(d.userId, d.hostname, errorRow).catch(() => {
					// 書き込み自体が失敗してもこの worker は次のドメインに進む
				});
			}
		}
	};

	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	logger.info('scan_complete');
};

// ローカル手動 invoke (`pnpm -C scanner dev`)
if (import.meta.url === `file://${process.argv[1]}`) {
	void handler({} as never, {} as never, () => {});
}
