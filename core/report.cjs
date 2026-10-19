function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function baseStyles() {
  return `
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17191d; font: 11px/1.45 Arial, sans-serif; }
    header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 3px solid #f2c200; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .mark { width: 34px; height: 34px; transform: rotate(30deg); border: 4px solid #f2c200; }
    .brand h1 { margin: 0; font-size: 18px; letter-spacing: .8px; }
    .brand small { color: #6d737b; letter-spacing: 1.4px; }
    .meta { text-align: right; color: #626870; }
    h2 { margin: 22px 0 10px; font-size: 15px; }
    .hero { padding: 18px; margin-top: 18px; background: #101318; color: #fff; border-left: 6px solid #f2c200; }
    .hero h2 { margin: 0 0 5px; font-size: 20px; }
    .hero p { margin: 0; color: #c8ccd1; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
    .kpi { padding: 12px; border: 1px solid #dfe2e5; border-radius: 6px; }
    .kpi span { display: block; color: #6e747c; font-size: 9px; text-transform: uppercase; letter-spacing: .6px; }
    .kpi strong { display: block; margin-top: 4px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 8px; color: #545a61; font-size: 9px; text-transform: uppercase; text-align: left; border-bottom: 2px solid #f2c200; }
    td { padding: 8px; border-bottom: 1px solid #e4e6e8; vertical-align: top; }
    td.num, th.num { text-align: right; }
    .status { color: #6b5600; font-weight: 700; }
    .alert { padding: 9px 11px; margin-bottom: 7px; border-left: 4px solid #f2c200; background: #fff8da; }
    .alert.error { border-color: #c7362f; background: #fff0ef; }
    .alert.info { border-color: #71808e; background: #f1f4f6; }
    .alert strong { display: block; }
    .alert small { display: block; color: #5e646b; margin-top: 2px; }
    footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #dfe2e5; color: #777d84; font-size: 9px; }
  `;
}

function documentShell(title, subtitle, body, generatedAt = new Date().toISOString()) {
  return `<!doctype html>
  <html lang="pt-BR">
    <head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${baseStyles()}</style></head>
    <body>
      <header>
        <div class="brand"><div class="mark"></div><div><h1>RASPUTIM TECNOLOGIS</h1><small>INTELIGÊNCIA OPERACIONAL</small></div></div>
        <div class="meta">${escapeHtml(subtitle)}<br>Gerado em ${escapeHtml(dateTime(generatedAt))}</div>
      </header>
      ${body}
      <footer>Relatório produzido localmente pelo Rasputim Tecnologis v0.1. Os alertas auxiliam a conferência e não alteram o arquivo original.</footer>
    </body>
  </html>`;
}

function projectReportHtml(project) {
  const categories = project.categories || {};
  const environmentRows = (project.environments || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td class="num">${escapeHtml(item.quantity)}</td>
      <td class="num">${money(item.marcenaria)}</td>
      <td class="num">${money(item.serralheria)}</td>
      <td class="num">${money(item.vidracaria)}</td>
      <td class="num">${money(item.iluminacao)}</td>
      <td class="num"><strong>${money(item.totalReported)}</strong></td>
    </tr>`).join("");

  const alerts = (project.alerts || []).length
    ? project.alerts.map((alert) => `<div class="alert ${escapeHtml(alert.severity)}"><strong>${escapeHtml(alert.title)}</strong><small>${escapeHtml(alert.description)}${alert.count > 1 ? ` Ocorrências: ${alert.count}.` : ""}${alert.cells?.length ? ` Células: ${escapeHtml(alert.cells.join(", "))}.` : ""}</small></div>`).join("")
    : '<div class="alert info"><strong>Nenhuma divergência encontrada</strong><small>O total calculado coincide com o total informado.</small></div>';

  const body = `
    <section class="hero"><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.fileName)} · ${escapeHtml(project.status)}</p></section>
    <section class="kpis">
      <div class="kpi"><span>Valor do projeto</span><strong>${money(project.workbookTotal)}</strong></div>
      <div class="kpi"><span>Porte</span><strong>${escapeHtml(project.size)}</strong></div>
      <div class="kpi"><span>Ambientes</span><strong>${escapeHtml(project.environmentCount)}</strong></div>
      <div class="kpi"><span>Diferença interna</span><strong>${money(project.difference)}</strong></div>
    </section>
    <h2>Composição do projeto</h2>
    <section class="kpis">
      <div class="kpi"><span>Marcenaria</span><strong>${money(categories.marcenaria)}</strong></div>
      <div class="kpi"><span>Serralheria</span><strong>${money(categories.serralheria)}</strong></div>
      <div class="kpi"><span>Vidraçaria</span><strong>${money(categories.vidracaria)}</strong></div>
      <div class="kpi"><span>Iluminação</span><strong>${money(categories.iluminacao)}</strong></div>
    </section>
    <h2>Ambientes conferidos</h2>
    <table><thead><tr><th>Ambiente</th><th class="num">Qtd.</th><th class="num">Marcenaria</th><th class="num">Serralheria</th><th class="num">Vidraçaria</th><th class="num">Iluminação</th><th class="num">Total</th></tr></thead><tbody>${environmentRows}</tbody></table>
    <h2>Alertas e observações</h2>${alerts}
    ${project.commercialComparison ? `<h2>Conferência comercial</h2><div class="alert ${project.commercialComparison.matches ? "info" : "error"}"><strong>${escapeHtml(project.commercialComparison.client)}</strong><small>Planilha comercial: ${money(project.commercialComparison.saleTotal)} · Projeto: ${money(project.commercialComparison.projectTotal)} · Diferença: ${money(project.commercialComparison.difference)}</small></div>` : ""}
  `;

  return documentShell(`Relatório — ${project.name}`, "Ficha padronizada de projeto", body, project.importedAt);
}

function summaryReportHtml(state) {
  const dashboard = state.dashboard || {};
  const rows = (state.projects || []).map((project) => `
    <tr><td>${escapeHtml(project.name)}</td><td>${escapeHtml(project.size)}</td><td class="num">${escapeHtml(project.environmentCount)}</td><td class="num">${money(project.workbookTotal)}</td><td class="status">${escapeHtml(project.status)}</td></tr>`).join("");
  const body = `
    <section class="hero"><h2>Painel consolidado da Fase 1</h2><p>Projetos, vendas confirmadas e conferências automáticas.</p></section>
    <section class="kpis">
      <div class="kpi"><span>Projetos analisados</span><strong>${escapeHtml(dashboard.projectCount || 0)}</strong></div>
      <div class="kpi"><span>Projetos somados</span><strong>${money(dashboard.analyzedProjectTotal)}</strong></div>
      <div class="kpi"><span>Vendas registradas</span><strong>${money(dashboard.salesTotal)}</strong></div>
      <div class="kpi"><span>Ticket médio</span><strong>${money(dashboard.averageTicket)}</strong></div>
    </section>
    <h2>Projetos analisados</h2>
    <table><thead><tr><th>Projeto</th><th>Porte</th><th class="num">Ambientes</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Nenhum projeto analisado.</td></tr>'}</tbody></table>
    <h2>Composição das vendas</h2>
    <section class="kpis">
      <div class="kpi"><span>Marcenaria</span><strong>${money(dashboard.categoryTotals?.marcenaria)}</strong></div>
      <div class="kpi"><span>Serralheria</span><strong>${money(dashboard.categoryTotals?.serralheria)}</strong></div>
      <div class="kpi"><span>Vidraçaria</span><strong>${money(dashboard.categoryTotals?.vidracaria)}</strong></div>
      <div class="kpi"><span>Iluminação</span><strong>${money(dashboard.categoryTotals?.iluminacao)}</strong></div>
    </section>`;
  return documentShell("Relatório consolidado", "Relatório executivo", body);
}

module.exports = { escapeHtml, money, projectReportHtml, summaryReportHtml };
