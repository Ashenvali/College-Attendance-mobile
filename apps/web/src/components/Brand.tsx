export function Brand({ compact = false, short = false }: { compact?: boolean; short?: boolean }) {
  const brandClass = ['brand', compact ? 'brand-compact' : '', short ? 'brand-short-only' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={brandClass}>
      <img className="brand-seal" src="/bits-seal.jpg" alt="Brindavan Institute of Technology & Science official seal" />
      <div className="brand-copy">
        <strong className="brand-full-name">Brindavan Institute of Technology &amp; Science</strong>
        <strong className="brand-short-name">BITS Kurnool</strong>
        {!compact && <small>NH-7, Peddatekur · Kurnool</small>}
      </div>
    </div>
  );
}
