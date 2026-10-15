/** Marca da Lyceg: escudo azul royal (segurança) com a barbatana do Lyco sobre a linha d'água mostarda. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <defs>
          <linearGradient id="lyceg-shield" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4c7dff" />
            <stop offset="1" stopColor="#1b3aa8" />
          </linearGradient>
        </defs>
        <path d="M12 1.4 20.6 4.6v7.1c0 5.1-3.6 9.1-8.6 10.9C7 20.8 3.4 16.8 3.4 11.7V4.6Z" fill="url(#lyceg-shield)" />
        <path d="M12 1.4 20.6 4.6v7.1c0 5.1-3.6 9.1-8.6 10.9C7 20.8 3.4 16.8 3.4 11.7V4.6Z" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth=".7" />
        <path d="M7.6 15.6c1.7-4.6 4.2-7.6 8.6-9.4-1.6 3.3-1.6 6.5.2 9.4Z" fill="#fff" />
        <path d="M6.2 17.4h11.6" stroke="#e3a92f" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Brand({ sub }: { sub?: string }) {
  return (
    <span className="brand">
      <BrandMark />
      <span>
        <span className="brand-name">
          Lyceg<em>Administração</em>
        </span>
        {sub ? <small>{sub}</small> : null}
      </span>
    </span>
  );
}
