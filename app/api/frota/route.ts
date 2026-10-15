import { NextResponse } from 'next/server';
import { requireModule } from '@/lib/access';
import { serverError } from '@/lib/http';
import { loadFrota } from '@/lib/frota/server';

export const dynamic = 'force-dynamic';

const MODULES = ['painel', 'veiculos', 'alocacao', 'operacao', 'postos'];

/** Tudo da Frota (veículos, postos com localização, KM e operação). */
export async function GET() {
  try {
    await requireModule('frota', MODULES, 'view');
    return NextResponse.json(await loadFrota(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return serverError(e);
  }
}
