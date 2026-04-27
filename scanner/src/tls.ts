import tls, { type PeerCertificate } from 'node:tls';

const TIMEOUT_MS = 5000;

export interface SslFacts {
	issuer?: string;
	subject?: string;
	san: string[]; // DNS タイプのみ、lowercase
	valid_from?: number; // epoch sec
	valid_to?: number; // epoch sec ← alert 対象
	authorized: boolean;
	authorization_error?: string;
	fingerprint256?: string;
	serial_number?: string;
}

function pickCN(rdn: PeerCertificate['subject'] | undefined): string | undefined {
	const cn = (rdn as Record<string, string | string[]> | undefined)?.CN;
	if (Array.isArray(cn)) return cn[0];
	return typeof cn === 'string' ? cn : undefined;
}

function parseDate(s?: string): number | undefined {
	if (!s) return undefined;
	const t = Date.parse(s); // "Apr 28 12:34:56 2025 GMT"
	return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

export function parseTlsCert(
	cert: PeerCertificate,
	authorized: boolean,
	authError?: string
): SslFacts {
	const sanRaw = cert.subjectaltname ?? '';
	const san = (sanRaw.match(/DNS:([^,\s]+)/g) ?? []).map((s) => s.slice(4).toLowerCase());
	return {
		issuer: pickCN(cert.issuer),
		subject: pickCN(cert.subject),
		san,
		valid_from: parseDate(cert.valid_from),
		valid_to: parseDate(cert.valid_to),
		authorized,
		authorization_error: authError,
		fingerprint256: cert.fingerprint256,
		serial_number: cert.serialNumber
	};
}

export function lookupTls(host: string, port = 443): Promise<SslFacts> {
	return new Promise((resolve, reject) => {
		const socket = tls.connect({
			host,
			port,
			servername: host, // SNI 必須 (ALB/CF はデフォルト cert を返す)
			rejectUnauthorized: false, // expired/self-signed でも secureConnect 到達
			timeout: TIMEOUT_MS
		});

		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
			socket.destroy();
		};

		socket.once('secureConnect', () => {
			const cert = socket.getPeerCertificate(true);
			if (!cert || Object.keys(cert).length === 0) {
				return finish(() => reject(new Error('no_peer_certificate')));
			}
			const authError = socket.authorized
				? undefined
				: ((socket.authorizationError as Error | undefined)?.message ??
					(socket.authorizationError ? String(socket.authorizationError) : undefined));
			finish(() => resolve(parseTlsCert(cert, socket.authorized, authError)));
		});
		socket.once('timeout', () => finish(() => reject(new Error('tls_timeout'))));
		socket.once('error', (err: Error) => finish(() => reject(err)));
	});
}
