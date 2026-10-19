const items = [
  ["pcp", "PCP · PRODUÇÃO", "▦"], ["stock", "ESTOQUE & COMPRAS", "▤"], ["tools", "FERRAMENTAS", "⌁"], ["ai", "IA LOCAL", "✦"], ["about", "SOBRE O PROJETO", "◎"],
] as const;
export function Sidebar({ view, onChange, counts }: { view: string; onChange: (v: string) => void; counts: Record<string, number | string> }) {
  return <aside className="sidebar"><div className="brand"><div className="brand-mark">R</div><div><div className="brand-title">RASPUTIM TECNOLOGIS</div><div className="brand-subtitle">REACT · TYPESCRIPT · ELECTRON</div></div></div><nav className="main-nav">{items.map(([key,label,icon])=><button key={key} className={`nav-item ${view===key?"active":""}`} onClick={()=>onChange(key)}><b>{icon}</b><span>{label}</span>{counts[key] !== undefined && <em>{counts[key]}</em>}</button>)}</nav><div className="sidebar-footer"><span className="pulse-dot"/> SISTEMA LOCAL<div className="version-label">v0.5.0</div></div></aside>;
}