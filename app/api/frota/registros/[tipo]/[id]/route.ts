import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireModule } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { cleanRecord, frotaDbMessage } from '@/lib/frota/server';
import { ENT, type RecordKind } from '@/lib/frota/types';
import { UUID_RE } from '@/lib/almoxarifado/stockData';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ tipo: string; id: string }> };
const KINDS: RecordKind[] = ['despesas', 'multas', 'revisoes', 'lavagens', 'km'];

export async function PATCH(req: Request, ctx: Ctx) {
  const { tipo, id } = await ctx.params;
  const kind = KINDS.find((k) => k === tipo);
  if (!kind || !UUID_RE.test(id)) return fail('Registro não encontrado.', 404);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail('Dados inválidos.');
  try {
    const user = await requireModule('frota', ENT[kind].module, 'edit');
    const r = await cleanRecord(kind, body, true);
    if ('error' in r) return fail(r.error);
    if (!Object.keys(r.row).length) return fail('Nada para alterar.');
    const { data, error } = await db().from(ENT[kind].table).update(r.row).eq('id', id).select('id').maybeSingle();
    if (error) {
      const m = frotaDbMessage(error);
      if (m) return fail(m, 409);
      throw error;
    }
    if (!data) return fail('Registro não encontrado (foi removido por outra pessoa?).', 404);
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { tipo, id } = await ctx.params;
  const kind = KINDS.find((k) => k === tipo);
  if (!kind || !UUID_RE.test(id)) return fail('Registro não encontrado.', 404);
  try {
    const user = await requireModule('frota', ENT[kind].module, 'edit');
    const { data, error } = await db().from(ENT[kind].table).delete().eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fail('Registro não encontrado.', 404);
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
