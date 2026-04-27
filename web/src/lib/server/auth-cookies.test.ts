import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionOpts, shortOpts } from './auth-cookies';

describe('cookie option helpers', () => {
	const original = process.env.NODE_ENV;
	afterEach(() => {
		process.env.NODE_ENV = original;
	});

	it('share base flags (httpOnly, sameSite=lax, path=/)', () => {
		for (const opts of [sessionOpts(), shortOpts()]) {
			expect(opts.httpOnly).toBe(true);
			expect(opts.sameSite).toBe('lax');
			expect(opts.path).toBe('/');
		}
	});

	it('uses different lifetimes for session vs short-lived cookies', () => {
		expect(sessionOpts().maxAge).toBe(14 * 24 * 3600);
		expect(shortOpts().maxAge).toBe(600);
	});

	describe('secure flag follows NODE_ENV', () => {
		beforeEach(() => {
			process.env.NODE_ENV = 'production';
		});
		it('is true in production', () => {
			expect(sessionOpts().secure).toBe(true);
			expect(shortOpts().secure).toBe(true);
		});
	});

	describe('secure flag in non-production', () => {
		beforeEach(() => {
			process.env.NODE_ENV = 'development';
		});
		it('is false (so localhost http cookies are kept)', () => {
			expect(sessionOpts().secure).toBe(false);
			expect(shortOpts().secure).toBe(false);
		});
	});
});
