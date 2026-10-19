import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "./components/AuthGate";
import { Sidebar } from "./components/Sidebar";
import { Titlebar } from "./components/Titlebar";
import { PcpPage } from "./pages/PcpPage";
import { StockPage } from "./pages/StockPage";
import { ToolsPage } from "./pages/ToolsPage";
import { AiPage } from "./pages/AiPage";
import { AboutPage } from "./pages/AboutPage";

const pageMeta: Record<string,[string,string,string]> = {
  pcp:["PLANEJAMENTO E CONTROLE","Painel de Produção","Acompanhe obras, etapas, prazos e responsáveis."],
  stock:["CONTROLE OPERACIONAL","Estoque & Compras","Saldo, estoque mínimo, necessidade de compra e histórico."],
  tools:["PATRIMÔNIO E AUDITORIA","Ferramentas","Disponibilidade, uso, manutenção e rastreabilidade."],
  ai:["INTELIGÊNCIA LOCAL","Rasputim AI","Assistente local conectado ao contexto operacional."],
  about:["PROJETO DE PORTFÓLIO","Arquitetura & Stack","React, TypeScript, Electron, Node.js e IA local em um sistema real."],
};

export default function App(){
 const [view,setView]=useState("pcp"); const [state,setState]=useState<any>(null); const [auth,setAuth]=useState<any>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const reload=useCallback(async()=>{try{setState(await window.rasputim.getState());setError("");}catch(e:any){setError(e?.message||"Falha ao atualizar estado.");}},[]);
 useEffect(()=>{let dispose=()=>{};(async()=>{try{const s=await window.rasputim.authStatus();setAuth(s);if(s.authenticated)await reload();dispose=window.rasputim.onPcpChanged(next=>{if(next?.auth?.authenticated){setState(next);setAuth(next.auth);}else setAuth(next?.auth||{});});}catch(e:any){setError(e?.message||"Falha ao iniciar.");}finally{setLoading(false);}})();return()=>dispose();},[reload]);
 const onAuthenticated=async(next:any)=>{setState(next);setAuth(next.auth||{authenticated:true});};
 const counts=useMemo(()=>({pcp:state?.pcp?.summary?.active||0,stock:state?.procurement?.summary?.actionCount||0,tools:state?.tools?.summary?.inUse||0,ai:"AI"}),[state]);
 if(loading)return <div className="boot-screen"><div className="boot-core"/><strong>INICIANDO RASPUTIM</strong><small>React + TypeScript</small></div>;
 if(!auth?.authenticated)return <><Titlebar/><AuthGate status={auth||{}} onAuthenticated={onAuthenticated}/></>;
 const meta=pageMeta[view]||pageMeta.pcp;
 return <><Titlebar/><div className="app-shell"><Sidebar view={view} onChange={setView} counts={counts}/><main className="workspace"><header className="workspace-header"><div><div className="eyebrow">{meta[0]}</div><h1>{meta[1]}</h1><p>{meta[2]}</p></div><div className="user-pill"><span className="pulse-dot"/><div><strong>{state?.auth?.currentUser?.name||"Usuário"}</strong><small>{state?.auth?.currentUser?.roleLabel||"Sessão protegida"}</small></div><button onClick={async()=>{const s=await window.rasputim.logout();setAuth(s);setState(null);}}>SAIR</button></div></header>{error&&<div className="error-banner">{error}</div>}<section className="view-area">{view==="pcp"&&<PcpPage state={state} reload={reload}/>} {view==="stock"&&<StockPage state={state} reload={reload}/>} {view==="tools"&&<ToolsPage state={state} reload={reload}/>} {view==="ai"&&<AiPage/>} {view==="about"&&<AboutPage/>}</section></main></div></>;
}