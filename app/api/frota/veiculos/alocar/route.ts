import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireModule } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { UUID_RE } from '@/lib/almoxarifado/stockData';

export const dynamic = 'force-dynamic';

/** Aloca um ou vários veículos num posto ({ ids, posto_id }; posto_id null = sem posto). */
export async function POST(req: Request) {
  const body = await readJson<{ ids?: unknown; posto_id?: unknown }>(req);
  if (!body) return fail('Dados inválidos.');
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)))] : [];
  if (!ids.length) return fail('Escolha pelo menos um veículo.');
  if (ids.length > 500) return fail('No máximo 500 veículos por vez.');
  const posto = body.posto_id === null || body.posto_id === '' ? null : typeof body.posto_id === 'string' && UUID_RE.test(body.posto_id) ? body.posto_id : undefined;
  if (posto === undefined) return fail('Posto inválido.');
  try {
    const user = await requireModule('frota', ['alocacao', 'veiculos'], 'edit');
    if (posto) {
      const { data: p, error: pe } = await db().from('postos').select('id').eq('id', posto).maybeSingle();
      if (pe) throw pe;
      if (!p) return fail('Posto não encontrado (foi removido?).', 404);
    }
    const { data, error } = await db()
      .from('veiculos')
      .update({ posto_id: posto, updated_by: user.display_name, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('id');
    if (error) throw error;
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ moved: data?.length ?? 0 });
  } catch (e) {
    return serverError(e);
  }
}
