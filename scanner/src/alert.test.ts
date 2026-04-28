import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-ses', () => {
	class SESClient {
		send = mockSend;
	}
	class SendEmailCommand {
		constructor(public input: unknown) {}
	}
	return { SESClient, SendEmailCommand };
});

const mockGetAlert = vi.fn();
const mockPutAlert = vi.fn();
vi.mock('./alert-repo', () => ({
	getAlert: (...args: unknown[]) => mockGetAlert(...args),
	putAlert: (...args: unknown[]) => mockPutAlert(...args)
}));

import { _resetSesClientForTests, evaluateAndSendAlerts, renderEmail } from './alert';
import type { DnsRow } from './dns-repo';
import type { SslRow } from './ssl-repo';
import type { WhoisRow } from './whois-repo';

const NOW_SEC = 1_800_000_000;
const DAY = 86_400;

const ctx = { userId: 'u1', hostname: 'example.com', email: 'me@example.com' };

beforeEach(() => {
	mockSend.mockReset();
	mockSend.mockResolvedValue({ MessageId: 'fake' });
	mockGetAlert.mockReset();
	mockGetAlert.mockResolvedValue(undefined);
	mockPutAlert.mockReset();
	mockPutAlert.mockResolvedValue(undefined);
	_resetSesClientForTests();
	process.env.SES_DRY_RUN = 'false';
	process.env.SES_SENDER = 'notifications@vigil.tommykeyapp.com';
	vi.useFakeTimers();
	vi.setSystemTime(new Date(NOW_SEC * 1000));
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const buildWhois = (expires_at: number | undefined): WhoisRow => ({
	registrar: 'TestReg',
	expires_at,
	nameservers: [],
	statuses: [],
	redacted: false,
	updated_at: NOW_SEC
});

const buildSsl = (overrides: Partial<SslRow> = {}): SslRow => ({
	issuer: 'Test CA',
	subject: 'example.com',
	san: ['example.com'],
	valid_to: NOW_SEC + 20 * DAY,
	authorized: true,
	updated_at: NOW_SEC,
	...overrides
});

const buildDns = (ns: string[]): DnsRow => ({
	a: ['1.2.3.4'],
	aaaa: [],
	ns,
	mx: [],
	txt: [],
	caa: [],
	dnssec_ad: true,
	updated_at: NOW_SEC
});

describe('evaluateAndSendAlerts — WHOIS window', () => {
	it.each([
		[5 * DAY, 'WHOIS_7D'],
		[20 * DAY, 'WHOIS_30D'],
		[12 * 3600, 'WHOIS_1D']
	] as const)('expires in %s sec → kind %s', async (offsetSec, expectedKind) => {
		await evaluateAndSendAlerts(ctx, buildWhois(NOW_SEC + offsetSec), undefined, undefined);
		expect(mockSend).toHaveBeenCalledTimes(1);
		expect(mockPutAlert).toHaveBeenCalledWith('u1', 'example.com', expectedKind, expect.anything());
	});

	it('does not fire when expires > 30 days', async () => {
		await evaluateAndSendAlerts(ctx, buildWhois(NOW_SEC + 60 * DAY), undefined, undefined);
		expect(mockSend).not.toHaveBeenCalled();
		expect(mockPutAlert).not.toHaveBeenCalled();
	});

	it('does not fire when expires_at missing', async () => {
		await evaluateAndSendAlerts(ctx, buildWhois(undefined), undefined, undefined);
		expect(mockSend).not.toHaveBeenCalled();
	});
});

describe('evaluateAndSendAlerts — SSL', () => {
	it('fires SSL_30D for valid cert in 20 days', async () => {
		await evaluateAndSendAlerts(ctx, undefined, buildSsl({ valid_to: NOW_SEC + 20 * DAY }), undefined);
		expect(mockPutAlert).toHaveBeenCalledWith('u1', 'example.com', 'SSL_30D', expect.anything());
	});

	it('fires SSL_EXPIRED when authorized=false', async () => {
		await evaluateAndSendAlerts(
			ctx,
			undefined,
			buildSsl({ authorized: false, authorization_error: 'CERT_HAS_EXPIRED' }),
			undefined
		);
		expect(mockPutAlert).toHaveBeenCalledWith('u1', 'example.com', 'SSL_EXPIRED', expect.anything());
	});
});

describe('evaluateAndSendAlerts — DNS NS_CHANGED', () => {
	it('first observation: baseline saved (no email)', async () => {
		mockGetAlert.mockResolvedValue(undefined);
		await evaluateAndSendAlerts(ctx, undefined, undefined, buildDns(['ns1.x', 'ns2.x']));
		expect(mockSend).not.toHaveBeenCalled();
		expect(mockPutAlert).toHaveBeenCalledWith(
			'u1',
			'example.com',
			'DNS_NS_CHANGED',
			expect.objectContaining({ last_sent_at: 0 })
		);
	});

	it('subsequent change: send email', async () => {
		mockGetAlert.mockResolvedValue({ last_target: 'old.x,old2.x', last_sent_at: 100 });
		await evaluateAndSendAlerts(ctx, undefined, undefined, buildDns(['new1.x', 'new2.x']));
		expect(mockSend).toHaveBeenCalledTimes(1);
		expect(mockPutAlert).toHaveBeenCalledWith(
			'u1',
			'example.com',
			'DNS_NS_CHANGED',
			expect.objectContaining({ last_target: 'new1.x,new2.x' })
		);
	});

	it('same NS as last time: skip', async () => {
		mockGetAlert.mockResolvedValue({ last_target: 'ns1.x,ns2.x', last_sent_at: 100 });
		await evaluateAndSendAlerts(ctx, undefined, undefined, buildDns(['ns2.x', 'ns1.x']));
		expect(mockSend).not.toHaveBeenCalled();
		expect(mockPutAlert).not.toHaveBeenCalled();
	});
});

describe('dedup', () => {
	it('skip when prev.last_target equals current target', async () => {
		const expires = NOW_SEC + 5 * DAY;
		mockGetAlert.mockResolvedValue({ last_target: String(expires), last_sent_at: 100 });
		await evaluateAndSendAlerts(ctx, buildWhois(expires), undefined, undefined);
		expect(mockSend).not.toHaveBeenCalled();
		expect(mockPutAlert).not.toHaveBeenCalled();
	});

	it('send when target differs (e.g. domain renewed → new expires_at)', async () => {
		mockGetAlert.mockResolvedValue({ last_target: '999', last_sent_at: 100 });
		await evaluateAndSendAlerts(ctx, buildWhois(NOW_SEC + 5 * DAY), undefined, undefined);
		expect(mockSend).toHaveBeenCalledTimes(1);
	});
});

describe('dry-run', () => {
	it('does not invoke SES when SES_DRY_RUN=true', async () => {
		process.env.SES_DRY_RUN = 'true';
		await evaluateAndSendAlerts(ctx, buildWhois(NOW_SEC + 5 * DAY), undefined, undefined);
		expect(mockSend).not.toHaveBeenCalled();
		expect(mockPutAlert).toHaveBeenCalledTimes(1); // dedup record は更新する
	});

	it('does not invoke SES when SES_SENDER is unset', async () => {
		process.env.SES_SENDER = '';
		await evaluateAndSendAlerts(ctx, buildWhois(NOW_SEC + 5 * DAY), undefined, undefined);
		expect(mockSend).not.toHaveBeenCalled();
	});
});

describe('renderEmail', () => {
	it('produces non-empty subject + body for each kind', () => {
		const w = buildWhois(NOW_SEC + 5 * DAY);
		const s = buildSsl();
		const d = buildDns(['ns1.x']);
		const kinds = [
			'WHOIS_30D',
			'WHOIS_7D',
			'WHOIS_1D',
			'SSL_30D',
			'SSL_7D',
			'SSL_1D',
			'SSL_EXPIRED',
			'DNS_NS_CHANGED'
		] as const;
		for (const kind of kinds) {
			const { subject, body } = renderEmail(kind, 'example.com', w, s, d);
			expect(subject).toContain('example.com');
			expect(body.length).toBeGreaterThan(0);
		}
	});
});
