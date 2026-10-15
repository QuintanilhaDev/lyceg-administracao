'use client';
import { CalendarClock, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { ativo, devolucaoAlerts, revisaoAlerts, todayISO, type FrotaData } from '@/lib/frota/types';
import { fmtBRL, fmtCompact, fmtMes, fmtNum } from '@/lib/frota/format';
import { Columns, Plate, Ranking } from './ui';

const group = <T,>(arr: T[], key: (r: T) => string | null | undefined, val: (r: T) => number) => {
  const m = new Map<string, number>();
  arr.forEach((r) => {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + (Number(val(r)) || 0));
  });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};
const topN = <T,>(arr: T[], key: (r: T) => string | null | undefined, n = 8) => {
  const m = new Map<string, number>();
  arr.forEach((r) => {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([l, v]) => ({ l, v }));
};

/** Painel da frota: indicadores, alertas e gráficos por mês. */
export function PainelFrota({ data, onOpen }: { data: FrotaData; onOpen: (id: string, tab?: 'resumo' | 'contrato') => void }) {
  const p = useMemo(() => {
    const at = data.veiculos.filter(ativo);
    const cur = todayISO().slice(0, 7);
    const mark = (k: string) => fmtMes(k) + (k.slice(0, 7) === cur ? '*' : '');
    const km = group(data.km, (k) => k.mes, (k) => k.km_total ?? 0).map(([k, v]) => ({ l: mark(k), v }));
    const comb = group(data.km, (k) => k.mes, (k) => k.comb_cartao ?? 0).map(([k, v]) => ({ l: mark(k), v }));
    const both = data.km.filter((k) => (k.km_total ?? 0) > 0 && (k.comb_cartao ?? 0) > 0);
    const cpk = group(both, (k) => k.mes, (k) => k.comb_cartao ?? 0).map(([k, v]) => ({ l: mark(k), v: v / (both.filter((x) => x.mes === k).reduce((t, x) => t + (x.km_total ?? 0), 0) || 1) }));
    const desp = group(data.despesas, (r) => (r.data ? r.data.slice(0, 7) + '-01' : null), (r) => r.valor).map(([k, v]) => ({ l: mark(k), v }));
    const multV = new Map<string, number>();
    data.multas.forEach((m) => m.placa && multV.set(m.placa, (multV.get(m.placa) ?? 0) + (Number(m.valor) || 0)));
    const sum = (l: { valor: number }[]) => l.reduce((t, r) => t + (Number(r.valor) || 0), 0);
    return {
      at,
      km: km.slice(-12),
      comb: comb.slice(-12),
      cpk: cpk.slice(-12),
      desp: desp.slice(-12),
      rev: revisaoAlerts(data.veiculos, data.revisoes),
      dev: devolucaoAlerts(data.veiculos, 60),
      multTop: [...multV.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, v]) => ({ l, v })),
      tM: sum(data.multas),
      tD: sum(data.despesas),
      tL: sum(data.lavagens),
    };
  }, [data]);

  const kpis: [string, string][] = [
    [fmtNum(p.at.length), 'Frota ativa'],
    [fmtNum(p.at.filter((v) => v.tipo === 'CARRO').length), 'Carros'],
    [fmtNum(p.at.filter((v) => v.tipo === 'MOTO').length), 'Motos'],
    [fmtNum(p.dev.length), 'Devoluções ≤ 60 dias'],
    [fmtNum(p.rev.length), 'Revisões a fazer'],
    ['R$ ' + fmtCompact(p.tM), 'Multas (total)'],
    ['R$ ' + fmtCompact(p.tD), 'Despesas (total)'],
    ['R$ ' + fmtCompact(p.tL), 'Lavagens (total)'],
  ];

  return (
    <div className="section-scroll">
      <div className="section-pad wide">
        <div className="section-head">
          <div>
            <h1>Painel da frota</h1>
            <p>Indicadores, alertas e gastos mês a mês.</p>
          </div>
        </div>
        <div className="stat-grid fr-kpis">
          {kpis.map(([n, t]) => (
            <div key={t} className="stat">
              <small>{t}</small>
              <b>{n}</b>
            </div>
          ))}
        </div>
        <div className="fr-cards">
          <section className="panel fr-card">
            <h3>
              <Wrench size={17} /> Atenção: revisões
            </h3>
            {p.rev.length ? (
              <ul className="fr-alerts">
                {p.rev.slice(0, 8).map((x) => (
                  <li key={x.v.id}>
                    <Plate placa={x.v.placa} onClick={() => onOpen(x.v.id, 'resumo')} />
                    <span>{x.v.modelo ?? ''}</span>
                    <em className={x.falta <= 0 ? 'bad' : 'warn'}>{x.falta <= 0 ? 'vencida' : `faltam ${fmtNum(x.falta)} km`}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="help">Nenhuma revisão próxima.</p>
            )}
            {p.rev.length > 8 ? <p className="help">+ {p.rev.length - 8} outros</p> : null}
          </section>
          <section className="panel fr-card">
            <h3>
              <CalendarClock size={17} /> Atenção: devoluções previstas
            </h3>
            {p.dev.length ? (
              <ul className="fr-alerts">
                {p.dev.slice(0, 8).map(({ v, d }) => (
                  <li key={v.id}>
                    <Plate placa={v.placa} onClick={() => onOpen(v.id, 'contrato')} />
                    <span>{v.fornecedor ?? v.modelo ?? ''}</span>
                    <em className={d < 0 ? 'bad' : 'warn'}>{d < 0 ? `há ${-d} d` : `em ${d} d`}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="help">Nenhuma devolução nos próximos 60 dias.</p>
            )}
            {p.dev.length > 8 ? <p className="help">+ {p.dev.length - 8} outros (veja em Veículos)</p> : null}
          </section>
          <section className="panel fr-card">
            <h3>KM rodados por mês</h3>
            <Columns items={p.km} fmt={(n) => fmtCompact(n)} />
            <p className="help">* mês em andamento</p>
          </section>
          <section className="panel fr-card">
            <h3>Combustível no cartão (R$)</h3>
            <Columns items={p.comb} fmt={(n) => fmtCompact(n)} />
            <p className="help">* mês em andamento</p>
          </section>
          <section className="panel fr-card">
            <h3>Custo de combustível por km (R$/km)</h3>
            <Columns items={p.cpk} fmt={(n) => n.toFixed(2).replace('.', ',')} />
            <p className="help">Combustível no cartão ÷ KM rodados (veículos com os dois dados).</p>
          </section>
          <section className="panel fr-card">
            <h3>Despesas por mês (R$)</h3>
            <Columns items={p.desp} fmt={(n) => fmtCompact(n)} />
          </section>
          <section className="panel fr-card">
            <h3>Frota por fornecedor</h3>
            <Ranking items={topN(p.at, (v) => v.fornecedor)} fmt={fmtNum} />
          </section>
          <section className="panel fr-card">
            <h3>Frota por supervisor</h3>
            <Ranking items={topN(p.at, (v) => v.supervisor)} fmt={fmtNum} />
          </section>
          <section className="panel fr-card">
            <h3>Frota por posto (planilha)</h3>
            <Ranking items={topN(p.at, (v) => v.posto_planilha)} fmt={fmtNum} />
          </section>
          <section className="panel fr-card">
            <h3>Multas por veículo (R$)</h3>
            <Ranking items={p.multTop} fmt={fmtBRL} />
          </section>
        </div>
      </div>
    </div>
  );
}
