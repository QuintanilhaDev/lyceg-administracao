import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireModule } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { cleanRecord, frotaDbMessage } from '@/lib/frota/server';
import { UUID_RE } from '@/lib/almoxarifado/stockData';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Edita os dados do veículo. Mudar só o posto exige "Alocação"; o resto exige "Veículos". */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('Veículo não encontrado.', 404);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail('Dados inválidos.');
  try {
    const onlyPosto = Object.keys(body).every((k) => k === 'posto_id');
    const user = await requireModule('frota', onlyPosto ? ['alocacao', 'veiculos'] : 'veiculos', 'edit');
    const r = await cleanRecord('veiculos', body, true);
    if ('error' in r) return fail(r.error);
    if (!Object.keys(r.row).length) return fail('Nada para alterar.');
    const { data, error } = await db()
      .from('veiculos')
      .update({ ...r.row, updated_by: user.display_name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) {
      const m = frotaDbMessage(error);
      if (m) return fail(m, 409);
      throw error;
    }
    if (!data) return fail('Veículo não encontrado (foi removido por outra pessoa?).', 404);
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

/** Exclui o veículo (a quilometragem mensal dele vai junto; despesas e multas ficam pela placa). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('Veículo não encontrado.', 404);
  try {
    const user = await requireModule('frota', 'veiculos', 'edit');
    const { data, error } = await db().from('veiculos').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fail('Veículo não encontrado.', 404);
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
