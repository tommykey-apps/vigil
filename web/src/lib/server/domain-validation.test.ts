import { describe, expect, it } from 'vitest';
import { DomainValidationError, normalizeHostname, validateHostname } from './domain-validation';

describe('normalizeHostname', () => {
	it('lowercases and strips trailing dot', () => {
		expect(normalizeHostname('Example.COM.')).toBe('example.com');
	});
	it('preserves subdomains', () => {
		expect(normalizeHostname('app.example.com')).toBe('app.example.com');
	});
	it('rejects empty / whitespace', () => {
		expect(() => normalizeHostname('')).toThrow(DomainValidationError);
		expect(() => normalizeHostname('   ')).toThrow(DomainValidationError);
	});
	it('rejects values with path / port / scheme baked in', () => {
		expect(() => normalizeHostname('example.com/foo')).toThrow();
		expect(() => normalizeHostname('example.com:8080')).toThrow();
		expect(() => normalizeHostname('http://example.com')).toThrow();
	});
});

describe('validateHostname', () => {
	const cases: Array<[string, string]> = [
		['example.com', 'example.com'],
		['app.example.co.uk', 'app.example.co.uk'],
		['EXAMPLE.com.', 'example.com'],
		['xn--ls8h.example.com', 'xn--ls8h.example.com']
	];
	it.each(cases)('accepts %s', (input, expected) => {
		expect(validateHostname(input)).toBe(expected);
	});

	const bad = [
		'',
		'.',
		'example..com',
		'-bad.example.com',
		'bad-.example.com',
		'no-tld',
		'a'.repeat(64) + '.example.com', // label > 63
		('a'.repeat(60) + '.').repeat(5) + 'com' // total > 253
	];
	it.each(bad)('rejects %s', (input) => {
		expect(() => validateHostname(input)).toThrow(DomainValidationError);
	});
});
