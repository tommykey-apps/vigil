const TYPES = { A: 1, AAAA: 28, NS: 2, MX: 15, TXT: 16, SOA: 6, CAA: 257 } as const;

const CLOUDFLARE = 'https://cloudflare-dns.com/dns-query';
const GOOGLE = 'https://dns.google/resolve';
const MAX_RETRY = 2;
const BACKOFF_MS = [1000, 2000];

interface DohJson {
	Status: number;
	AD?: boolean;
	Answer?: { type: number; data: string }[];
}

export interface DnsFacts {
	a: string[];
	aaaa: string[];
	ns: string[];
	mx: { priority: number; exchange: string }[];
	txt: string[];
	soa?: string;
	caa: string[];
	dnssec_ad: boolean;
}

async function fetchOne(base: string, name: string, type: number): Promise<DohJson> {
	const url = `${base}?name=${encodeURIComponent(name)}&type=${type}&do=1&cd=0`;
	for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
		const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
		if (res.status === 429 || res.status >= 500) {
			if (attempt === MAX_RETRY) throw new Error(`doh ${res.status}`);
			const ra = Number(res.headers.get('retry-after')) * 1000;
			const wait = Number.isFinite(ra) && ra > 0 ? ra : BACKOFF_MS[attempt];
			await new Promise((r) => setTimeout(r, wait));
			continue;
		}
		if (!res.ok) throw new Error(`doh ${res.status}`);
		const json = (await res.json()) as Partial<DohJson>;
		// 防御 parse: Status は number、Answer は配列、AD は boolean optional
		const Status = typeof json.Status === 'number' ? json.Status : -1;
		const Answer = Array.isArray(json.Answer) ? json.Answer : undefined;
		const AD = typeof json.AD === 'boolean' ? json.AD : undefined;
		return { Status, Answer, AD };
	}
	throw new Error('unreachable');
}

async function lookupOne(name: string, type: number): Promise<DohJson> {
	try {
		const r = await fetchOne(CLOUDFLARE, name, type);
		if (r.Status === 0 || r.Status === 3) return r; // 0=OK, 3=NXDOMAIN を許容
		throw new Error(`cf status ${r.Status}`);
	} catch {
		try {
			return await fetchOne(GOOGLE, name, type);
		} catch {
			// 両方失敗 → 空 response (partial failure 許容)
			return { Status: -1, Answer: [], AD: false };
		}
	}
}

export function unquoteTxt(data: string): string {
	const segs = data.match(/"((?:[^"\\]|\\.)*)"/g);
	if (!segs) return data;
	return segs.map((s) => s.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
}

const stripDot = (s: string) => (s.endsWith('.') ? s.slice(0, -1) : s);

const filterByType = (resp: DohJson, type: number) =>
	(resp.Answer ?? []).filter(
		(a): a is { type: number; data: string } =>
			!!a && a.type === type && typeof a.data === 'string'
	);

export function parseMx(data: string): { priority: number; exchange: string } | undefined {
	const m = data.match(/^(\d+)\s+(\S+)$/);
	if (!m) return undefined;
	return { priority: Number(m[1]), exchange: stripDot(m[2]).toLowerCase() };
}

export async function lookupDns(name: string): Promise<DnsFacts> {
	const [a, aaaa, ns, mx, txt, soa, caa] = await Promise.all([
		lookupOne(name, TYPES.A),
		lookupOne(name, TYPES.AAAA),
		lookupOne(name, TYPES.NS),
		lookupOne(name, TYPES.MX),
		lookupOne(name, TYPES.TXT),
		lookupOne(name, TYPES.SOA),
		lookupOne(name, TYPES.CAA)
	]);

	return {
		a: filterByType(a, TYPES.A).map((r) => r.data),
		aaaa: filterByType(aaaa, TYPES.AAAA).map((r) => r.data),
		ns: filterByType(ns, TYPES.NS).map((r) => stripDot(r.data).toLowerCase()),
		mx: filterByType(mx, TYPES.MX)
			.map((r) => parseMx(r.data))
			.filter((x): x is { priority: number; exchange: string } => !!x),
		txt: filterByType(txt, TYPES.TXT).map((r) => unquoteTxt(r.data)),
		soa: filterByType(soa, TYPES.SOA)[0]?.data,
		caa: filterByType(caa, TYPES.CAA).map((r) => r.data),
		dnssec_ad: [a, aaaa, ns, mx, txt, soa, caa].every((r) => r.AD === true)
	};
}
