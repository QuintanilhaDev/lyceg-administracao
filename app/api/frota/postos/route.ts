import { NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { requireModule } from '@/lib/access';
import { fail, readJson, serverError } from '@/lib/http';
import { broadcast } from '@/lib/broadcast';
import { str } from '@/lib/almoxarifado/stockData';
import { frotaDbMessage } from '@/lib/frota/server';
import { geoFields } from '@/lib/frota/geo';

export const dynamic = 'force-dynamic';

/** Cadastra um posto com a localização (o mesmo cadastro de postos do Almoxarifado). */
export async function POST(req: Request) {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail('Dados inválidos.');
  try {
    const user = await requireModule('frota', 'postos', 'edit');
    const code = str(body.code, 40);
    const name = str(body.name, 120) ?? (code ? `Posto ${code}` : null);
    if (!name) return fail('Informe a numeração ou o nome do posto.');
    const address = str(body.address, 200);
    if (!address) return fail('Informe o endereço do posto.');
    const geo = geoFields(body);
    if ('error' in geo) return fail(geo.error);
    const { data, error } = await db()
      .from('postos')
      .insert({ name, code, address, city: str(body.city, 80), supervisor: str(body.supervisor, 120), created_by: user.display_name, ...geo.row })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return fail('Já existe um posto com esse nome.', 409);
      const m = frotaDbMessage(error);
      if (m) return fail(m, 409);
      throw error;
    }
    await broadcast('postos:update', { by: user.display_name });
    await broadcast('frota:update', { by: user.display_name });
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return serverError(e);
  }
}
