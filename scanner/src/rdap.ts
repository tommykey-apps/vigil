const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const CACHE_TTL_MS = 24 * 3600 * 1000;
const MAX_RETRY = 3;
const BACKOFF_MS = [1000, 2000, 4000];

interface BootstrapCache {
	fetchedAt: number;
	byTld: Map<string, string>;
}

let cache: BootstrapCache | undefined;

export interface WhoisFacts {
	registrar?: string;
	registration_at?: number; // epoch sec
	expires_at?: number; // epoch sec
	nameservers: string[]; // lowercase ldhName
	statuses: string[];
	redacted: boolean;
}

interface BootstrapJson {
	services: [string[], string[]][];
}

async function loadBootstrap(): Promise<Map<string, string>> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.byTld;
	const res = await fetch(BOOTSTRAP_URL, { headers: { Accept: 'application/json' } });
	if (!res.ok) throw new Error(`bootstrap_fetch_failed_${res.status}`);
	const json = (await res.json()) as BootstrapJson;
	cache = { fetchedAt: Date.now(), byTld: buildTldMap(json) };
	return cache.byTld;
}

export function buildTldMap(json: BootstrapJson): Map<string, string> {
	const map = new Map<string, string>();
	for (const [tlds, urls] of json.services) {
		if (!Array.isArray(urls) || urls.length === 0) continue;
		const base = urls[0].endsWith('/') ? urls[0] : urls[0] + '/';
		for (const t of tlds) map.set(t.toLowerCase(), base);
	}
	return map;
}

export async function resolveBaseUrl(host: string): Promise<string | undefined> {
	const tld = host.toLowerCase().split('.').pop();
	if (!tld) return undefined;
	const m = await loadBootstrap();
	return m.get(tld);
}

async function rdapGet(url: string): Promise<Response> {
	for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
		const res = await fetch(url, { headers: { Accept: 'application/rdap+json' } });
		if (res.status === 429 || res.status >= 500) {
			if (attempt === MAX_RETRY) return res;
			const ra = Number(res.headers.get('retry-after')) * 1000;
			const wait = Number.isFinite(ra) && ra > 0 ? ra : BACKOFF_MS[attempt];
			await new Promise((r) => setTimeout(r, wait));
			continue;
		}
		return res;
	}
	throw new Error('unreachable');
}

// vcardArray は ["vcard", [["fn", {}, "text", "Registrar Name"], ...]] の二次元
type VcardProp = [string, Record<string, unknown>, string, unknown];

export function parseRdap(json: unknown): WhoisFacts {
	const j = (json ?? {}) as Record<string, unknown>;

	const events = (Array.isArray(j.events) ? j.events : []) as Array<{
		eventAction?: string;
		eventDate?: string;
	}>;
	const eventDate = (action: string) =>
		events.find((e) => e?.eventAction === action)?.eventDate;

	const entities = (Array.isArray(j.entities) ? j.entities : []) as Array<{
		roles?: string[];
		vcardArray?: ['vcard', VcardProp[]];
	}>;
	const registrarEnt = entities.find(
		(e) => Array.isArray(e?.roles) && e.roles.includes('registrar')
	);
	const fnProp = registrarEnt?.vcardArray?.[1]?.find((p) => p?.[0] === 'fn');
	const registrar = typeof fnProp?.[3] === 'string' ? fnProp[3] : undefined;

	const ns = (Array.isArray(j.nameservers) ? j.nameservers : []) as Array<{ ldhName?: unknown }>;
	const nameservers = ns
		.map((n) => (typeof n?.ldhName === 'string' ? n.ldhName.toLowerCase() : undefined))
		.filter((x): x is string => !!x);

	const statusArr = Array.isArray(j.status) ? j.status : [];
	const statuses = statusArr.filter((s): s is string => typeof s === 'string');

	const redactedArr = Array.isArray(j.redacted) ? j.redacted : [];
	const redacted = redactedArr.length > 0;

	const toEpoch = (s?: string) => {
		if (!s) return undefined;
		const t = Date.parse(s);
		return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
	};

	return {
		registrar,
		registration_at: toEpoch(eventDate('registration')),
		expires_at: toEpoch(eventDate('expiration')),
		nameservers,
		statuses,
		redacted
	};
}

export async function lookupWhois(host: string): Promise<WhoisFacts> {
	const base = await resolveBaseUrl(host);
	if (!base) throw new Error('unknown_tld');
	const res = await rdapGet(`${base}domain/${host}`);
	if (!res.ok) throw new Error(`rdap_${res.status}`);
	return parseRdap(await res.json());
}

// テスト用: cache を初期化
export function _resetBootstrapCacheForTests() {
	cache = undefined;
}
