import { Logger } from '@aws-lambda-powertools/logger';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getAlert, putAlert } from './alert-repo';
import type { DnsRow } from './dns-repo';
import type { SslRow } from './ssl-repo';
import type { WhoisRow } from './whois-repo';

export type AlertKind =
	| 'WHOIS_30D'
	| 'WHOIS_7D'
	| 'WHOIS_1D'
	| 'SSL_30D'
	| 'SSL_7D'
	| 'SSL_1D'
	| 'SSL_EXPIRED'
	| 'DNS_NS_CHANGED';

const SEC_PER_DAY = 86_400;

const logger = new Logger({ serviceName: 'vigil-alert' });

let cachedSes: SESClient | undefined;
function getSesClient(): SESClient {
	if (cachedSes) return cachedSes;
	cachedSes = new SESClient({ region: process.env.SES_REGION ?? 'ap-northeast-1' });
	return cachedSes;
}

export interface AlertCtx {
	userId: string;
	hostname: string;
	email: string;
}

interface Candidate {
	kind: AlertKind;
	target: string;
}

// 注意: WhoisFacts.expires_at / SslFacts.valid_to は **epoch sec の number**
function evalWhois(nowSec: number, whois?: WhoisRow): Candidate | null {
	if (!whois || typeof whois.expires_at !== 'number') return null;
	const days = Math.ceil((whois.expires_at - nowSec) / SEC_PER_DAY);
	const target = String(whois.expires_at);
	if (days >= 0 && days <= 1) return { kind: 'WHOIS_1D', target };
	if (days > 1 && days <= 7) return { kind: 'WHOIS_7D', target };
	if (days > 7 && days <= 30) return { kind: 'WHOIS_30D', target };
	return null;
}

function evalSsl(nowSec: number, ssl?: SslRow): Candidate | null {
	if (!ssl) return null;
	if (!ssl.authorized || ssl.authorization_error === 'CERT_HAS_EXPIRED') {
		return { kind: 'SSL_EXPIRED', target: String(ssl.valid_to ?? 'unknown') };
	}
	if (typeof ssl.valid_to !== 'number') return null;
	const days = Math.ceil((ssl.valid_to - nowSec) / SEC_PER_DAY);
	const target = String(ssl.valid_to);
	if (days >= 0 && days <= 1) return { kind: 'SSL_1D', target };
	if (days > 1 && days <= 7) return { kind: 'SSL_7D', target };
	if (days > 7 && days <= 30) return { kind: 'SSL_30D', target };
	return null;
}

function evalNs(dns?: DnsRow): Candidate | null {
	if (!dns?.ns?.length) return null;
	return { kind: 'DNS_NS_CHANGED', target: [...dns.ns].sort().join(',') };
}

function fmtIso(epochSec: number): string {
	return new Date(epochSec * 1000).toISOString();
}

export function renderEmail(
	kind: AlertKind,
	host: string,
	w?: WhoisRow,
	s?: SslRow,
	d?: DnsRow
): { subject: string; body: string } {
	switch (kind) {
		case 'WHOIS_30D':
		case 'WHOIS_7D':
		case 'WHOIS_1D': {
			const days = kind === 'WHOIS_30D' ? 30 : kind === 'WHOIS_7D' ? 7 : 1;
			const exp = w?.expires_at ? fmtIso(w.expires_at) : '不明';
			return {
				subject: `[vigil] ${host} — ドメイン期限が ${days} 日以内に切れます`,
				body:
					`vigil が監視中の ${host} の WHOIS 期限が ${days} 日以内に切れます。\n\n` +
					`登録 registrar: ${w?.registrar ?? '不明'}\n` +
					`期限: ${exp}\n` +
					`status: ${(w?.statuses ?? []).join(', ') || '(なし)'}\n\n` +
					`更新を忘れずに行ってください。`
			};
		}
		case 'SSL_30D':
		case 'SSL_7D':
		case 'SSL_1D': {
			const days = kind === 'SSL_30D' ? 30 : kind === 'SSL_7D' ? 7 : 1;
			const exp = s?.valid_to ? fmtIso(s.valid_to) : '不明';
			return {
				subject: `[vigil] ${host} — TLS 証明書期限が ${days} 日以内に切れます`,
				body:
					`vigil が監視中の ${host} の TLS 証明書期限が ${days} 日以内に切れます。\n\n` +
					`発行者: ${s?.issuer ?? '不明'}\n` +
					`期限: ${exp}\n` +
					`SAN: ${(s?.san ?? []).join(', ') || '(なし)'}\n\n` +
					`更新を忘れずに行ってください。`
			};
		}
		case 'SSL_EXPIRED': {
			const exp = s?.valid_to ? fmtIso(s.valid_to) : '不明';
			return {
				subject: `[vigil] ${host} — TLS 証明書が無効です`,
				body:
					`vigil が監視中の ${host} の TLS 証明書が無効です。\n\n` +
					`認証エラー: ${s?.authorization_error ?? '不明'}\n` +
					`発行者: ${s?.issuer ?? '不明'}\n` +
					`期限: ${exp}\n\n` +
					`証明書を確認・更新してください。`
			};
		}
		case 'DNS_NS_CHANGED':
			return {
				subject: `[vigil] ${host} — NS レコードが変更されました`,
				body:
					`vigil が監視中の ${host} の NS レコードが変更されました。\n\n` +
					`現在の NS: ${(d?.ns ?? []).join(', ') || '(なし)'}\n\n` +
					`意図した変更でない場合は乗っ取りや誤操作の可能性があります。`
			};
	}
}

async function sendOrLog(ctx: AlertCtx, kind: AlertKind, subject: string, body: string) {
	const dryRun = process.env.SES_DRY_RUN === 'true';
	const sender = process.env.SES_SENDER ?? '';
	if (dryRun || !sender) {
		logger.info('alert_dry_run', { to: ctx.email, kind, host: ctx.hostname, subject });
		return;
	}
	await getSesClient().send(
		new SendEmailCommand({
			Source: sender,
			Destination: { ToAddresses: [ctx.email] },
			Message: {
				Subject: { Data: subject, Charset: 'UTF-8' },
				Body: { Text: { Data: body, Charset: 'UTF-8' } }
			}
		})
	);
	logger.info('alert_sent', { host: ctx.hostname, kind });
}

export async function evaluateAndSendAlerts(
	ctx: AlertCtx,
	whois?: WhoisRow,
	ssl?: SslRow,
	dns?: DnsRow
): Promise<void> {
	const nowSec = Math.floor(Date.now() / 1000);
	const candidates: Candidate[] = [];
	const w = evalWhois(nowSec, whois);
	if (w) candidates.push(w);
	const s = evalSsl(nowSec, ssl);
	if (s) candidates.push(s);
	const n = evalNs(dns);
	if (n) candidates.push(n);

	for (const { kind, target } of candidates) {
		const prev = await getAlert(ctx.userId, ctx.hostname, kind);

		if (prev?.last_target === target) {
			logger.debug('alert_dedup_skip', { host: ctx.hostname, kind });
			continue;
		}

		// NS の初回は baseline 保存のみ (送信抑止)
		if (kind === 'DNS_NS_CHANGED' && !prev) {
			await putAlert(ctx.userId, ctx.hostname, kind, { last_target: target, last_sent_at: 0 });
			logger.info('alert_baseline', { host: ctx.hostname, kind });
			continue;
		}

		const { subject, body } = renderEmail(kind, ctx.hostname, whois, ssl, dns);
		await sendOrLog(ctx, kind, subject, body);

		await putAlert(ctx.userId, ctx.hostname, kind, {
			last_target: target,
			last_sent_at: nowSec
		});
	}
}

// テスト用: SES client cache をリセット
export function _resetSesClientForTests() {
	cachedSes = undefined;
}
