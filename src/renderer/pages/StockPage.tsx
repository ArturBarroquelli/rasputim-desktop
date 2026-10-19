import { useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { Panel } from "../components/Panel";
import { money, number } from "../utils";
export function StockPage({state,reload}:{state:any;reload:()=>Promise<void>}){
 const procurement=state?.procurement||{stock:[],summary:{}}; const [q,setQ]=useState("");
 const rows=useMemo(()=>(procurement.stock||[]).filter((x:any)=>!q||[x.material,x.code,x.category,x.status].join(" ").toLowerCase().includes(q.toLowerCase())),[procurement.stock,q]);
 const s=procurement.summary||{};
 return <div className="page-stack"><div className="metric-grid"><MetricCard label="MATERIAIS" value={number(s.materialCount)}/><MetricCard label="ADEQUADOS" value={number(s.adequateCount)}/><MetricCard label="COMPRAR" value={number(s.buyCount)}/><MetricCard label="PREVISÃO" value={money(s.forecastCost)}/></div><div className="toolbar"><input placeholder="Buscar material, código ou status..." value={q} onChange={e=>setQ(e.target.value)}/><button className="outline-button" onClick={reload}>ATUALIZAR</button></div><Panel eyebrow="ESTOQUE" title="Materiais e necessidade de compra"><div className="table-wrap"><table><thead><tr><th>MATERIAL</th><th>SALDO</th><th>MÍNIMO</th><th>COMPRAR</th><th>PREÇO</th><th>STATUS</th></tr></thead><tbody>{rows.map((x:any)=><tr key={x.code}><td><strong>{x.material}</strong><small>{x.code} · {x.category}</small></td><td>{number(x.current)} {x.unit}</td><td>{x.minimum==null?"Não definido":`${number(x.minimum)} ${x.unit}`}</td><td>{x.buyNow==null?"—":`${number(x.buyNow)} ${x.unit}`}</td><td>{x.lastPrice?money(x.lastPrice):"Sem histórico"}</td><td><span className={`status-pill ${String(x.status||"").toLowerCase()}`}>{x.status}</span></td></tr>)}</tbody></table></div></Panel></div>
}