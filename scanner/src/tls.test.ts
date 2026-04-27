import type { PeerCertificate } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { parseTlsCert } from './tls';

// Build a minimal PeerCertificate-like object. node:tls の型は厳密だが、parser は属性アクセスのみで
// 動くため Record で渡して `as unknown as PeerCertificate` 可。
function cert(overrides: Partial<Record<string, unknown>> = {}): PeerCertificate {
	const base = {
		subject: { CN: 'example.com' },
		issuer: { CN: 'Test CA' },
		valid_from: 'Apr 28 12:34:56 2025 GMT',
		valid_to: 'Apr 28 12:34:56 2026 GMT',
		subjectaltname: 'DNS:example.com, DNS:www.example.com',
		serialNumber: 'ABCDEF1234567890',
		fingerprint256: '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF'
	};
	return { ...base, ...overrides } as unknown as PeerCertificate;
}

describe('parseTlsCert', () => {
	it('extracts issuer / subject / san / valid_from / valid_to / serial / fingerprint', () => {
		const facts = parseTlsCert(cert(), true);
		expect(facts.issuer).toBe('Test CA');
		expect(facts.subject).toBe('example.com');
		expect(facts.san).toEqual(['example.com', 'www.example.com']);
		expect(facts.valid_from).toBe(Math.floor(Date.parse('Apr 28 12:34:56 2025 GMT') / 1000));
		expect(facts.valid_to).toBe(Math.floor(Date.parse('Apr 28 12:34:56 2026 GMT') / 1000));
		expect(facts.serial_number).toBe('ABCDEF1234567890');
		expect(facts.fingerprint256).toBe('00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF');
		expect(facts.authorized).toBe(true);
		expect(facts.authorization_error).toBeUndefined();
	});

	it('preserves cert info on expired (authorized=false + authError)', () => {
		const facts = parseTlsCert(cert(), false, 'CERT_HAS_EXPIRED');
		expect(facts.authorized).toBe(false);
		expect(facts.authorization_error).toBe('CERT_HAS_EXPIRED');
		expect(facts.valid_to).toBeGreaterThan(0); // 情報は取れる
	});

	it('returns san=[] when subjectaltname is undefined', () => {
		const facts = parseTlsCert(cert({ subjectaltname: undefined }), true);
		expect(facts.san).toEqual([]);
	});

	it('returns san=[] on empty subjectaltname string', () => {
		const facts = parseTlsCert(cert({ subjectaltname: '' }), true);
		expect(facts.san).toEqual([]);
	});

	it('keeps only DNS-typed entries when subjectaltname mixes IP Address and DNS', () => {
		const facts = parseTlsCert(
			cert({ subjectaltname: 'DNS:a.com, IP Address:1.2.3.4, DNS:b.com' }),
			true
		);
		expect(facts.san).toEqual(['a.com', 'b.com']);
	});

	it('lowercases SAN values', () => {
		const facts = parseTlsCert(cert({ subjectaltname: 'DNS:Example.COM, DNS:WWW.Example.com' }), true);
		expect(facts.san).toEqual(['example.com', 'www.example.com']);
	});

	it('takes the first CN when subject.CN is multi-value (string[])', () => {
		const facts = parseTlsCert(cert({ subject: { CN: ['first.example', 'second.example'] } }), true);
		expect(facts.subject).toBe('first.example');
	});

	it('returns issuer=undefined when issuer has no CN', () => {
		const facts = parseTlsCert(cert({ issuer: { O: 'Some Org' } }), true);
		expect(facts.issuer).toBeUndefined();
	});

	it('returns valid_from/valid_to=undefined on missing or invalid date strings', () => {
		const facts1 = parseTlsCert(cert({ valid_from: undefined, valid_to: 'not a date' }), true);
		expect(facts1.valid_from).toBeUndefined();
		expect(facts1.valid_to).toBeUndefined();

		const facts2 = parseTlsCert(cert({ valid_to: undefined }), true);
		expect(facts2.valid_to).toBeUndefined();
	});

	it('returns safe defaults on totally empty input', () => {
		const facts = parseTlsCert({} as PeerCertificate, false);
		expect(facts.san).toEqual([]);
		expect(facts.authorized).toBe(false);
		expect(facts.issuer).toBeUndefined();
		expect(facts.subject).toBeUndefined();
		expect(facts.valid_from).toBeUndefined();
		expect(facts.valid_to).toBeUndefined();
		expect(facts.fingerprint256).toBeUndefined();
		expect(facts.serial_number).toBeUndefined();
	});

	it('drops "DNS:" prefix and trims whitespace correctly', () => {
		// 実装は match で extractlocs するため余分な空白も取り除く
		const facts = parseTlsCert(
			cert({ subjectaltname: 'DNS:foo.com,  DNS:bar.com,DNS:baz.com' }),
			true
		);
		expect(facts.san).toEqual(['foo.com', 'bar.com', 'baz.com']);
	});
});
