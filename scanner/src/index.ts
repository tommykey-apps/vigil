import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import middy from '@middy/core';
import type { ScheduledHandler } from 'aws-lambda';
import { evaluateAndSendAlerts } from './alert';
import { getDns, putDns, type DnsRow } from './dns-repo';
import { lookupDns } from './doh';
import { listVerifiedDomains, type VerifiedDomain } from './domain-list';
import { lookupWhois } from './rdap';
import { getSsl, putSsl, type SslRow } from './ssl-repo';
import { lookupTls } from './tls';
import { getUserEmail } from './user-repo';
import { getWhois, putWhois, type WhoisRow } from './whois-repo';

const CONCURRENCY = 5;
const logger = new Logger({ serviceName: 'vigil-scanner' });

const baseHandler: ScheduledHandler = async (event) => {
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
	const emailCache = new Map<string, string | null>();
	const getCachedEmail = async (uid: string): Promise<string | null> => {
		if (emailCache.has(uid)) return emailCache.get(uid) ?? null;
		const email = await getUserEmail(uid);
		emailCache.set(uid, email);
		return email;
	};

	const worker = async () => {
		while (queue.length > 0) {
			const d = queue.shift();
			if (!d) return;

			// RDAP
			const rdapAt = Math.floor(Date.now() / 1000);
			try {
				const facts = await lookupWhois(d.hostname);
				const row: WhoisRow = { ...facts, updated_at: rdapAt };
				await putWhois(d.userId, d.hostname, row);
				logger.info('rdap_ok', { host: d.hostname, expires_at: facts.expires_at });
			} catch (err) {
				const msg = (err as Error).message ?? 'unknown';
				logger.warn('rdap_failed', { host: d.hostname, msg });
				const errorRow: WhoisRow = {
					nameservers: [],
					statuses: [],
					redacted: false,
					updated_at: rdapAt,
					error: msg
				};
				await putWhois(d.userId, d.hostname, errorRow).catch(() => {
					// 書き込み自体が失敗してもこの worker は次のドメインに進む
				});
			}

			// TLS (RDAP とは独立した try/catch、片方失敗してももう片方は進める)
			const tlsAt = Math.floor(Date.now() / 1000);
			try {
				const facts = await lookupTls(d.hostname);
				const row: SslRow = { ...facts, updated_at: tlsAt };
				await putSsl(d.userId, d.hostname, row);
				logger.info('tls_ok', {
					host: d.hostname,
					valid_to: facts.valid_to,
					authorized: facts.authorized
				});
			} catch (err) {
				const msg = (err as Error).message ?? 'unknown';
				logger.warn('tls_failed', { host: d.hostname, msg });
				const errorRow: SslRow = {
					san: [],
					authorized: false,
					updated_at: tlsAt,
					error: msg
				};
				await putSsl(d.userId, d.hostname, errorRow).catch(() => {});
			}

			// DNS (RDAP / TLS とは独立した try/catch)
			const dnsAt = Math.floor(Date.now() / 1000);
			try {
				const facts = await lookupDns(d.hostname);
				const row: DnsRow = { ...facts, updated_at: dnsAt };
				await putDns(d.userId, d.hostname, row);
				logger.info('dns_ok', {
					host: d.hostname,
					dnssec: facts.dnssec_ad,
					a_count: facts.a.length
				});
			} catch (err) {
				const msg = (err as Error).message ?? 'unknown';
				logger.warn('dns_failed', { host: d.hostname, msg });
				const errorRow: DnsRow = {
					a: [],
					aaaa: [],
					ns: [],
					mx: [],
					txt: [],
					caa: [],
					dnssec_ad: false,
					updated_at: dnsAt,
					error: msg
				};
				await putDns(d.userId, d.hostname, errorRow).catch(() => {});
			}

			// ALERT (3 scan の結果を読み戻して評価 → SES 送信 or dry-run)
			try {
				const email = await getCachedEmail(d.userId);
				if (!email) {
					logger.warn('alert_skip_no_email', { uid: d.userId, host: d.hostname });
				} else {
					const [w, s, dnsRow] = await Promise.all([
						getWhois(d.userId, d.hostname),
						getSsl(d.userId, d.hostname),
						getDns(d.userId, d.hostname)
					]);
					await evaluateAndSendAlerts(
						{ userId: d.userId, hostname: d.hostname, email },
						w,
						s,
						dnsRow
					);
				}
			} catch (err) {
				logger.error('alert_failed', {
					host: d.hostname,
					err: (err as Error).message ?? 'unknown'
				});
			}
		}
	};

	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	logger.info('scan_complete');
};

// Powertools Logger を middy で wrap (cold_start + requestId 自動付与、
// clearState=true で前回 invocation の persistent keys 残留を防止)
export const handler = middy(baseHandler).use(
	injectLambdaContext(logger, { logEvent: false, clearState: true })
);

// ローカル手動 invoke (`pnpm -C scanner dev`)
if (import.meta.url === `file://${process.argv[1]}`) {
	void handler({} as never, {} as never);
}
