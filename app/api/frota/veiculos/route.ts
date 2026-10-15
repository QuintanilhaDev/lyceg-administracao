import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireModule } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { cleanRecord, frotaDbMessage } from '@/lib/frota/server';
import { SITUACOES, normPlaca, okPlaca } from '@/lib/frota/types';
import { UUID_RE } from '@/lib/almoxarifado/stockData';

export const dynamic = 'force-dynamic';

/**
 * Cadastra veículos.
 *  - { placas: "ABC1D23 XYZ9876 …", situacao?, posto_id? } → várias placas de uma vez
 *  - { placa, …demais campos } → um veículo completo
 */
export async function POST(req: Request) {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail('Dados inválidos.');
  try {
    const user = await requireModule('frota', 'veiculos', 'edit');
    const now = new Date().toISOString();
    if ('placas' in body) {
      const list = [...new Set(String(body.placas ?? '').split(/[\s,;]+/).map(normPlaca).filter(Boolean))];
      if (!list.length) return fail('Informe pelo menos uma placa.');
      if (list.length > 300) return fail('Cadastre no máximo 300 placas por vez.');
      const bad = list.filter((p) => !okPlaca(p));
      if (bad.length) return fail(`Placa inválida: ${bad.slice(0, 5).join(', ')} (formato ABC1D23 ou ABC1234).`);
      const situacao = SITUACOES.find((s) => s === body.situacao) ?? 'Operando';
      const posto = typeof body.posto_id === 'string' && UUID_RE.test(body.posto_id) ? body.posto_id : null;
      const { data, error } = await db()
        .from('veiculos')
        .upsert(list.map((placa) => ({ placa, situacao, posto_id: posto, updated_by: user.display_name, updated_at: now })), { onConflict: 'placa', ignoreDuplicates: true })
        .select('id, placa');
      if (error) {
        const m = frotaDbMessage(error);
        if (m) return fail(m, 409);
        throw error;
      }
      const added = data?.length ?? 0;
      if (added) await broadcast('frota:update', { by: user.display_name });
      return NextResponse.json({ added, duplicates: list.length - added, ids: (data ?? []).map((d) => d.id) });
    }
    const r = await cleanRecord('veiculos', body, false);
    if ('error' in r) return fail(r.error);
    const { data, error } = await db().from('veiculos').insert({ ...r.row, updated_by: user.display_name, updated_at: now }).select('id').single();
    if (error) {
      const m = frotaDbMessage(error);
      if (m) return fail(m, 409);
      throw error;
    }
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ id: data.id, added: 1, duplicates: 0 });
  } catch (e) {
    return serverError(e);
  }
}
