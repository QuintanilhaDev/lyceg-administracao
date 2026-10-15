'use client';
import { useMemo, useState } from 'react';
import { Sheet } from '../core/Sheet';
import { useToast } from '../core/Toasts';
import { api } from '../core/api';
import { ENT, normPlaca, okPlaca, parseNum, postoLabel, type FieldDef, type FrotaData, type RecordKind } from '@/lib/frota/types';
import { toLocalInput } from '@/lib/frota/format';

/** Rota de gravação de cada tipo de registro. */
export function recordPath(kind: RecordKind, id?: string) {
  if (kind === 'veiculos') return id ? `/api/frota/veiculos/${id}` : '/api/frota/veiculos';
  return id ? `/api/frota/registros/${kind}/${id}` : `/api/frota/registros/${kind}`;
}

const valueOf = (f: FieldDef, v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (f.t === 'bool') return v === true ? '1' : v === false ? '0' : '';
  if (f.t === 'dtm') return toLocalInput(String(v));
  if (f.t === 'date') return String(v).slice(0, f.k === 'mes' ? 7 : 10);
  if (f.t === 'money' && typeof v === 'number') return String(v).replace('.', ',');
  return String(v);
};

/**
 * Formulário de qualquer registro da Frota (veículo, despesa, multa, revisão, lavagem, KM),
 * montado a partir da descrição dos campos em lib/frota/types.
 */
export function RecordForm({
  kind,
  record,
  prefill,
  veiculoId,
  data,
  onClose,
  onSaved,
}: {
  kind: RecordKind;
  /** registro existente (edição) */
  record?: Record<string, unknown> | null;
  /** valores iniciais de um cadastro novo */
  prefill?: Record<string, unknown>;
  /** quilometragem: de qual veículo */
  veiculoId?: string;
  data: FrotaData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ent = ENT[kind];
  const toast = useToast();
  const editing = Boolean(record?.id);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const src = { ...(prefill ?? {}), ...(record ?? {}) };
    const o: Record<string, string> = {};
    for (const f of ent.fields) o[f.k] = valueOf(f, src[f.k]);
    if (!editing && kind === 'veiculos' && !o.situacao) o.situacao = 'Operando';
    return o;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const suggest = useMemo(() => {
    const uniq = (l: (string | null | undefined)[]) => [...new Set(l.filter((x): x is string => Boolean(x && x.trim())))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      empresa: uniq([...data.veiculos.map((v) => v.empresa), ...data.despesas.map((d) => d.empresa)]),
      fornecedor: uniq([...data.veiculos.map((v) => v.fornecedor), ...data.multas.map((m) => m.locadora)]),
      supervisor: uniq([...data.veiculos.map((v) => v.supervisor), ...data.postos.map((p) => p.supervisor)]),
    };
  }, [data]);

  const set = (k: string, v: string) => setVals((o) => ({ ...o, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // conferência rápida aqui; o servidor confere tudo de novo
    for (const f of ent.fields) {
      const s = vals[f.k]?.trim() ?? '';
      if (f.req && !s) return setError(`Preencha "${f.l}".`);
      if (s && f.t === 'placa' && !okPlaca(normPlaca(s))) return setError(`Placa inválida em "${f.l}" (formato ABC1D23 ou ABC1234).`);
      if (s && (f.t === 'num' || f.t === 'money') && Number.isNaN(parseNum(s))) return setError(`Valor inválido em "${f.l}".`);
    }
    const body: Record<string, unknown> = {};
    for (const f of ent.fields) body[f.k] = vals[f.k]?.trim() ?? '';
    if (kind === 'km') {
      body.mes = vals.mes ? vals.mes.slice(0, 7) + '-01' : '';
      if (!editing) body.veiculo_id = veiculoId;
    }
    setBusy(true);
    try {
      await api(recordPath(kind, editing ? String(record!.id) : undefined), { method: editing ? 'PATCH' : 'POST', json: body });
      toast({ kind: 'success', title: editing ? 'Alterações salvas' : `${ent.nome.charAt(0).toUpperCase() + ent.nome.slice(1)} registrad${kind === 'veiculos' || kind === 'km' ? 'o' : 'a'}` });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const listId = (k: string) => `dl-${kind}-${k}`;
  return (
    <Sheet title={`${editing ? 'Editar' : 'Novo registro:'} ${ent.nome}`} lead={kind === 'veiculos' && editing ? String(record?.placa ?? '') : undefined} onClose={() => !busy && onClose()} wide={ent.fields.length > 8}>
      <form className="fr-form" onSubmit={save} noValidate>
        <div className="fr-grid">
          {ent.fields.map((f) => {
            const id = `fr-${kind}-${f.k}`;
            const v = vals[f.k] ?? '';
            let input: React.ReactNode;
            if (f.t === 'sel')
              input = (
                <select id={id} className="input" value={v} onChange={(e) => set(f.k, e.target.value)}>
                  <option value="">{f.req ? 'Escolha…' : '—'}</option>
                  {f.o!.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              );
            else if (f.t === 'posto')
              input = (
                <select id={id} className="input" value={v} onChange={(e) => set(f.k, e.target.value)}>
                  <option value="">Sem posto</option>
                  {data.postos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {postoLabel(p)}
                    </option>
                  ))}
                </select>
              );
            else if (f.t === 'bool')
              input = (
                <select id={id} className="input" value={v} onChange={(e) => set(f.k, e.target.value)}>
                  <option value="">—</option>
                  <option value="1">Sim</option>
                  <option value="0">Não</option>
                </select>
              );
            else if (f.t === 'area') input = <textarea id={id} className="input textarea" rows={2} value={v} maxLength={f.max ?? 1000} onChange={(e) => set(f.k, e.target.value)} />;
            else if (f.t === 'date')
              input = <input id={id} className="input" type={f.k === 'mes' ? 'month' : 'date'} value={v} onChange={(e) => set(f.k, e.target.value)} />;
            else if (f.t === 'dtm') input = <input id={id} className="input" type="datetime-local" value={v} onChange={(e) => set(f.k, e.target.value)} />;
            else
              input = (
                <input
                  id={id}
                  className={`input${f.t === 'placa' ? ' is-plate' : ''}`}
                  value={v}
                  maxLength={f.t === 'placa' ? 8 : f.max ?? 30}
                  inputMode={f.t === 'num' || f.t === 'money' ? 'decimal' : undefined}
                  list={f.t === 'placa' ? 'dl-placas' : f.suggest ? listId(f.k) : undefined}
                  autoComplete="off"
                  onChange={(e) => set(f.k, f.t === 'placa' ? e.target.value.toUpperCase() : e.target.value)}
                />
              );
            return (
              <div key={f.k} className={`fr-field${f.full || f.t === 'area' ? ' full' : ''}`}>
                {f.g ? <h4 className="fr-group">{f.g}</h4> : null}
                <label className="label" htmlFor={id}>
                  {f.l}
                  {f.req ? <em aria-hidden> *</em> : null}
                </label>
                {input}
                {f.suggest ? (
                  <datalist id={listId(f.k)}>
                    {suggest[f.suggest].map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            );
          })}
        </div>
        <datalist id="dl-placas">
          {data.veiculos.map((v) => (
            <option key={v.id} value={v.placa} />
          ))}
        </datalist>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : null} Salvar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
