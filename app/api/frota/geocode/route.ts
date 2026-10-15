import { NextResponse } from 'next/server';
import { requireModule } from '@/lib/access';
import { fail, serverError } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { geocode } from '@/lib/frota/geo';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Localiza um endereço no mapa (?q=…), com a precisão de cada resultado. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 4) return fail('Digite o endereço.');
  if (q.length > 240) return fail('Endereço muito longo.');
  try {
    const user = await requireModule('frota', 'postos', 'edit');
    if (!rateLimit(`geo:${user.id}`, 20, 60_000).ok) return fail('Muitas buscas seguidas. Espere um minuto e tente de novo.', 429);
    return NextResponse.json(await geocode(q), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return serverError(e);
  }
}
