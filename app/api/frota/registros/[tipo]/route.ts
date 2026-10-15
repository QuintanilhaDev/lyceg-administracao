import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireModule } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { cleanRecord, frotaDbMessage } from '@/lib/frota/server';
import { ENT, type RecordKind } from '@/lib/frota/types';
import { UUID_RE } from '@/lib/almoxarifado/stockData';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ tipo: string }> };
const KINDS: RecordKind[] = ['despesas', 'multas', 'revisoes', 'lavagens', 'km'];

/** Lança uma despesa, multa, revisão, lavagem ou a quilometragem do mês (km exige veiculo_id). */
export async function POST(req: Request, ctx: Ctx) {
  const { tipo } = await ctx.params;
  const kind = KINDS.find((k) => k === tipo);
  if (!kind) return fail('Tipo de registro desconhecido.', 404);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail('Dados inválidos.');
  try {
    const user = await requireModule('frota', ENT[kind].module, 'edit');
    const r = await cleanRecord(kind, body, false);
    if ('error' in r) return fail(r.error);
    const row: Record<string, unknown> = { ...r.row };
    if (kind === 'km') {
      if (typeof body.veiculo_id !== 'string' || !UUID_RE.test(body.veiculo_id)) return fail('Escolha o veículo.');
      row.veiculo_id = body.veiculo_id;
    } else row.created_by = user.display_name;
    const { data, error } = await db().from(ENT[kind].table).insert(row).select('id').single();
    if (error) {
      const m = frotaDbMessage(error);
      if (m) return fail(m, 409);
      throw error;
    }
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return serverError(e);
  }
}
