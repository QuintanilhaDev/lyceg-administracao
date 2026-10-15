import 'server-only';

/** Brasil (com folga): coordenadas fora disto são recusadas */
const BR = { w: -74.5, e: -28.5, s: -34.2, n: 5.6 };
const inBR = (la: number, lo: number) => la >= BR.s && la <= BR.n && lo >= BR.w && lo <= BR.e;
/** Bahia: preferência quando o endereço não diz o estado (a sede fica em Salvador) */
const BA = { w: -46.7, e: -37.3, s: -18.4, n: -8.4 };

export interface GeoHit {
  lat: number;
  lng: number;
  label: string;
  precision: 'exato' | 'rua' | 'aproximado';
}

/** lat/lng vindos do formulário (opcionais, mas os dois juntos e dentro do Brasil) */
export function geoFields(body: Record<string, unknown>): { row: { lat: number | null; lng: number | null; geo_precision: string | null } } | { error: string } {
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
  const lat = n(body.lat);
  const lng = n(body.lng);
  if (lat === null && lng === null) return { row: { lat: null, lng: null, geo_precision: null } };
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Informe latitude e longitude juntas (ou use "Localizar no mapa").' };
  if (!inBR(lat, lng)) return { error: 'Essas coordenadas ficam fora do Brasil. Confira o endereço.' };
  const p = typeof body.geo_precision === 'string' && ['exato', 'rua', 'aproximado', 'manual'].includes(body.geo_precision) ? body.geo_precision : 'manual';
  return { row: { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, geo_precision: p } };
}

const UA = { 'User-Agent': 'LycegAdministracao/1.0 (frota; contato pelo administrador do sistema)', 'Accept-Language': 'pt-BR' };

/** "Av. Tancredo Neves, nº 1000" → "Avenida Tancredo Neves, 1000" */
export function cleanAddress(q: string): string {
  return q
    .replace(/\bposto\b[^,\-]*?(?=,|-|$)/gi, '')
    .replace(/\bav\.?(?=\s)/gi, 'Avenida')
    .replace(/\bpç\.?(?=\s)/gi, 'Praça')
    .replace(/\brod\.?(?=\s)/gi, 'Rodovia')
    .replace(/\btrav\.?(?=\s)/gi, 'Travessa')
    .replace(/\bestr\.?(?=\s)/gi, 'Estrada')
    .replace(/\bal\.?(?=\s)/gi, 'Alameda')
    .replace(/\br\.(?=\s)/gi, 'Rua')
    .replace(/\bbr[\s-]?(\d{3})/gi, 'BR-$1')
    .replace(/\bba[\s-]?(\d{3})/gi, 'BA-$1')
    .replace(/\b(n[º°o.]*|numero|número)\s*(?=\d)/gi, '')
    .replace(/\bs\/?n\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/^[\s,\-–]+/, '')
    .trim();
}

const precisionOf = (t: string): GeoHit['precision'] =>
  ['house', 'building', 'residential', 'commercial', 'office', 'house_number'].includes(t) ? 'exato' : ['road', 'highway', 'street', 'footway', 'pedestrian'].includes(t) ? 'rua' : 'aproximado';

async function timed(url: string, ms = 6000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal, cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function nominatim(params: Record<string, string | number>): Promise<GeoHit[]> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  Object.entries({ format: 'jsonv2', addressdetails: 1, limit: 5, countrycodes: 'br', 'accept-language': 'pt-BR', ...params }).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const j = (await timed(u.toString())) as { lat: string; lon: string; display_name: string; addresstype?: string; type?: string }[] | null;
  return (j ?? [])
    .map((x) => ({ lat: +x.lat, lng: +x.lon, label: x.display_name, precision: precisionOf(x.addresstype || x.type || '') }))
    .filter((x) => inBR(x.lat, x.lng));
}

const STATE_RE = /\b(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|acre|alagoas|amapa|amapá|amazonas|bahia|ceara|ceará|distrito federal|espirito santo|espírito santo|goias|goiás|maranhao|maranhão|mato grosso|minas gerais|para|pará|paraiba|paraíba|parana|paraná|pernambuco|piaui|piauí|rio de janeiro|rio grande do norte|rio grande do sul|rondonia|rondônia|roraima|santa catarina|sao paulo|são paulo|sergipe|tocantins)\b/i;

/**
 * Acha o endereço no mapa: usa o CEP (ViaCEP) quando existe, tenta o OpenStreetMap com
 * várias simplificações e, por fim, o Photon. Sempre informa a precisão do ponto.
 */
export async function geocode(raw: string): Promise<{ results: GeoHit[]; query: string; tried: string[] }> {
  let q = cleanAddress(raw);
  const tried: string[] = [];
  const cep = raw.match(/\b(\d{5})-?(\d{3})\b/);
  if (cep) {
    const v = (await timed(`https://viacep.com.br/ws/${cep[1]}${cep[2]}/json/`, 5000)) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string } | null;
    if (v && !v.erro && v.localidade) {
      const num = (raw.replace(cep[0], '').match(/\b\d{1,5}\b/) || [''])[0];
      q = `${v.logradouro ?? ''} ${num}, ${v.bairro ?? ''}, ${v.localidade}, ${v.uf ?? ''}`.replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/^[\s,]+/, '');
    }
  }
  const hasState = STATE_RE.test(q);
  const ba = `${BA.w},${BA.n},${BA.e},${BA.s}`;
  const noNum = q.replace(/\b\d{1,5}\b/g, '').replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
  const parts = q.split(/\s*[,\-–]\s*/).filter(Boolean);
  const attempts: Record<string, string | number>[] = [
    hasState ? { q } : { q: q + ', Bahia', viewbox: ba, bounded: 1 },
    { q: q + (hasState ? '' : ', Brasil') },
    { q: noNum + (hasState ? '' : ', Bahia') },
    ...(parts.length > 2 ? [{ q: parts.slice(-3).join(', ') }] : []),
    ...(parts.length > 1 ? [{ q: parts.slice(-2).join(', ') + (hasState ? '' : ', Bahia') }] : []),
  ];
  for (const a of attempts) {
    tried.push(String(a.q));
    const r = await nominatim(a);
    if (r.length) {
      const seen = new Set<string>();
      const results = r.filter((x) => {
        const k = x.lat.toFixed(4) + x.lng.toFixed(4);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { results, query: String(a.q), tried };
    }
    // regra de uso do Nominatim: no máximo 1 pedido por segundo
    await new Promise((s) => setTimeout(s, 1100));
  }
  const j = (await timed(`https://photon.komoot.io/api/?limit=5&lat=-12.97&lon=-38.5&q=${encodeURIComponent(q)}`)) as {
    features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[];
  } | null;
  const results = (j?.features ?? [])
    .map((f) => ({
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      label: [f.properties.name, f.properties.street, f.properties.city, f.properties.state].filter(Boolean).join(', '),
      precision: 'aproximado' as const,
    }))
    .filter((x) => inBR(x.lat, x.lng));
  return { results, query: q, tried };
}
