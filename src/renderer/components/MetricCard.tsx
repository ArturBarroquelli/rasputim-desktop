import type { ReactNode } from "react";
export function MetricCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return <article className="metric-card"><div className="metric-icon">{icon ?? "◈"}</div><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}