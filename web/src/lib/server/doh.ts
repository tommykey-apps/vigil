interface DohAnswer {
	type: number;
	data: string;
}

interface DohResponse {
	Status: number;
	Answer?: DohAnswer[];
}

const CLOUDFLARE = 'https://cloudflare-dns.com/dns-query';
const GOOGLE = 'https://dns.google/resolve';

async function fetchDoh(base: string, name: string): Promise<DohResponse> {
	const res = await fetch(`${base}?name=${encodeURIComponent(name)}&type=TXT`, {
		headers: { Accept: 'application/dns-json' }
	});
	if (!res.ok) throw new Error(`doh fetch failed: ${res.status}`);
	return (await res.json()) as DohResponse;
}

// "\"vigil-verify=abc\" \"def\"" → "vigil-verify=abcdef"
// 単一 TXT record を表現する DoH の data は複数 quoted segment を空白区切りで返す
export function unquoteTxt(data: string): string {
	const segs = data.match(/"((?:[^"\\]|\\.)*)"/g);
	if (!segs) return data;
	return segs.map((s) => s.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
}

export async function lookupTxt(name: string): Promise<string[]> {
	let resp: DohResponse;
	try {
		resp = await fetchDoh(CLOUDFLARE, name);
		if (resp.Status !== 0) throw new Error(`cloudflare status ${resp.Status}`);
	} catch {
		resp = await fetchDoh(GOOGLE, name);
		if (resp.Status !== 0) throw new Error(`google status ${resp.Status}`);
	}
	return (resp.Answer ?? [])
		.filter((a) => a.type === 16) // TXT
		.map((a) => unquoteTxt(a.data));
}
