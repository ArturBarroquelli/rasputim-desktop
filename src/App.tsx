import { useMemo, useState } from "react";

type View = "pcp" | "stock" | "tools" | "ai" | "about";

type Project = {
  id: number;
  name: string;
  client: string;
  stage: string;
  priority: "NORMAL" | "ALTA" | "URGENTE";
  progress: number;
};

const projects: Project[] = [
  { id: 1, name: "Apartamento Aurora", client: "Cliente Demo A", stage: "PRODUÇÃO", priority: "ALTA", progress: 62 },
  { id: 2, name: "Escritório Prisma", client: "Cliente Demo B", stage: "MEDIÇÃO", priority: "NORMAL", progress: 28 },
  { id: 3, name: "Cozinha Horizonte", client: "Cliente Demo C", stage: "INSTALAÇÃO", priority: "URGENTE", progress: 86 },
];

const stock = [
  { code: "MAT-001", item: "Painel MDF Branco", current: 18, min: 20, status: "COMPRAR" },
  { code: "MAT-002", item: "Dobradiça Curva", current: 84, min: 40, status: "OK" },
  { code: "MAT-003", item: "Corrediça Oculta", current: 9, min: 12, status: "COMPRAR" },
];

const tools = [
  { tag: "FER-001", name: "Parafusadeira", status: "DISPONÍVEL", location: "Almoxarifado" },
  { tag: "FER-002", name: "Serra Circular", status: "EM USO", location: "Produção" },
  { tag: "FER-003", name: "Nível Laser", status: "MANUTENÇÃO", location: "Assistência" },
];

export default function App() {
  const [view, setView] = useState<View>("pcp");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("Esta é uma simulação visual da IA local do Rasputim.");

  const urgent = useMemo(() => projects.filter(p => p.priority === "URGENTE").length, []);

  function askAi() {
    const text = question.trim();
    if (!text) return;
    setAnswer(`Simulação: analisei "${text}". Na versão privada, a IA consulta o contexto operacional local.`);
    setQuestion("");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">R</div>
          <div><strong>RASPUTIM</strong><small>REACT + TYPESCRIPT</small></div>
        </div>
        <nav>
          {[
            ["pcp","PCP"],
            ["stock","ESTOQUE"],
            ["tools","FERRAMENTAS"],
            ["ai","IA LOCAL"],
            ["about","SOBRE"]
          ].map(([key,label]) => (
            <button key={key} className={view===key ? "active" : ""} onClick={() => setView(key as View)}>{label}</button>
          ))}
        </nav>
      </aside>

      <main>
        <header>
          <div><span className="eyebrow">PORTFÓLIO · DEMO PÚBLICA</span><h1>Rasputim Tecnologis</h1><p>Interface demonstrativa com dados fictícios.</p></div>
          <span className="stack">React · TypeScript · Vite</span>
        </header>

        {view === "pcp" && <section>
          <div className="metrics">
            <Card label="OBRAS" value={projects.length} />
            <Card label="URGENTES" value={urgent} />
            <Card label="EM PRODUÇÃO" value={projects.filter(p=>p.stage==="PRODUÇÃO").length} />
            <Card label="CONCLUÍDAS" value={0} />
          </div>
          <Panel title="Painel de Produção">
            <div className="cards">
              {projects.map(p => <article className="workCard" key={p.id}>
                <div className="row"><small>#{String(p.id).padStart(3,"0")}</small><span>{p.priority}</span></div>
                <h3>{p.name}</h3><p>{p.client}</p><b>{p.stage}</b>
                <div className="progress"><i style={{width:`${p.progress}%`}} /></div>
                <small>{p.progress}% concluído</small>
              </article>)}
            </div>
          </Panel>
        </section>}

        {view === "stock" && <Panel title="Estoque & Compras">
          <table><thead><tr><th>CÓDIGO</th><th>MATERIAL</th><th>SALDO</th><th>MÍNIMO</th><th>STATUS</th></tr></thead>
          <tbody>{stock.map(x => <tr key={x.code}><td>{x.code}</td><td>{x.item}</td><td>{x.current}</td><td>{x.min}</td><td><span className={x.status==="OK"?"ok":"warn"}>{x.status}</span></td></tr>)}</tbody></table>
        </Panel>}

        {view === "tools" && <Panel title="Ferramentas">
          <div className="cards">{tools.map(t => <article className="workCard" key={t.tag}><small>{t.tag}</small><h3>{t.name}</h3><p>{t.location}</p><b>{t.status}</b></article>)}</div>
        </Panel>}

        {view === "ai" && <div className="aiGrid">
          <Panel title="Núcleo de IA"><div className="core"><div/><div/><div/><span/></div><p className="center">Visualização inspirada na IA local do projeto privado.</p></Panel>
          <Panel title="Assistente Operacional"><div className="answer">{answer}</div><textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Digite uma pergunta de demonstração..." /><button className="primary" onClick={askAi}>ENVIAR</button></Panel>
        </div>}

        {view === "about" && <Panel title="Arquitetura do Projeto">
          <div className="about">
            <h2>Projeto real, versão pública sanitizada</h2>
            <p>O Rasputim foi criado para apoiar processos de PCP, estoque, ferramentas e inteligência operacional. Esta versão pública contém apenas interface e dados fictícios.</p>
            <div className="tags">{["React 18","TypeScript","Vite","Electron (projeto privado)","Node.js (projeto privado)","GitHub Actions","IA local"].map(x=><span key={x}>{x}</span>)}</div>
            <div className="arch"><b>React + TypeScript</b><i>→</i><b>IPC Seguro</b><i>→</i><b>Core Node.js</b><i>→</i><b>Dados locais</b></div>
          </div>
        </Panel>}
      </main>
    </div>
  );
}

function Card({label,value}:{label:string;value:number|string}) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function Panel({title,children}:{title:string;children:React.ReactNode}) {
  return <section className="panel"><header className="panelHead"><h2>{title}</h2><span>RASPUTIM</span></header><div className="panelBody">{children}</div></section>;
}
