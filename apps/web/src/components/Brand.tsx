export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <img className="brand-seal" src="/bits-seal.jpg" alt="BITS Kurnool seal" />
    <div className="brand-copy"><strong>BITS Kurnool</strong><span>Brindavan Institute of Technology &amp; Science</span>{!compact && <small>NH-7, Peddatekur · Kurnool</small>}</div>
  </div>;
}
