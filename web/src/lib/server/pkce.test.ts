import { describe, expect, it } from 'vitest';
import { challengeFor, newOpaqueId, newState, newVerifier } from './pkce';

describe('challengeFor', () => {
	// RFC 7636 Appendix B: verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	// → SHA256 base64url = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
	it('matches the RFC 7636 reference vector', () => {
		const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
		expect(challengeFor(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
	});

	it('produces base64url output (no padding, URL-safe)', () => {
		const c = challengeFor('any-verifier-value');
		expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(c).not.toContain('=');
	});
});

describe('random helpers', () => {
	it('newOpaqueId / newState / newVerifier yield 32 bytes (43-char base64url)', () => {
		for (const fn of [newOpaqueId, newState, newVerifier]) {
			const v = fn();
			expect(v).toHaveLength(43);
			expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	it('does not collide across many invocations', () => {
		const set = new Set<string>();
		for (let i = 0; i < 1000; i++) set.add(newOpaqueId());
		expect(set.size).toBe(1000);
	});
});
