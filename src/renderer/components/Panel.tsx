import type { ReactNode } from "react";
export function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-heading"><div>{eyebrow && <span className="section-index">{eyebrow}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}