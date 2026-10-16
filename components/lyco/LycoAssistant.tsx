'use client';
import { auditLyco } from '@/lib/auditClient';
import { lycoRun, type RunStep } from '@/lib/lyco/runner';
import { holdBus } from '@/lib/lyco/bus';
import { fx } from '@/lib/fx';
import { AnimatePresence, motion } from 'framer-motion';
import { Keyboard, Mic, SendHorizontal, Square, ThumbsDown, ThumbsUp, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking, loadVoices } from '@/lib/voice';
import { lycoJustNavigated } from '@/lib/lyco/runner';
import { capabilities } from '@/lib/lyco/skills-core';
import { examplesFor, hear, think, type AgentAnswer, type RemoteAnswer } from '@/lib/lyco/engine';
import { Listener, listenSupported, type ListenState } from '@/lib/lyco/speech';
import { signatureKey, type Learned } from '@/lib/lyco/learn';

/** quanto ela espera alguém falar: depois do clique · depois de uma resposta (para continuar a conversa) */
const WAIT_MS = 14000;
const FOLLOW_MS = 8000;
import { sfx } from '@/lib/lyco/sfx';
import { useLycoBus } from '@/lib/lyco/bus';
import type { LycoCard, LycoHost, LycoMemory, LycoReply } from '@/lib/lyco/types';
import { LycoShark, type OrbState } from './LycoShark';
import './lyco.css';

interface Entry {
  id: number;
  who: 'you' | 'lyco';
  text: string;
  card?: LycoCard;
  chips?: string[];
  source?: string;
  /** pedido que gerou esta resposta (para o 👍/👎) */
  asked?: string;
  rated?: 'up' | 'down';
}

const VOICE_PREF = 'lyceg:voz';
const SOURCE_LABEL: Record<string, string> = { wikipedia: 'Wikipédia', clima: 'Open-Meteo', cambio: 'cotação online', ia: 'IA', web: 'pesquisa na web', memoria: 'aprendido com o uso', aviso: 'aviso do sistema' };

/**
 * O Lyco nas ferramentas dos setores: o tubarão no canto inferior direito.
 * Clique nele, espere ele virar de lado com a corneta no ouvido e diga "Lyco, …". Também aceita o pedido digitado.
 */
/** O Lyco vê o mesmo host; trocar de aba, de página ou apertar um botão entra na fila de passos executados na hora. */
function runHost(base: LycoHost, runs: RunStep[] & { open?: boolean }): LycoHost {
  return {
    ...base,
    goTab: (id) => {
      if (base.tab === id) return base.goTab(id);
      const step: RunStep = { kind: 'tab', id, exec: () => base.goTab(id) };
      if (runs.open === false) void lycoRun([step]);
      else runs.push(step);
    },
    // dentro da ação, a troca entra na fila (antes dos botões seguintes); depois da fala, corre na hora
    navigate: (path) => {
      const step: RunStep = { kind: 'path', path };
      if (runs.open === false) void lycoRun([step]);
      else runs.push(step);
    },
    press: (sel, opts) => {
      const step: RunStep = { kind: 'press', sel, exec: opts?.exec, skipActive: opts?.skipActive };
      if (runs.open === false) void lycoRun([step]);
      else runs.push(step);
    },
  };
}

export function LycoAssistant({ host }: { host: LycoHost }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<OrbState>('idle');
  const [listen, setListen] = useState<ListenState>('off');
  const [interim, setInterim] = useState('');
  const [feed, setFeed] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [note, setNote] = useState('');
  const [typing, setTyping] = useState(false);

  const hostRef = useRef(host);
  hostRef.current = host;
  const listener = useRef<Listener | null>(null);
  const seq = useRef(0);
  const idSeq = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const followUp = useRef(false);
  const startRef = useRef<(follow?: boolean) => void>(() => undefined);
  const memory = useRef<LycoMemory>({ last: null, lastInput: '', voiceOn: true, setVoice: () => undefined });

  const setVoice = useCallback((on: boolean) => {
    memory.current.voiceOn = on;
    setVoiceOn(on);
    if (!on) stopSpeaking();
    try {
      localStorage.setItem(VOICE_PREF, on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, []);
  memory.current.setVoice = setVoice;

  useEffect(() => {
    try {
      if (localStorage.getItem(VOICE_PREF) === 'off') {
        memory.current.voiceOn = false;
        setVoiceOn(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const push = useCallback((e: Omit<Entry, 'id'>) => {
    setFeed((f) => [...f.slice(-11), { ...e, id: ++idSeq.current }]);
  }, []);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed, interim, status]);

  const remote = useCallback(async (text: string, examples: string[], mode?: 'route'): Promise<RemoteAnswer | null> => {
    const h = hostRef.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), mode === 'route' ? 7000 : 15000);
    try {
      const r = await fetch('/api/lyco/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({ text, examples, mode, scope: h.scope, sector: h.sector?.slug ?? null }),
      });
      if (!r.ok) return null;
      return (await r.json()) as RemoteAnswer;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  /** O que o Lyco já aprendeu nesta tela (pedidos resolvidos antes viram resposta na hora). */
  const learned = useRef<Learned[]>([]);
  const place = () => {
    const h = hostRef.current;
    return { scope: h.scope, sector: h.sector?.slug ?? null };
  };
  const loadLearned = useCallback(async () => {
    const { scope, sector } = place();
    if (scope === 'login') return;
    try {
      const r = await fetch(`/api/lyco/memoria?scope=${scope}&sector=${sector ?? ''}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return;
      const j = (await r.json()) as { learned?: Learned[] };
      if (Array.isArray(j.learned)) learned.current = j.learned;
    } catch {
      /* sem memória: segue normal */
    }
  }, []);
  useEffect(() => {
    void loadLearned();
  }, [loadLearned, host.scope, host.sector?.slug]);
  const tell = useCallback((body: Record<string, unknown>) => {
    void fetch('/api/lyco/memoria', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...place(), ...body }) }).catch(() => undefined);
  }, []);

  /** Agente do servidor: IA com ferramentas (consulta, prepara alterações, pesquisa na web). */
  const history = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const agent = useCallback(async (text: string, examples: string[], hint?: string): Promise<AgentAnswer | null> => {
    const h = hostRef.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);
    try {
      const r = await fetch('/api/lyco/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({ text, examples, hint, scope: h.scope, sector: h.sector?.slug ?? null, history: history.current.slice(-6) }),
      });
      if (!r.ok) return null;
      const ans = (await r.json()) as AgentAnswer;
      if (ans.route) setTimeout(() => void loadLearned(), 1500); // acabou de aprender um comando: atualiza a memória
      return ans;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }, [loadLearned]);

  /* ---------- avisos (ex.: "chegou uma solicitação de compra") ---------- */
  const [alert, setAlert] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const announceQueue = useRef<{ text: string; at: number }[]>([]);
  const announcing = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runAnnounce = useCallback(() => {
    if (announcing.current || retry.current) return;
    const nextOne = announceQueue.current[0];
    if (!nextOne) return;
    const st = statusRef.current;
    // no meio de uma conversa: espera a resposta terminar (até 60 s pensando, 25 s falando)
    const waited = Date.now() - nextOne.at;
    if ((st === 'thinking' && waited < 60_000) || (st === 'speaking' && waited < 25_000)) {
      retry.current = setTimeout(() => {
        retry.current = null;
        runAnnounce();
      }, 1200);
      return;
    }
    announceQueue.current.shift();
    announcing.current = true;
    if (st === 'listening') {
      // estava só ouvindo: o aviso tem prioridade (a pessoa fala de novo depois)
      seq.current++;
      listener.current?.stop();
      setInterim('');
    }
    setAlert(true);
    setStatus('speaking');
    push({ who: 'lyco', text: nextOne.text, source: 'aviso' });
    const my = seq.current;
    const finish = () => {
      announcing.current = false;
      setAlert(false);
      // só volta ao repouso se ninguém começou outra coisa (clicar para falar, digitar) durante o aviso
      if (seq.current === my) setStatus((s) => (s === 'speaking' ? 'idle' : s));
      if (announceQueue.current.length) setTimeout(runAnnounce, 400);
    };
    if (memory.current.voiceOn) speak(nextOne.text, { onEnd: () => setTimeout(finish, 300) });
    else setTimeout(finish, 4000); // voz desligada: só pisca
  }, [push]);
  useLycoBus('lyco:announce', (p) => {
    // mesmo aviso repetido (tempo real + consulta) não é falado duas vezes
    if (announceQueue.current.some((q) => q.text === p.text)) return;
    announceQueue.current.push({ text: p.text, at: Date.now() });
    runAnnounce();
  });

  const close = useCallback(() => {
    seq.current++;
    listener.current?.stop();
    stopSpeaking();
    setStatus('idle');
    setInterim('');
    setOpen(false);
    setTyping(false);
  }, []);

  /** Processa um pedido (falado ou digitado). */
  const ask = useCallback(
    async (raw: string, byVoice = false) => {
      const shown = raw.trim();
      if (!shown) return;
      const my = ++seq.current;
      const runs: RunStep[] & { open?: boolean } = [];
      listener.current?.stop();
      stopSpeaking();
      setInterim('');
      setNote('');
      const h = hear(shown);
      // o clique já é a chamada: "Lyco," no começo é aceito, mas não obrigatório
      const command = h.wake === 'strong' ? h.command : shown;
      push({ who: 'you', text: shown });
      setStatus('thinking');
      let reply: LycoReply;
      try {
        reply = await think(command, runHost(hostRef.current, runs), {
          memory: memory.current,
          remote,
          agent,
          raw: shown,
          learned: learned.current,
          report: (e) => {
            if (e.type === 'feedback') {
              const k = signatureKey(shown);
              learned.current = learned.current.filter((l) => signatureKey(l.phrase) !== k);
            }
            tell({ ...e, phrase: shown });
          },
        });
      } catch {
        reply = { say: 'Tive um problema para responder. Tente de novo.' };
      }
      if (my !== seq.current) return;
      if (reply.source === 'stop') return close();
      memory.current.last = reply;
      memory.current.lastInput = shown;
      history.current = [...history.current, { role: 'user' as const, content: shown }, { role: 'assistant' as const, content: reply.say || reply.text || '' }].filter((m) => m.content).slice(-8);
      if (hostRef.current.scope !== 'login') auditLyco(shown, reply.text ?? reply.say);
      push({ who: 'lyco', text: reply.text ?? reply.say, card: reply.card, chips: reply.chips, source: reply.source, asked: reply.source === 'bloqueio' || reply.source === 'stop' ? undefined : shown });
      // trocas de tela pedidas pelo Lyco: executadas na hora, em sequência
      const release = holdBus();
      try {
        await reply.act?.();
      } catch (e) {
        console.error('[lyco] ação', e);
      }
      runs.open = false;
      if (runs.length) {
        const all = runs.splice(0);
        void lycoRun(all, release);
        setTimeout(release, 12000);
      } else release();
      const done = () => {
        if (my !== seq.current) return;
        setStatus('idle');
        reply.afterSpeech?.();
        // conversa natural: quem falou pode continuar falando, sem clicar de novo
        if (byVoice && !reply.afterSpeech && !reply.unknown && openRef.current) startRef.current(true);
      };
      if (!reply.say || !memory.current.voiceOn) {
        if (reply.afterSpeech) {
          setStatus('idle');
          setTimeout(done, 900);
        } else done();
        return;
      }
      setStatus('speaking');
      speak(reply.say, {
        onEnd: (result) => {
          if (result === 'cancelled' && my !== seq.current) return;
          done();
        },
      });
    },
    [close, push, remote, agent, tell],
  );

  /** 👍/👎: é assim que o Lyco aprende o que acertou e o que errou. */
  const rate = useCallback(
    (e: Entry, good: boolean) => {
      if (!e.asked || e.rated) return;
      setFeed((f) => f.map((x) => (x.id === e.id ? { ...x, rated: good ? 'up' : 'down' } : x)));
      if (!good) {
        const k = signatureKey(e.asked);
        learned.current = learned.current.filter((l) => signatureKey(l.phrase) !== k);
      }
      tell({ type: 'feedback', good, phrase: e.asked, answer: e.text });
    },
    [tell],
  );

  const startListening = useCallback((follow = false) => {
    const l = listener.current;
    if (!l) return;
    followUp.current = follow;
    if (follow && (l.state === 'denied' || !listenSupported())) return;
    seq.current++;
    stopSpeaking();
    setInterim('');
    setNote('');
    if (!listenSupported()) {
      setTyping(true);
      setNote('Este navegador não tem reconhecimento de voz (use Chrome, Edge ou Safari). Digite o pedido abaixo.');
      setStatus('idle');
      setTimeout(() => inputRef.current?.focus(), 60);
      return;
    }
    setStatus('listening');
    l.start(follow ? FOLLOW_MS : WAIT_MS);
  }, []);
  startRef.current = startListening;

  useEffect(() => {
    const l = new Listener({
      mode: 'once',
      onTrouble: (kind) => {
        setStatus('idle');
        setTyping(true);
        setNote(
          kind === 'mic'
            ? 'Não encontrei um microfone neste aparelho. Digite o pedido abaixo.'
            : 'O reconhecimento de voz deste navegador não respondeu (alguns, como Brave e Opera, bloqueiam). No Chrome ou no Edge eu ouço normalmente. Por aqui, digite o pedido.',
        );
      },
      onState: (s) => {
        setListen(s);
        if (s === 'denied') {
          setStatus('idle');
          setTyping(true);
          setNote('O microfone está bloqueado para este site. Libere no cadeado da barra de endereço, ou digite o pedido.');
        }
      },
      onInterim: (t) => setInterim(t),
      onFinal: (text, alts) => {
        // entre as alternativas ouvidas, prefere a que começa com "Lyco"
        const best = alts.find((a) => hear(a).wake === 'strong') ?? text;
        sfx.heard();
        void ask(best, true);
      },
      onSilence: () => {
        setInterim('');
        setStatus((s) => (s === 'listening' ? 'idle' : s));
        // depois de uma resposta, o silêncio só encerra a conversa (sem aviso)
        if (openRef.current && !followUp.current) setNote('Não ouvi nada. Clique em mim e fale de novo, ou digite o pedido.');
      },
    });
    listener.current = l;
    return () => {
      l.destroy();
      listener.current = null;
      // trocando de página por um pedido ao Lyco: a frase dele ("Abrindo…") continua na tela nova
      if (!lycoJustNavigated()) stopSpeaking();
    };
  }, [ask]);

  const orbClick = () => {
    if (!open) {
      setOpen(true);
      loadVoices();
      startListening();
      return;
    }
    if (status === 'listening') {
      listener.current?.stop();
      setStatus('idle');
      setInterim('');
      return;
    }
    startListening();
  };

  // Esc fecha; Alt+M abre/ouve
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) {
        // não rouba o Esc de janelas abertas por cima
        if (document.querySelector('.overlay, .drawer-overlay')) return;
        close();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyM') {
        e.preventDefault();
        if (!openRef.current) {
          setOpen(true);
          loadVoices();
        }
        startListening();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close, startListening]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    setInput('');
    void ask(t);
  };

  const label = status === 'listening' ? 'Ouvindo…' : status === 'thinking' ? 'Pensando…' : status === 'speaking' ? 'Falando…' : 'Pronto';
  const chips = feed.length ? [] : capabilities(host);
  const micReady = listen !== 'unsupported' && listen !== 'denied';

  return (
    <div className={`lyco-dock${open ? ' is-open' : ''}`}>
      <AnimatePresence>
        {open ? (
          <motion.section
            className="lyco-panel"
            role="dialog"
            aria-label="Lyco, assistente virtual"
            {...fx.bubble}
          >
            <header className="lyco-head">
              <div>
                <strong>Lyco</strong>
                <span className={`lyco-status is-${status}`} aria-live="polite">
                  {label}
                </span>
              </div>
              <button className="icon-btn" onClick={() => setVoice(!voiceOn)} aria-label={voiceOn ? 'Desligar a voz do Lyco' : 'Ligar a voz do Lyco'} title={voiceOn ? 'Voz ligada' : 'Voz desligada'}>
                {voiceOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
              <button className="icon-btn" onClick={close} aria-label="Fechar o Lyco" title="Fechar (Esc)">
                <X size={17} />
              </button>
            </header>

            <div className="lyco-feed" ref={feedRef}>
              {feed.length === 0 && !interim ? (
                <p className="lyco-empty">
                  {status === 'listening' ? 'Pode falar. Comece com “Lyco,” e diga o que precisa.' : 'Toque no tubarão e diga “Lyco,” seguido do pedido.'}
                </p>
              ) : null}
              {feed.map((e) => (
                <div key={e.id} className={`lyco-msg ${e.who}`}>
                  {e.text ? <p>{e.text}</p> : null}
                  {e.card ? <Card card={e.card} /> : null}
                  {e.source && SOURCE_LABEL[e.source] ? <small className="lyco-source">Fonte: {SOURCE_LABEL[e.source]}</small> : null}
                  {e.who === 'lyco' && e.asked ? (
                    <div className={`lyco-rate${e.rated ? ' is-rated' : ''}`}>
                      {e.rated ? (
                        <small>{e.rated === 'up' ? 'Obrigado! Guardei que acertei.' : 'Anotado. Vou melhorar nisso.'}</small>
                      ) : (
                        <>
                          <button onClick={() => rate(e, true)} aria-label="Resposta certa" title="Acertou">
                            <ThumbsUp size={13} />
                          </button>
                          <button onClick={() => rate(e, false)} aria-label="Resposta errada" title="Errou">
                            <ThumbsDown size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                  {e.chips?.length ? (
                    <div className="lyco-chips">
                      {e.chips.map((c) => (
                        <button key={c} onClick={() => void ask(c)}>
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {interim ? (
                <div className="lyco-msg you is-interim">
                  <p>{interim}</p>
                </div>
              ) : null}
              {status === 'thinking' ? (
                <div className="lyco-msg lyco is-thinking" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
              {note ? <p className="lyco-note">{note}</p> : null}
              {chips.length ? (
                <div className="lyco-chips">
                  {chips.map((c) => (
                    <button key={c} onClick={() => void ask(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {typing ? (
              <form className="lyco-input" onSubmit={submit}>
                <input
                  ref={inputRef}
                  className="input"
                  value={input}
                  maxLength={300}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Lyco, …"
                  aria-label="Pedido para o Lyco"
                  autoComplete="off"
                />
                <button className="icon-btn" type="submit" disabled={!input.trim()} aria-label="Enviar pedido">
                  <SendHorizontal size={18} />
                </button>
              </form>
            ) : (
              <div className="lyco-foot">
                {status === 'speaking' ? (
                  <button
                    className="lyco-foot-btn"
                    onClick={() => {
                      seq.current++;
                      stopSpeaking();
                      setStatus('idle');
                    }}
                  >
                    <Square size={13} /> Parar de falar
                  </button>
                ) : micReady ? (
                  <button className="lyco-foot-btn" onClick={orbClick}>
                    <Mic size={14} /> {status === 'listening' ? 'Parar de ouvir' : 'Falar'}
                  </button>
                ) : null}
                <button
                  className="lyco-foot-btn"
                  onClick={() => {
                    setTyping(true);
                    setTimeout(() => inputRef.current?.focus(), 60);
                  }}
                >
                  <Keyboard size={14} /> Digitar
                </button>
              </div>
            )}
          </motion.section>
        ) : null}
      </AnimatePresence>

      <button
        className={`lyco-fab is-${status}${alert ? ' is-alert' : ''}`}
        onClick={orbClick}
        aria-label={open ? (status === 'listening' ? 'Lyco está ouvindo. Clique para parar' : 'Falar com o Lyco') : 'Abrir o Lyco, assistente virtual'}
        aria-expanded={open}
        title="Lyco (Alt+M)"
      >
        <LycoShark size={132} state={status} alert={alert} />
      </button>
    </div>
  );
}

function Card({ card }: { card: LycoCard }) {
  if (card.kind === 'stats') {
    return (
      <div className="lyco-card">
        {card.title ? <b className="lyco-card-title">{card.title}</b> : null}
        <div className="lyco-stats">
          {card.stats.map((s) => (
            <div key={s.label} className={`lyco-stat ${s.tone ?? 'plain'}${s.value.length > 8 ? ' is-long' : ''}`}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        {card.foot ? <small>{card.foot}</small> : null}
      </div>
    );
  }
  return (
    <div className="lyco-card">
      {card.title ? <b className="lyco-card-title">{card.title}</b> : null}
      <ul className="lyco-rows">
        {card.rows.map((r, i) => (
          <li key={i}>
            <span>
              {r.label}
              {r.sub ? <small>{r.sub}</small> : null}
            </span>
            {r.value ? <b>{r.value}</b> : null}
          </li>
        ))}
      </ul>
      {card.foot ? <small>{card.foot}</small> : null}
    </div>
  );
}
