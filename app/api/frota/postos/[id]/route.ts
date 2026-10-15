import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireModule } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { UUID_RE, str } from '@/lib/almoxarifado/stockData';
import { frotaDbMessage } from '@/lib/frota/server';
import { geoFields } from '@/lib/frota/geo';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('Posto não encontrado.', 404);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail('Dados inválidos.');
  try {
    const user = await requireModule('frota', 'postos', 'edit');
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('code' in body) patch.code = str(body.code, 40);
    if ('name' in body) {
      const name = str(body.name, 120) ?? (patch.code ? `Posto ${patch.code}` : null);
      if (!name) return fail('Informe o nome do posto.');
      patch.name = name;
    }
    if ('address' in body) {
      const a = str(body.address, 200);
      if (!a) return fail('Informe o endereço do posto.');
      patch.address = a;
    }
    if ('city' in body) patch.city = str(body.city, 80);
    if ('supervisor' in body) patch.supervisor = str(body.supervisor, 120);
    if ('lat' in body || 'lng' in body) {
      const geo = geoFields(body);
      if ('error' in geo) return fail(geo.error);
      Object.assign(patch, geo.row);
    }
    const { data, error } = await db().from('postos').update(patch).eq('id', id).select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') return fail('Já existe um posto com esse nome.', 409);
      const m = frotaDbMessage(error);
      if (m) return fail(m, 409);
      throw error;
    }
    if (!data) return fail('Posto não encontrado.', 404);
    await broadcast('postos:update', { by: user.display_name });
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * Remove o posto pela Frota. Os veículos dele ficam sem posto. Se o posto ainda guarda
 * itens do almoxarifado, a remoção fica com o Almoxarifado (lá o material volta ao estoque).
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('Posto não encontrado.', 404);
  try {
    const user = await requireModule('frota', 'postos', 'edit');
    const { count, error: ce } = await db().from('posto_stock').select('item_id', { count: 'exact', head: true }).eq('posto_id', id).gt('quantity', 0);
    if (ce) throw ce;
    if (count) return fail('Este posto ainda guarda itens do almoxarifado. Remova-o pelo Almoxarifado, que devolve o material ao estoque.', 409);
    const { data, error } = await db().from('postos').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fail('Posto não encontrado.', 404);
    await broadcast('postos:update', { by: user.display_name });
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
