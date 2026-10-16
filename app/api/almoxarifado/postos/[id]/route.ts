import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireAlmox } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { UUID_RE, dbMessage, str } from '@/lib/almoxarifado/stockData';
import type { PostoStockLine } from '@/lib/almoxarifado/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** O que há no posto (item a item). */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('Posto não encontrado.', 404);
  try {
    await requireAlmox('postos', 'view');
    const { data: posto, error: e1 } = await db().from('postos').select('id').eq('id', id).maybeSingle();
    if (e1) throw e1;
    if (!posto) return fail('Posto não encontrado.', 404);
    const { data, error } = await db()
      .from('posto_stock')
      .select('quantity, stock_items(id, name, size, unit)')
      .eq('posto_id', id)
      .limit(5000);
    if (error) throw error;
    const lines: PostoStockLine[] = (data ?? [])
      .map((l) => {
        const it = (Array.isArray(l.stock_items) ? l.stock_items[0] : l.stock_items) as {
          id: string;
          name: string;
          size: string | null;
          unit: string;
        } | null;
        return it ? { item_id: it.id, name: it.name, size: it.size, unit: it.unit, quantity: l.quantity as number } : null;
      })
      .filter((x): x is PostoStockLine => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || (a.size ?? '').localeCompare(b.size ?? '', 'pt-BR', { numeric: true }));
    return NextResponse.json({ lines });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('Posto não encontrado.', 404);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail('Dados inválidos.');
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('name' in body) {
    const name = str(body.name, 120);
    if (!name) return fail('Dê um nome ao posto.');
    patch.name = name;
  }
  if ('code' in body) patch.code = str(body.code, 40);
  if ('city' in body) patch.city = str(body.city, 80);
  if ('address' in body) patch.address = str(body.address, 200);
  if ('supervisor' in body) patch.supervisor = str(body.supervisor, 120);
  if ('notes' in body) patch.notes = str(body.notes, 400);
  try {
    const admin = await requireAlmox('postos', 'edit');
    const { data, error } = await db().from('postos').update(patch).eq('id', id).select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') return fail('Já existe um posto com esse nome.', 409);
      throw error;
    }
    if (!data) return fail('Posto não encontrado.', 404);
    await broadcast('postos:update', { by: admin.display_name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

/** Remove o posto. O que estava nele volta para o almoxarifado (com histórico). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('Posto não encontrado.', 404);
  try {
    const admin = await requireAlmox('postos', 'edit');
    const first = await db().rpc('remove_posto', { p_posto: id, p_by: admin.display_name });
    let data: unknown = first.data;
    let error: { code?: string; message: string } | null = first.error;
    if (error && /remove_posto|PGRST202|schema cache/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) {
      // banco sem a função remove_posto: devolve item por item (cada devolução é atômica) e depois remove o posto
      ({ data, error } = await removePostoStepByStep(id, admin.display_name));
    }
    if (error) {
      const m = dbMessage(error);
      if (m) return fail(m, 404);
      throw error;
    }
    await broadcast('postos:update', { by: admin.display_name });
    await broadcast('stock:update', { by: admin.display_name });
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    return serverError(e);
  }
}

async function removePostoStepByStep(id: string, by: string): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
  const { data: posto, error: e0 } = await db().from('postos').select('id, name').eq('id', id).maybeSingle();
  if (e0) return { data: null, error: e0 };
  if (!posto) return { data: null, error: { code: 'P0001', message: 'Posto não encontrado.' } };
  const { data: rows, error: e1 } = await db().from('posto_stock').select('item_id, quantity').eq('posto_id', id).order('item_id');
  if (e1) return { data: null, error: e1 };
  let returned = 0;
  for (const r of (rows ?? []) as { item_id: string; quantity: number }[]) {
    const { error } = await db().rpc('stock_move', { p_item: r.item_id, p_kind: 'devolucao', p_qty: r.quantity, p_posto: id, p_note: 'Posto removido', p_by: by });
    if (error) return { data: null, error };
    returned += r.quantity;
  }
  const { error: e2 } = await db().from('postos').delete().eq('id', id);
  if (e2) return { data: null, error: e2 };
  return { data: { returned, name: posto.name }, error: null };
}
