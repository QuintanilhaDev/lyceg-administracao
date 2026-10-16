'use client';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { markLycoNavigation, setRunner, type RunStep } from '@/lib/lyco/runner';
import { preloadSector } from '../setores/SectorApp';

/**
 * Troca de tela. Pelo clique ou pelo Lyco, a página troca direto (com a entrada em 3D das telas).
 * Os comandos do Lyco são executados na hora, sem animação de deslocamento: aba, botão e
 * troca de setor acontecem em sequência, o mais rápido possível.
 */
interface WarpOptions {
  /** o Lyco já está falando a frase (mantido por compatibilidade) */
  spoken?: boolean;
}
interface WarpApi {
  go: (path: string, opts?: WarpOptions) => void;
}
const Ctx = createContext<WarpApi>({
  go: (path) => {
    window.location.href = path;
  },
});
export const useWarp = () => useContext(Ctx);

const clean = (p: string) => p.split(/[?#]/)[0];
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const first = (sel: string): HTMLElement | null => [...document.querySelectorAll(sel)].find(visible) as HTMLElement | null ?? null;
/** espera o botão aparecer (a tela pode estar abrindo) */
async function waitFirst(sel: string, ms: number): Promise<HTMLElement | null> {
  const t0 = Date.now();
  for (;;) {
    const el = first(sel);
    if (el && !(el as HTMLButtonElement).disabled) return el;
    if (Date.now() - t0 > ms) return el;
    await wait(80);
  }
}

/**
 * Botão que abre a janela de arquivos: o navegador só deixa abrir com um clique de verdade da pessoa.
 * Depois do soco, aparece um cartãozinho ao lado do botão para escolher ou arrastar o arquivo.
 */
function showFilePick(btn: HTMLElement, inputSel: string) {
  const input = document.querySelector(inputSel) as HTMLInputElement | null;
  if (!input) return;
  document.querySelector('.lyco-filepick')?.remove();
  const r = btn.getBoundingClientRect();
  const card = document.createElement('div');
  card.className = 'lyco-filepick';
  card.setAttribute('role', 'dialog');
  card.innerHTML = '<strong>Escolha o arquivo</strong><span>ou arraste para cá</span><button type="button" class="btn btn-primary btn-sm">Escolher arquivo</button><button type="button" class="lyco-filepick-x" aria-label="Fechar">×</button>';
  const w = 240;
  card.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
  card.style.top = `${r.bottom + 10 + 120 > window.innerHeight ? Math.max(12, r.top - 130) : r.bottom + 10}px`;
  const close = () => {
    card.remove();
    document.removeEventListener('pointerdown', outside, true);
  };
  const outside = (e: Event) => {
    if (!card.contains(e.target as Node)) close();
  };
  (card.querySelector('.btn') as HTMLButtonElement).onclick = () => {
    input.click();
    close();
  };
  (card.querySelector('.lyco-filepick-x') as HTMLButtonElement).onclick = close;
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.classList.add('is-over');
  });
  card.addEventListener('dragleave', () => card.classList.remove('is-over'));
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files?.length) {
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  });
  document.body.appendChild(card);
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  setTimeout(close, 45000);
}

/** marca rapidinho o botão que o Lyco apertou (um brilho de sonar), sem atrasar o comando */
function flash(el: HTMLElement) {
  el.classList.remove('lyco-hit');
  void el.offsetWidth;
  el.classList.add('lyco-hit');
  window.setTimeout(() => el.classList.remove('lyco-hit'), 650);
}

export function WarpProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const chain = useRef<Promise<void>>(Promise.resolve());

  /** troca de página pelo roteador e espera a tela nova aparecer */
  const push = useCallback(
    async (path: string) => {
      const target = clean(path);
      if (pathRef.current === target) return;
      if (!/^\/(hub|setor\/[a-z-]+)$/.test(target)) {
        window.location.href = path;
        return;
      }
      const sec = target.match(/^\/setor\/([a-z-]+)/);
      if (sec) preloadSector(sec[1]);
      router.push(path);
      const t0 = Date.now();
      while (pathRef.current !== target && Date.now() - t0 < 8000) await wait(40);
      if (pathRef.current !== target) {
        window.location.href = path;
        return;
      }
      // espera os botões da tela nova existirem
      const t1 = Date.now();
      while (!document.querySelector('.nav-item, .tab') && Date.now() - t1 < 5000) await wait(40);
    },
    [router],
  );

  const go = useCallback((path: string) => void push(path), [push]);

  useEffect(() => {
    /** executa os passos do Lyco na hora: troca de página, de aba e aperta os botões */
    const run = (steps: RunStep[], onFirstHit?: () => void) => {
      let hitDone = false;
      const hit = () => {
        if (!hitDone) {
          hitDone = true;
          onFirstHit?.();
        }
      };
      const job = chain.current.then(async () => {
        try {
          let afterPath = false;
          for (const step of steps) {
            if (step.kind === 'path') {
              markLycoNavigation();
              await push(step.path);
              afterPath = true;
              hit();
            } else if (step.kind === 'tab') {
              step.exec();
              hit();
              await wait(0);
            } else {
              // o botão pode estar numa tela que acabou de abrir: espera ele existir (até 4 s; 12 s logo depois de trocar de página)
              const el = await waitFirst(step.sel, step.exec ? 600 : afterPath ? 12000 : 4000);
              if (el && step.skipActive && el.classList.contains('is-active')) continue;
              hit();
              if (el) flash(el);
              if (step.exec) step.exec();
              else if (el?.dataset.lycoFile) showFilePick(el, el.dataset.lycoFile);
              else if (el) {
                const box = el.getBoundingClientRect();
                if (box.top < 0 || box.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
                el.click();
              }
              await wait(60); // a tela reage ao clique (abre a gaveta, começa o download)
            }
          }
        } catch (e) {
          console.error('[lyco] comando', e);
        } finally {
          hit();
        }
      });
      chain.current = job.catch(() => undefined);
      return job;
    };
    setRunner(run);
    return () => setRunner(null);
  }, [push]);

  return <Ctx.Provider value={{ go }}>{children}</Ctx.Provider>;
}
