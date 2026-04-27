import { env } from '$env/dynamic/private';
import { challengeFor } from './pkce';

const AUTHORIZE = 'https://github.com/login/oauth/authorize';
const TOKEN = 'https://github.com/login/oauth/access_token';
const USER = 'https://api.github.com/user';
const EMAILS = 'https://api.github.com/user/emails';

function requireEnv(name: 'GITHUB_OAUTH_CLIENT_ID' | 'GITHUB_OAUTH_CLIENT_SECRET' | 'OAUTH_CALLBACK_URL'): string {
	const v = env[name];
	if (!v) throw new Error(`missing required env var: ${name}`);
	return v;
}

export function buildAuthorizeUrl(state: string, verifier: string): string {
	const url = new URL(AUTHORIZE);
	url.searchParams.set('client_id', requireEnv('GITHUB_OAUTH_CLIENT_ID'));
	url.searchParams.set('redirect_uri', requireEnv('OAUTH_CALLBACK_URL'));
	url.searchParams.set('scope', 'read:user user:email');
	url.searchParams.set('state', state);
	url.searchParams.set('code_challenge', challengeFor(verifier));
	url.searchParams.set('code_challenge_method', 'S256');
	return url.toString();
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
	const res = await fetch(TOKEN, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			client_id: requireEnv('GITHUB_OAUTH_CLIENT_ID'),
			client_secret: requireEnv('GITHUB_OAUTH_CLIENT_SECRET'),
			code,
			redirect_uri: requireEnv('OAUTH_CALLBACK_URL'),
			code_verifier: verifier
		})
	});
	if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
	const body = (await res.json()) as { access_token?: string; error?: string };
	if (!body.access_token) throw new Error(`token exchange returned no token: ${body.error ?? 'unknown'}`);
	return body.access_token;
}

export interface GitHubUser {
	id: string;
	login: string;
	email: string | null;
}

export async function fetchUser(accessToken: string): Promise<GitHubUser> {
	const headers = {
		Accept: 'application/vnd.github+json',
		Authorization: `Bearer ${accessToken}`,
		'X-GitHub-Api-Version': '2022-11-28'
	};

	const userRes = await fetch(USER, { headers });
	if (!userRes.ok) throw new Error(`/user failed: ${userRes.status}`);
	const u = (await userRes.json()) as { id: number; login: string };

	const emailsRes = await fetch(EMAILS, { headers });
	if (!emailsRes.ok) throw new Error(`/user/emails failed: ${emailsRes.status}`);
	const emails = (await emailsRes.json()) as Array<{
		email: string;
		primary: boolean;
		verified: boolean;
	}>;
	const primary = emails.find((e) => e.primary && e.verified)?.email ?? null;

	return { id: String(u.id), login: u.login, email: primary };
}
