const api = window.rasputim;

const viewMeta = {
  dashboard: ["CENTRAL DE CONTROLE", "Painel de Operações", "Leitura, conferência e inteligência comercial em um só lugar."],
  projects: ["BASE OPERACIONAL", "Projetos Analisados", "Consulte resultados, divergências e fichas padronizadas."],
  clients: ["INTELIGÊNCIA COMERCIAL", "Clientes e Vendas", "Acompanhe o faturamento confirmado e a composição dos serviços."],
  pcp: ["PLANEJAMENTO E CONTROLE", "Monitoramento da Produção", "Acompanhe cada obra completa do orçamento à instalação."],
  procurement: ["CONTROLE OPERACIONAL", "Estoque em Tempo Real", "Registre movimentações, acompanhe alertas e compare fornecedores no mesmo sistema."],
  tools: ["CONTROLE OPERACIONAL", "Ferramentas e Autorizações", "Cadastre patrimônios, registre retiradas e acompanhe cada devolução."],
  ai: ["INTELIGÊNCIA LOCAL", "Núcleo de IA do Rasputim", "Assistente operacional executado no próprio computador."],
  reports: ["DOCUMENTOS EXECUTIVOS", "Central de Relatórios", "Exporte análises consolidadas e fichas individuais em PDF."],
  settings: ["CONTROLE DO SISTEMA", "Configurações Locais", "Segurança, formatos e gerenciamento do histórico."],
};

const icons = {
  report: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 12h7M9 16h7"/></svg>',
};

let appState = { projects: [], sales: [], dashboard: {}, auth: { authenticated: false } };
let passwordResetUserId = null;
let appInfo = {};
let tavilyCredentials = { hasKey: false, storageProtected: false };
let currentView = "pcp";
let selectedProjectId = null;
let selectedModalTab = "environments";
let analyzing = false;
let confirmResolver = null;
let procurementTab = "stock";
let currentStockImportPreview = null;
let stockImportBusy = false;
let movementBusy = false;
let materialBusy = false;
let currentMarketSearch = null;
let currentMarketMaterialCode = null;
let selectedPcpProjectId = null;
let pcpBusy = false;
let authPollTimer = null;
let toolBusy = false;
let localAiState = { online: false, baseUrl: "http://127.0.0.1:8080" };
let aiMessages = [];
let aiBusy = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function number(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function percent(value) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function normalizeClass(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function currentUser() {
  return appState.auth?.currentUser || null;
}

function can(permission) {
  return Boolean(currentUser()?.permissions?.includes(permission));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function actionableAlerts(project) {
  return (project.alerts || []).filter((alert) => alert.severity !== "info");
}

function overallAlertCount() {
  const projectAlerts = (appState.projects || []).reduce((sum, project) => sum + actionableAlerts(project).length, 0);
  return projectAlerts + (appState.dashboard?.commercialDifferences || 0);
}

function projectStatus(project) {
  if (project.commercialComparison && !project.commercialComparison.matches) {
    return { text: `Diferença de ${money(Math.abs(project.commercialComparison.difference))}`, className: "warning" };
  }
  if (project.status === "Divergência encontrada") return { text: project.status, className: "error" };
  const alerts = actionableAlerts(project).length;
  if (alerts) return { text: `${alerts} ${alerts === 1 ? "alerta" : "alertas"}`, className: "warning" };
  return { text: "Conferido", className: "" };
}

function showView(view) {
  if (!viewMeta[view]) return;
  currentView = view;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  const [eyebrow, title, subtitle] = viewMeta[view];
  $("#page-eyebrow").textContent = eyebrow;
  $("#page-title").textContent = title;
  $("#page-subtitle").textContent = subtitle;
  $(".workspace").scrollTo({ top: 0, behavior: "smooth" });
}

function emptyTableRow(columns, message) {
  return `<tr class="empty-row"><td colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function projectRow(project, detailed = false) {
  const status = projectStatus(project);
  const file = detailed ? `<td><span>${escapeHtml(project.fileName)}</span><small class="subtext">${escapeHtml(project.fileType || "Excel")}</small></td>` : "";
  const alerts = detailed ? `<td>${number(actionableAlerts(project).length)}</td>` : "";
  return `<tr>
    <td><span class="project-name">${escapeHtml(project.name)}</span><small class="subtext">Importado como ${escapeHtml(project.fileType || "Excel")}</small></td>
    ${file}
    <td>${escapeHtml(project.size)}</td>
    <td>${number(project.environmentCount)}</td>
    <td class="money-cell">${money(project.workbookTotal)}</td>
    ${alerts}
    <td><span class="status-cell ${status.className}">${escapeHtml(status.text)}</span></td>
    <td><button class="row-action" data-open-project="${escapeHtml(project.id)}" aria-label="Abrir projeto">→</button></td>
  </tr>`;
}

function renderDashboard() {
  const dashboard = appState.dashboard || {};
  $("#metric-projects").textContent = number(dashboard.projectCount);
  $("#metric-project-value").textContent = `${money(dashboard.analyzedProjectTotal)} conferidos`;
  $("#metric-sales").textContent = money(dashboard.salesTotal);
  $("#metric-sales-count").textContent = `${number(dashboard.salesCount)} clientes fechados`;
  $("#metric-ticket").textContent = money(dashboard.averageTicket);
  $("#metric-median").textContent = `Mediana ${money(dashboard.medianTicket)}`;
  $("#metric-alerts").textContent = number(overallAlertCount());
  $("#metric-differences").textContent = `${number(dashboard.commercialDifferences)} ${dashboard.commercialDifferences === 1 ? "diferença comercial" : "diferenças comerciais"}`;
  const projectBadge = document.getElementById("nav-project-count");
  const clientBadge = document.getElementById("nav-client-count");
  if (projectBadge) projectBadge.textContent = number(dashboard.projectCount);
  if (clientBadge) clientBadge.textContent = number(dashboard.salesCount);

  const recent = [...(appState.projects || [])].slice(0, 5);
  $("#recent-projects-body").innerHTML = recent.length
    ? recent.map((project) => projectRow(project)).join("")
    : emptyTableRow(6, "Nenhum projeto analisado. Selecione uma planilha para começar.");
}

function renderProjects() {
  const query = $("#project-search").value.trim().toLocaleLowerCase("pt-BR");
  const projects = (appState.projects || []).filter((project) => {
    if (!query) return true;
    return [project.name, project.fileName, project.size, project.status].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query));
  });
  $("#project-list-summary").textContent = `${number(projects.length)} de ${number(appState.projects?.length || 0)} projetos`;
  $("#all-projects-body").innerHTML = projects.length
    ? projects.map((project) => projectRow(project, true)).join("")
    : emptyTableRow(8, query ? "Nenhum projeto corresponde à busca." : "Nenhum projeto analisado.");
}

function renderClients() {
  const dashboard = appState.dashboard || {};
  $("#client-total-sales").textContent = money(dashboard.salesTotal);
  $("#client-total-count").textContent = `${number(dashboard.salesCount)} clientes fechados`;
  $("#client-largest-sale").textContent = money(dashboard.largestSale);
  $("#client-smallest-sale").textContent = money(dashboard.smallestSale);
  $("#client-median-ticket").textContent = money(dashboard.medianTicket);
  $("#sales-file-label").textContent = appState.salesFile || "Base inicial";

  const total = dashboard.salesTotal || 0;
  const labels = {
    marcenaria: "Marcenaria",
    serralheria: "Serralheria",
    vidracaria: "Vidraçaria",
    iluminacao: "Iluminação",
  };
  $("#category-bars").innerHTML = Object.entries(labels).map(([key, label]) => {
    const value = dashboard.categoryTotals?.[key] || 0;
    const ratio = total ? value / total : 0;
    const width = value ? Math.max(ratio * 100, 1.5) : 0;
    return `<div class="category-item"><div><span>${label}</span><strong>${money(value)}</strong></div><div class="bar-track"><i style="width:${width.toFixed(2)}%"></i></div><small>${percent(ratio)} do faturamento</small></div>`;
  }).join("");

  $("#clients-body").innerHTML = (appState.sales || []).length
    ? appState.sales.map((sale) => `<tr><td><span class="project-name">${escapeHtml(sale.client)}</span><small class="subtext">Linha ${number(sale.sourceRow)} da base comercial</small></td><td class="money-cell">${money(sale.marcenaria)}</td><td class="money-cell">${money(sale.serralheria)}</td><td class="money-cell">${money(sale.vidracaria)}</td><td class="money-cell">${money(sale.iluminacao)}</td><td class="money-cell"><strong>${money(sale.total)}</strong></td></tr>`).join("")
    : emptyTableRow(6, "A base de clientes está vazia. Importe a planilha comercial.");
}

function pcpStages() {
  return appState.pcp?.stages || [
    { key: "BUDGET", label: "Orçamento", shortLabel: "Orçamento" },
    { key: "TECHNICAL", label: "Lista de compra + caderno técnico", shortLabel: "Lista + caderno" },
    { key: "MACHINING", label: "Usinagem", shortLabel: "Usinagem" },
    { key: "ASSEMBLY", label: "Montagem", shortLabel: "Montagem" },
    { key: "DISPATCH", label: "Expedição", shortLabel: "Expedição" },
    { key: "DELIVERY", label: "Entrega", shortLabel: "Entrega" },
    { key: "INSTALLATION", label: "Instalação", shortLabel: "Instalação" },
    { key: "COMPLETED", label: "Concluído", shortLabel: "Concluído" },
  ];
}

function pcpStageLabel(key, short = false) {
  const stage = pcpStages().find((item) => item.key === key);
  return short ? stage?.shortLabel || stage?.label || key : stage?.label || key;
}

function pcpDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "SEM PRAZO";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function pcpDueStatus(project) {
  if (project.status === "COMPLETED") return "CONCLUÍDA";
  if (project.daysUntilDue === null || project.daysUntilDue === undefined) return "SEM PRAZO";
  if (project.daysUntilDue < 0) return `${Math.abs(project.daysUntilDue)}d ATRASADA`;
  if (project.daysUntilDue === 0) return "ENTREGA HOJE";
  return `${project.daysUntilDue}d RESTANTES`;
}

function pcpCard(project) {
  const classes = ["pcp-card"];
  if (project.status === "BLOCKED") classes.push("blocked");
  if (project.status === "COMPLETED") classes.push("completed");
  if (project.priority === "URGENTE") classes.push("urgent");
  else if (project.priority === "ALTA") classes.push("high");
  if (project.isLate) classes.push("late");
  const priorityLabel = project.status === "BLOCKED" ? "BLOQUEADA" : project.priority;
  return `<button type="button" class="${classes.join(" ")}" data-open-pcp="${escapeHtml(project.id)}">
    <span class="pcp-card-top"><span class="pcp-card-code">${escapeHtml(project.code)}</span><span class="pcp-priority ${normalizeClass(priorityLabel)}">${escapeHtml(priorityLabel)}</span></span>
    <h3>${escapeHtml(project.name)}</h3>
    <span class="pcp-card-client">${escapeHtml(project.client)}</span>
    <span class="pcp-card-data"><span><small>PRAZO COMPLETO</small>${escapeHtml(pcpDate(project.dueDate))}</span><span><small>RESPONSÁVEL</small>${escapeHtml(project.responsible)}</span></span>
    ${project.status === "BLOCKED" ? `<span class="pcp-block-reason">${escapeHtml(project.blockedReason)}</span>` : ""}
    <span class="pcp-card-footer"><span class="${project.isLate ? "late-label" : ""}">${escapeHtml(pcpDueStatus(project))}</span><span class="pcp-card-progress"><i style="width:${Math.max(0, Math.min(100, Number(project.progress) || 0))}%"></i></span><b>${number(project.progress)}%</b></span>
  </button>`;
}

function renderPcpConnection() {
  const connection = appState.pcpConnection || { mode: "LOCAL", connected: true };
  const strip = $("#pcp-connection-strip");
  const shared = connection.mode === "SHARED";
  strip.className = `pcp-connection-strip ${shared ? (connection.connected ? "shared" : "offline") : "local"}`;
  $("#pcp-connection-status").textContent = shared
    ? connection.connected ? "PCP COMPARTILHADO · CONECTADO" : "PCP COMPARTILHADO · SEM CONEXÃO"
    : "PCP LOCAL";
  $("#pcp-connection-detail").textContent = shared
    ? `${connection.stationName || "ESTAÇÃO"} · ${connection.message || "Pasta compartilhada"}`
    : `${connection.stationName || "ESTAÇÃO"} · salvo somente neste computador`;
  $("#pcp-connection-sync").textContent = connection.lastSyncAt
    ? `Sincronizado ${dateTime(connection.lastSyncAt)}`
    : "Aguardando primeira atualização";
}

function renderPcp() {
  const pcp = appState.pcp || { projects: [], summary: {} };
  const summary = pcp.summary || {};
  $("#nav-pcp-count").textContent = number(summary.active);
  $("#pcp-active-count").textContent = number(summary.active);
  $("#pcp-critical-count").textContent = number(summary.critical);
  $("#pcp-late-count").textContent = `${number(summary.late)} atrasadas`;
  $("#pcp-blocked-count").textContent = number(summary.blocked);
  $("#pcp-delivery-count").textContent = number(summary.deliveriesThisMonth);
  $("#pcp-completed-count").textContent = number(summary.completed);
  renderPcpConnection();

  const stageFilter = $("#pcp-stage-filter");
  const preservedStage = stageFilter.value || "ALL";
  stageFilter.innerHTML = `<option value="ALL">TODAS AS ETAPAS</option>${pcpStages().map((stage) => `<option value="${escapeHtml(stage.key)}">${escapeHtml(stage.label.toUpperCase())}</option>`).join("")}`;
  stageFilter.value = pcpStages().some((stage) => stage.key === preservedStage) ? preservedStage : "ALL";

  const query = $("#pcp-search").value.trim().toLocaleLowerCase("pt-BR");
  const priority = $("#pcp-priority-filter").value;
  const projects = (pcp.projects || []).filter((project) => {
    if (project.status === "ARCHIVED") return false;
    if (stageFilter.value !== "ALL" && project.currentStage !== stageFilter.value) return false;
    if (priority === "BLOCKED" && project.status !== "BLOCKED") return false;
    if (!["ALL", "BLOCKED"].includes(priority) && project.priority !== priority) return false;
    if (!query) return true;
    return [project.code, project.client, project.name, project.responsible, project.blockedReason]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query));
  });
  $("#pcp-board-summary").textContent = `${number(projects.length)} de ${number((pcp.projects || []).filter((project) => project.status !== "ARCHIVED").length)} obras visíveis`;
  $("#pcp-board").innerHTML = pcpStages().map((stage, index) => {
    const stageProjects = projects.filter((project) => project.currentStage === stage.key);
    return `<section class="pcp-column${stageProjects.length ? " current-target" : ""}" data-pcp-column="${escapeHtml(stage.key)}">
      <div class="pcp-column-heading"><div><span>ETAPA ${String(index + 1).padStart(2, "0")}</span><strong title="${escapeHtml(stage.label)}">${escapeHtml(stage.shortLabel || stage.label)}</strong></div><b>${number(stageProjects.length)}</b></div>
      <div class="pcp-column-cards">${stageProjects.length ? stageProjects.map(pcpCard).join("") : '<div class="pcp-column-empty">NENHUMA OBRA NESTA ETAPA</div>'}</div>
    </section>`;
  }).join("");
}

function renderPcpSourceOptions(selectedValue = "") {
  const select = $("#pcp-project-source");
  select.innerHTML = `<option value="">SEM VÍNCULO</option>${(appState.projects || []).map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("")}`;
  if ((appState.projects || []).some((project) => project.id === selectedValue)) select.value = selectedValue;
}

function openPcpProjectModal(project = null) {
  $("#pcp-project-form").reset();
  $("#pcp-project-id").value = project?.id || "";
  $("#pcp-project-client").value = project?.client || "";
  $("#pcp-project-name").value = project?.name || "";
  $("#pcp-project-due-date").value = project?.dueDate || "";
  $("#pcp-project-responsible").value = project?.responsible || "";
  $("#pcp-project-priority").value = project?.priority || "NORMAL";
  $("#pcp-project-notes").value = project?.notes || "";
  renderPcpSourceOptions(project?.sourceProjectId || "");
  $("#pcp-project-title").textContent = project ? `Editar ${project.code}` : "Cadastrar nova obra";
  $("#pcp-project-subtitle").textContent = project
    ? "Dados gerais podem ser atualizados sem alterar a etapa atual."
    : "A obra entra em Orçamento e será controlada como uma entrega única.";
  $("#pcp-project-save").textContent = project ? "SALVAR ALTERAÇÕES" : "CADASTRAR OBRA";
  $("#pcp-project-modal").classList.add("open");
  $("#pcp-project-modal").setAttribute("aria-hidden", "false");
  $("#pcp-project-client").focus();
}

function closePcpProjectModal() {
  $("#pcp-project-modal").classList.remove("open");
  $("#pcp-project-modal").setAttribute("aria-hidden", "true");
}

async function submitPcpProject(event) {
  event.preventDefault();
  if (pcpBusy) return;
  const id = $("#pcp-project-id").value;
  const payload = {
    client: $("#pcp-project-client").value,
    name: $("#pcp-project-name").value,
    dueDate: $("#pcp-project-due-date").value,
    responsible: $("#pcp-project-responsible").value,
    priority: $("#pcp-project-priority").value,
    sourceProjectId: $("#pcp-project-source").value,
    notes: $("#pcp-project-notes").value,
    user: $("#pcp-project-responsible").value,
  };
  pcpBusy = true;
  $("#pcp-project-save").disabled = true;
  try {
    appState = id ? await api.updatePcpProject(id, payload) : await api.createPcpProject(payload);
    closePcpProjectModal();
    renderAll();
    toast(id ? "Obra atualizada" : "Obra cadastrada", id ? "Os dados foram atualizados e registrados no histórico." : "A obra entrou na etapa Orçamento do PCP.", "success");
    if (id) openPcpDetail(id);
  } catch (error) {
    toast("Não foi possível salvar a obra", error.message, "error", 7500);
  } finally {
    pcpBusy = false;
    $("#pcp-project-save").disabled = false;
  }
}

function pcpProjectById(id = selectedPcpProjectId) {
  return (appState.pcp?.projects || []).find((project) => project.id === id);
}

const pcpHistoryLabels = {
  CREATED: "Obra cadastrada",
  UPDATED: "Cadastro atualizado",
  ADVANCED: "Avançou de etapa",
  RETURNED: "Retornou uma etapa",
  BLOCKED: "Obra bloqueada",
  UNBLOCKED: "Obra desbloqueada",
  ARCHIVED: "Obra arquivada",
};

function renderPcpDetail() {
  const project = pcpProjectById();
  if (!project) {
    closePcpDetail();
    return;
  }
  $("#pcp-detail-code").textContent = project.code;
  $("#pcp-detail-title").textContent = project.name;
  $("#pcp-detail-client").textContent = project.client;
  const statusLabels = { ACTIVE: "EM ANDAMENTO", BLOCKED: "BLOQUEADA", COMPLETED: "CONCLUÍDA", ARCHIVED: "ARQUIVADA" };
  const status = $("#pcp-detail-status");
  status.textContent = statusLabels[project.status] || project.status;
  status.className = `status-badge ${project.status === "COMPLETED" ? "ready" : project.status === "BLOCKED" ? "error" : ""}`;
  const linked = (appState.projects || []).find((item) => item.id === project.sourceProjectId);
  $("#pcp-detail-kpis").innerHTML = [
    ["ETAPA ATUAL", pcpStageLabel(project.currentStage, true)],
    ["PRAZO COMPLETO", pcpDate(project.dueDate)],
    ["RESPONSÁVEL", project.responsible],
    ["PRIORIDADE", project.priority],
    ["PROJETO VINCULADO", linked?.name || "Sem vínculo"],
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong></div>`).join("");

  const blocked = $("#pcp-detail-blocked");
  blocked.hidden = project.status !== "BLOCKED";
  blocked.innerHTML = project.status === "BLOCKED" ? `<strong>OBRA BLOQUEADA:</strong> ${escapeHtml(project.blockedReason)}` : "";
  const currentIndex = pcpStages().findIndex((stage) => stage.key === project.currentStage);
  $("#pcp-timeline").innerHTML = pcpStages().map((stage, index) => {
    const record = project.stageRecords?.find((item) => item.stage === stage.key) || {};
    const complete = record.status === "COMPLETED";
    const current = index === currentIndex && project.status !== "COMPLETED";
    return `<div class="pcp-timeline-step${complete ? " complete" : ""}${current ? " current" : ""}"><i>${complete ? "✓" : index + 1}</i><strong>${escapeHtml(stage.shortLabel || stage.label)}</strong><small>${complete ? `Concluída ${dateTime(record.completedAt)}` : current ? "EM ANDAMENTO" : "PENDENTE"}</small></div>`;
  }).join("");
  $("#pcp-history").innerHTML = (project.history || []).length
    ? project.history.map((entry) => `<article class="pcp-history-item"><div><strong>${escapeHtml(pcpHistoryLabels[entry.type] || entry.type)}</strong><time>${escapeHtml(dateTime(entry.createdAt))}</time></div><p>${escapeHtml(entry.note || "Sem observação.")}</p><small>${escapeHtml(entry.user || "Responsável não informado")}${entry.fromStage && entry.toStage && entry.fromStage !== entry.toStage ? ` · ${escapeHtml(pcpStageLabel(entry.fromStage, true))} → ${escapeHtml(pcpStageLabel(entry.toStage, true))}` : ""}</small></article>`).join("")
    : '<div class="pcp-column-empty">NENHUM EVENTO REGISTRADO</div>';

  $("#pcp-action-user").value = currentUser()?.name || project.responsible;
  const blockedStatus = project.status === "BLOCKED";
  $("#pcp-previous-stage").disabled = blockedStatus || currentIndex <= 0;
  $("#pcp-next-stage").disabled = blockedStatus || currentIndex >= pcpStages().length - 1;
  $("#pcp-next-stage").textContent = currentIndex === pcpStages().length - 2 ? "CONCLUIR OBRA →" : "PRÓXIMA ETAPA →";
  $("#pcp-toggle-block").disabled = project.status === "COMPLETED";
  $("#pcp-toggle-block").textContent = blockedStatus ? "DESBLOQUEAR OBRA" : "BLOQUEAR OBRA";
}

function openPcpDetail(id) {
  selectedPcpProjectId = id;
  $("#pcp-action-user").value = "";
  $("#pcp-action-note").value = "";
  renderPcpDetail();
  $("#pcp-detail-modal").classList.add("open");
  $("#pcp-detail-modal").setAttribute("aria-hidden", "false");
}

function closePcpDetail() {
  $("#pcp-detail-modal").classList.remove("open");
  $("#pcp-detail-modal").setAttribute("aria-hidden", "true");
  selectedPcpProjectId = null;
}

function pcpActionInput() {
  const user = currentUser()?.name || $("#pcp-action-user").value.trim();
  if (user.length < 2) throw new Error("Entre com sua conta para atualizar o PCP.");
  return { user, note: $("#pcp-action-note").value.trim() };
}

async function movePcpProject(direction) {
  if (pcpBusy || !selectedPcpProjectId) return;
  let payload;
  try { payload = { ...pcpActionInput(), direction }; } catch (error) {
    toast("Responsável obrigatório", error.message, "warning");
    return;
  }
  const project = pcpProjectById();
  if (!project) return;
  if (direction === "PREVIOUS") {
    const accepted = await askConfirmation("Voltar a obra uma etapa?", `${project.code} retornará de ${pcpStageLabel(project.currentStage)} para a etapa anterior. Esta ação ficará registrada no histórico.`, "VOLTAR ETAPA");
    if (!accepted) return;
  }
  pcpBusy = true;
  try {
    appState = await api.transitionPcpProject(project.id, payload);
    renderAll();
    renderPcpDetail();
    $("#pcp-action-note").value = "";
    toast(direction === "NEXT" ? "Obra avançada" : "Obra devolvida", `${project.code} agora está em ${pcpStageLabel(pcpProjectById(project.id)?.currentStage)}.`, "success");
  } catch (error) {
    toast("Não foi possível movimentar", error.message, "error", 7000);
  } finally {
    pcpBusy = false;
  }
}

async function togglePcpBlock() {
  if (pcpBusy || !selectedPcpProjectId) return;
  const project = pcpProjectById();
  let input;
  try { input = pcpActionInput(); } catch (error) {
    toast("Responsável obrigatório", error.message, "warning");
    return;
  }
  const blocking = project.status !== "BLOCKED";
  if (blocking && input.note.length < 3) {
    $("#pcp-action-note").focus();
    toast("Motivo obrigatório", "Explique o que está impedindo a obra de avançar.", "warning");
    return;
  }
  if (!blocking) {
    const accepted = await askConfirmation("Desbloquear esta obra?", "A obra voltará a ficar disponível para avançar no fluxo do PCP.", "DESBLOQUEAR");
    if (!accepted) return;
  }
  pcpBusy = true;
  try {
    appState = await api.blockPcpProject(project.id, { blocked: blocking, reason: input.note, user: input.user, note: input.note });
    renderAll();
    renderPcpDetail();
    $("#pcp-action-note").value = "";
    toast(blocking ? "Obra bloqueada" : "Obra desbloqueada", blocking ? "O motivo ficou destacado no painel e registrado no histórico." : "A obra pode voltar a avançar.", blocking ? "warning" : "success");
  } catch (error) {
    toast("Não foi possível alterar o bloqueio", error.message, "error", 7000);
  } finally {
    pcpBusy = false;
  }
}

async function archivePcpSelectedProject() {
  const project = pcpProjectById();
  if (!project || pcpBusy) return;
  let input;
  try { input = pcpActionInput(); } catch (error) {
    toast("Responsável obrigatório", error.message, "warning");
    return;
  }
  const accepted = await askConfirmation("Arquivar esta obra?", `${project.code} sairá do quadro ativo, mas todo o histórico será preservado na base do PCP.`, "ARQUIVAR OBRA");
  if (!accepted) return;
  pcpBusy = true;
  try {
    appState = await api.archivePcpProject(project.id, input);
    closePcpDetail();
    renderAll();
    toast("Obra arquivada", "O registro foi retirado do quadro sem apagar o histórico.", "success");
  } catch (error) {
    toast("Não foi possível arquivar", error.message, "error", 7000);
  } finally {
    pcpBusy = false;
  }
}

function renderPcpNetworkModal() {
  const connection = appState.pcpConnection || { mode: "LOCAL", connected: true, revision: 0 };
  $("#pcp-station-name").value = connection.stationName || "";
  const stateElement = $("#pcp-network-state");
  const shared = connection.mode === "SHARED";
  stateElement.className = `pcp-network-state ${shared ? connection.connected ? "connected" : "offline" : ""}`;
  stateElement.innerHTML = `<strong>${shared ? connection.connected ? "COMPARTILHADO E CONECTADO" : "COMPARTILHADO SEM CONEXÃO" : "MODO LOCAL"}</strong><span>${escapeHtml(connection.message || "O PCP está salvo somente neste computador.")}</span>`;
  $("#pcp-network-path").textContent = shared ? connection.sharedDirectory || "Pasta não informada" : "Somente armazenamento local";
  $("#pcp-network-path").title = connection.sharedDirectory || "";
  $("#pcp-network-sync").textContent = connection.lastSyncAt ? dateTime(connection.lastSyncAt) : "—";
  $("#pcp-network-revision").textContent = number(connection.revision);
  $("#pcp-use-local").disabled = !shared;
}

function openPcpNetworkModal() {
  renderPcpNetworkModal();
  $("#pcp-network-modal").classList.add("open");
  $("#pcp-network-modal").setAttribute("aria-hidden", "false");
}

function closePcpNetworkModal() {
  $("#pcp-network-modal").classList.remove("open");
  $("#pcp-network-modal").setAttribute("aria-hidden", "true");
}

function pcpStationName() {
  const name = $("#pcp-station-name").value.trim();
  if (name.length < 2) throw new Error("Informe um nome para identificar este computador.");
  return name;
}

async function selectPcpSharedDirectory() {
  if (pcpBusy) return;
  let station;
  try { station = pcpStationName(); } catch (error) {
    toast("Nome da estação obrigatório", error.message, "warning");
    return;
  }
  pcpBusy = true;
  try {
    const result = await api.choosePcpSharedDirectory(station);
    if (result.canceled) return;
    appState = result.state;
    renderAll();
    renderPcpNetworkModal();
    toast("PCP compartilhado ativado", "Repita a configuração nos outros três computadores usando a mesma pasta.", "success", 7000);
  } catch (error) {
    toast("Não foi possível ativar a pasta", error.message, "error", 8000);
  } finally {
    pcpBusy = false;
  }
}

async function useLocalPcp() {
  if (pcpBusy) return;
  let station;
  try { station = pcpStationName(); } catch (error) {
    toast("Nome da estação obrigatório", error.message, "warning");
    return;
  }
  const accepted = await askConfirmation("Desconectar o PCP da rede?", "Uma cópia atual será salva neste computador. Alterações futuras não aparecerão nas outras estações.", "USAR MODO LOCAL");
  if (!accepted) return;
  pcpBusy = true;
  try {
    appState = await api.useLocalPcp(station);
    renderAll();
    renderPcpNetworkModal();
    toast("PCP em modo local", "Esta estação deixou de sincronizar com os outros computadores.", "warning");
  } catch (error) {
    toast("Não foi possível mudar o modo", error.message, "error", 7000);
  } finally {
    pcpBusy = false;
  }
}

async function savePcpStation() {
  let station;
  try { station = pcpStationName(); } catch (error) {
    toast("Nome da estação obrigatório", error.message, "warning");
    return;
  }
  try {
    appState = await api.updatePcpStation(station);
    renderAll();
    renderPcpNetworkModal();
    toast("Nome da estação salvo", `Este computador será identificado como ${station}.`, "success");
  } catch (error) {
    toast("Não foi possível salvar", error.message, "error");
  }
}

async function refreshPcp() {
  if (pcpBusy) return;
  pcpBusy = true;
  $("#pcp-refresh").disabled = true;
  try {
    appState = await api.refreshPcp();
    renderAll();
    if ($("#pcp-detail-modal").classList.contains("open")) renderPcpDetail();
    toast("PCP atualizado", "A versão mais recente da base foi carregada.", "success", 2600);
  } catch (error) {
    toast("Não foi possível atualizar", error.message, "error", 7000);
  } finally {
    pcpBusy = false;
    $("#pcp-refresh").disabled = false;
  }
}

function renderReports() {
  const dashboard = appState.dashboard || {};
  const items = [
    ["PROJETOS ANALISADOS", number(dashboard.projectCount)],
    ["TOTAL DOS PROJETOS", money(dashboard.analyzedProjectTotal)],
    ["VENDAS REGISTRADAS", money(dashboard.salesTotal)],
    ["TICKET MÉDIO", money(dashboard.averageTicket)],
    ["ALERTAS ACIONÁVEIS", number(overallAlertCount())],
    ["DIFERENÇAS COMERCIAIS", number(dashboard.commercialDifferences)],
  ];
  $("#report-kpis").innerHTML = items.map(([label, value]) => `<div class="report-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  $("#report-project-list").innerHTML = (appState.projects || []).length
    ? appState.projects.map((project) => `<div class="report-project"><div class="report-project-icon">${icons.report}</div><div class="report-project-info"><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.size)} · ${number(project.environmentCount)} ambientes · ${money(project.workbookTotal)}</span></div><button class="outline-button" data-open-project="${escapeHtml(project.id)}">ABRIR FICHA</button><button class="outline-button" data-export-project="${escapeHtml(project.id)}">PDF</button></div>`).join("")
    : '<div class="empty-row">Nenhum projeto disponível para relatório.</div>';
}

function procurementStatus(status) {
  if (status === "COMPRA URGENTE") return "error";
  if (["COMPRAR MATERIAL", "VERIFICAR NO ESTOQUE", "CONFERIR DETALHAMENTO", "DEFINIR MÍNIMO"].includes(status)) return "warning";
  return "";
}

function dateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function stockQuantity(value, unit, detail = "") {
  const detailLine = detail ? `<small class="subtext">${escapeHtml(detail)}</small>` : "";
  return value === null || value === undefined
    ? `<span class="unknown-balance">NÃO CONVERTIDO</span>${detailLine}`
    : `<strong>${number(value)}</strong><small class="subtext">${escapeHtml(unit)}</small>${detailLine}`;
}

function showProcurementTab(tab) {
  if (!["stock", "counts", "movements", "purchases", "suppliers"].includes(tab)) return;
  procurementTab = tab;
  $$("[data-procurement-tab]").forEach((button) => button.classList.toggle("active", button.dataset.procurementTab === tab));
  $$("[data-procurement-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.procurementPanel === tab));
}

function stockImportAction(action) {
  const labels = {
    UPDATE: "ATUALIZAR",
    NEW: "NOVO MATERIAL",
    VERIFY: "VERIFICAR",
    UNCHANGED: "SEM ALTERAÇÃO",
    REMOVE: "REMOVER",
  };
  return `<span class="stock-import-action ${normalizeClass(action)}">${labels[action] || escapeHtml(action)}</span>`;
}

function renderStockImport(procurement) {
  const history = procurement.stockCounts || [];
  const responsible = currentUser()?.name || "";
  if ($("#stock-count-responsible")) $("#stock-count-responsible").value = responsible;
  $("#stock-count-history-count").textContent = `${number(history.length)} ${history.length === 1 ? "registro" : "registros"}`;
  $("#stock-count-last").textContent = history[0]
    ? `Último: ${dateTime(history[0].importedAt)} · ${history[0].registeredBy}`
    : "Nenhum levantamento aplicado";
  $("#stock-count-history-body").innerHTML = history.length
    ? history.slice(0, 100).map((count) => {
        const totals = count.totals || {};
        return `<tr>
          <td><strong>${escapeHtml(dateTime(count.importedAt))}</strong></td>
          <td><span class="stock-import-action ${count.mode === "REPLACE" ? "verify" : "update"}">${count.mode === "REPLACE" ? "SUBSTITUIÇÃO TOTAL" : "ATUALIZAÇÃO PARCIAL"}</span></td>
          <td><span class="project-name">${escapeHtml(count.fileName)}</span><small class="subtext">Aba ${escapeHtml(count.sheetName || "—")} · cabeçalho linha ${number(count.headerRow)}</small></td>
          <td>${escapeHtml(count.registeredBy || "—")}</td>
          <td><strong>${number(totals.changedItems)}</strong></td>
          <td><strong>${number(totals.newItems)}</strong></td>
          <td><strong>${number(totals.pendingItems)}</strong></td>
          <td><strong>${number(totals.preservedItems)}</strong></td>
          <td><strong>${number(totals.removedItems)}</strong></td>
        </tr>`;
      }).join("")
    : emptyTableRow(9, "Nenhum levantamento de estoque foi aplicado.");

  const container = $("#stock-import-preview");
  if (!currentStockImportPreview) {
    container.hidden = true;
    $("#stock-preview-body").innerHTML = emptyTableRow(6, "Selecione uma planilha para gerar a prévia.");
    return;
  }

  const preview = currentStockImportPreview;
  const totals = preview.totals || {};
  container.hidden = false;
  $("#stock-preview-file").textContent = preview.fileName || "PLANILHA SELECIONADA";
  $("#stock-preview-sheet").textContent = `Aba ${preview.sheetName || "—"} · cabeçalho linha ${number(preview.headerRow)}`;
  $("#stock-preview-valid").textContent = number(totals.validItems);
  $("#stock-preview-changed").textContent = number(totals.changedItems);
  $("#stock-preview-new").textContent = number(totals.newItems);
  $("#stock-preview-pending").textContent = number(totals.pendingItems);
  $("#stock-preview-preserved").textContent = number(totals.preservedItems);
  $("#stock-preview-removed").textContent = number(totals.removedItems);

  const warning = $("#stock-preview-warning");
  const warnings = preview.warnings || [];
  warning.hidden = warnings.length === 0;
  warning.className = `stock-preview-warning${preview.duplicate ? " error" : ""}`;
  warning.textContent = warnings.join(" • ");
  $("#stock-count-responsible").value = responsible;
  $("#apply-stock-count").disabled = stockImportBusy || Boolean(preview.duplicate);
  $("#apply-stock-count").textContent = preview.mode === "REPLACE" ? "SUBSTITUIR ESTOQUE" : "APLICAR ATUALIZAÇÃO";
  if ($("#stock-import-mode")) $("#stock-import-mode").value = preview.mode || "MERGE";
  $("#cancel-stock-count").disabled = stockImportBusy;

  $("#stock-preview-body").innerHTML = (preview.rows || []).length
    ? preview.rows.slice(0, 500).map((row) => {
        const difference = row.difference;
        const differenceClass = difference > 0 ? "positive" : difference < 0 ? "negative" : "";
        const differenceLabel = difference === null ? "—" : `${difference > 0 ? "+" : ""}${number(difference)}`;
        const sourceRows = Array.isArray(row.sourceLocations) && row.sourceLocations.length
          ? row.sourceLocations.join(", ")
          : Array.isArray(row.sourceRows) && row.sourceRows.length
            ? row.sourceRows.join(", ")
            : row.sourceRow;
        return `<tr>
          <td><span class="project-name">${escapeHtml(row.material)}</span><small class="subtext">${escapeHtml(row.materialCode)} · ${escapeHtml(row.sourcePresentation || row.unit)}</small></td>
          <td>${stockQuantity(row.before, row.unit)}</td>
          <td>${stockQuantity(row.after, row.unit, row.quantityDetail)}</td>
          <td><strong class="stock-preview-difference ${differenceClass}">${escapeHtml(differenceLabel)}</strong></td>
          <td>${stockImportAction(row.action)}</td>
          <td>${escapeHtml(sourceRows)}</td>
        </tr>`;
      }).join("")
    : emptyTableRow(6, "Nenhum material foi identificado na planilha.");
}

function populateProcurementForms(procurement) {
  const currentMovement = $("#movement-material")?.value;
  const currentQuotation = $("#quotation-material")?.value;
  const materialOptions = (procurement.stock || []).map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.material)} — ${item.current === null ? "VERIFICAR" : `${number(item.current)} ${escapeHtml(item.unit)}`}</option>`).join("");
  $("#movement-material").innerHTML = materialOptions;
  if (currentMovement && procurement.stock.some((item) => item.code === currentMovement)) $("#movement-material").value = currentMovement;

  const buyItems = (procurement.stock || []).filter((item) => Number(item.buyNow) > 0);
  $("#quotation-material").innerHTML = buyItems.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.material)} — comprar ${number(item.buyNow)} ${escapeHtml(item.unit)}</option>`).join("");
  if (currentQuotation && buyItems.some((item) => item.code === currentQuotation)) $("#quotation-material").value = currentQuotation;

  const currentSupplier = $("#quotation-supplier")?.value;
  $("#quotation-supplier").innerHTML = `${(procurement.suppliers || []).map((supplier) => `<option value="${escapeHtml(supplier.id)}">${escapeHtml(supplier.name)} — ${escapeHtml(supplier.reliability)}</option>`).join("")}<option value="CUSTOM">OUTRO FORNECEDOR / RESULTADO DA WEB</option>`;
  if (currentSupplier && procurement.suppliers.some((item) => item.id === currentSupplier)) $("#quotation-supplier").value = currentSupplier;
}

function renderProcurement() {
  const procurement = appState.procurement || { stock: [], invoices: [], summary: {} };
  const summary = procurement.summary || {};
  const canOpenMovement = can("STOCK_ENTRY") || can("STOCK_COUNT") || can("STOCK_REQUEST_EXIT");
  $("#open-movement").disabled = !canOpenMovement;
  $("#open-material").disabled = !can("STOCK_MANAGE_MATERIALS");
  $("#import-stock").disabled = !can("STOCK_IMPORT");
  $("#select-stock-count").disabled = !can("STOCK_IMPORT");
  $("#nav-buy-count").textContent = number(summary.actionCount);
  $("#stock-material-count").textContent = number(summary.materialCount);
  $("#stock-adequate-count").textContent = number(summary.adequateCount);
  $("#buy-material-count").textContent = `${number(summary.buyCount)} itens`;
  $("#buy-critical-count").textContent = `${number(summary.urgentCount)} urgentes`;
  $("#stock-verify-count").textContent = number(summary.verifyCount);
  $("#buy-budget").textContent = money(summary.forecastCost);
  $("#buy-unpriced-count").textContent = `${number(summary.unpricedBuyCount)} itens sem cotação`;
  $("#buy-saving").textContent = `Economia possível: ${money(summary.potentialSaving)}`;
  $("#quotation-count").textContent = `${number(summary.quotationCount)} cotações`;
  $("#pending-invoice-count").textContent = `${number(summary.pendingInvoices)} aguardando conferência`;
  $("#movement-count").textContent = `${number(summary.movementCount)} registros`;
  $("#stock-last-update").textContent = summary.lastMovementAt
    ? `Última movimentação: ${dateTime(summary.lastMovementAt)}`
    : "Nenhuma movimentação registrada";
  renderStockImport(procurement);

  const query = $("#stock-search")?.value.trim().toLocaleLowerCase("pt-BR") || "";
  const stock = (procurement.stock || []).filter((item) => !query || [item.material, item.category, item.status].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query)));
  $("#stock-body").innerHTML = stock.length ? stock.map((item) => {
    const quotation = item.recommendedQuotation;
    const sourceDetail = item.unitsPerPackage > 1 && item.sourceBalance !== null
      ? `${number(item.sourceBalance)} ${item.sourcePresentation} convertidas em unidades`
      : `${item.code} · ${item.category}`;
    return `<tr>
      <td><span class="project-name">${escapeHtml(item.material)}</span><small class="subtext">${escapeHtml(sourceDetail)}</small></td>
      <td>${stockQuantity(item.current, item.unit, item.quantityDetail)}</td>
      <td>${item.minimum === null || item.minimum === undefined ? '<span class="unknown-balance">NÃO DEFINIDO</span>' : `<strong>${number(item.minimum)}</strong><small class="subtext">${escapeHtml(item.unit)}</small>${item.minimumDetail ? `<small class="subtext">${escapeHtml(item.minimumDetail)}</small>` : ""}`}</td>
      <td>${item.buyNow === null ? "—" : `<strong>${number(item.buyNow)}</strong><small class="subtext">${escapeHtml(item.unit)}</small>`}</td>
      <td class="money-cell">${item.lastPrice ? `<strong>${money(item.lastPrice)}</strong><small class="subtext">${number(item.historyCount)} preços no histórico</small>` : "Sem histórico"}</td>
      <td>${quotation ? `<strong>${escapeHtml(quotation.supplierName)}</strong><small class="subtext">${money(quotation.landedUnitCost)} por ${escapeHtml(item.unit)}${quotation.freightKnown ? "" : " + frete a confirmar"}</small>` : '<span class="pending-label">COTAÇÃO PENDENTE</span>'}</td>
      <td><span class="status-cell ${procurementStatus(item.status)}">${escapeHtml(item.status)}</span></td>
      <td><div class="table-actions"><button class="row-action" data-movement-code="${escapeHtml(item.code)}" title="Registrar movimentação">±</button>${Number(item.buyNow) > 0 ? `<button class="row-action" data-add-quote="${escapeHtml(item.code)}" title="Adicionar cotação">R$</button>` : ""}</div></td>
    </tr>`;
  }).join("") : emptyTableRow(8, "Nenhum material corresponde à busca.");

  $("#movement-body").innerHTML = (procurement.movements || []).length
    ? procurement.movements.slice(0, 300).map((movement) => `<tr>
      <td><strong>${escapeHtml(dateTime(movement.createdAt))}</strong></td>
      <td><span class="project-name">${escapeHtml(movement.material)}</span><small class="subtext">${escapeHtml(movement.materialCode)}</small></td>
      <td><span class="movement-type ${normalizeClass(movement.type)}">${escapeHtml(movement.type)}</span></td>
      <td>${movement.quantity === null || movement.quantity === undefined ? "—" : `<strong>${number(movement.quantity)}</strong> ${escapeHtml(movement.unit || "")}`}</td>
      <td>${movement.before === null || movement.before === undefined ? "Não contado" : number(movement.before)} → ${movement.after === null || movement.after === undefined ? '<span class="unknown-balance">NÃO CONTADO</span>' : `<strong>${number(movement.after)}</strong>`}</td>
      <td><strong>${escapeHtml(movement.registeredBy || movement.requestedBy || "—")}</strong>${movement.authorizedBy ? `<small class="subtext">Saída autorizada por ${escapeHtml(movement.authorizedBy)}${movement.authorizationAt ? ` · ${escapeHtml(dateTime(movement.authorizationAt))}` : ""}</small>` : ""}</td>
      <td><span>${escapeHtml(movement.reason)}</span><small class="subtext">${escapeHtml(movement.document || "Sem documento")}</small>${movement.warning ? `<small class="subtext movement-warning">${escapeHtml(movement.warning)}</small>` : ""}</td>
    </tr>`).join("")
    : emptyTableRow(7, "Nenhuma movimentação registrada. Use “Registrar movimentação” para começar.");

  const buyItems = (procurement.stock || []).filter((item) => Number(item.buyNow) > 0);
  $("#purchase-body").innerHTML = buyItems.length ? buyItems.map((item) => {
    const quotation = item.recommendedQuotation;
    const reference = item.lastPrice || item.averagePrice || 0;
    return `<tr>
      <td><span class="project-name">${escapeHtml(item.material)}</span><small class="subtext">${escapeHtml(item.code)} · saldo ${number(item.current)} ${escapeHtml(item.unit)}</small></td>
      <td><strong>${number(item.buyNow)}</strong> ${escapeHtml(item.unit)}</td>
      <td class="money-cell">${reference ? `<strong>${money(reference)}</strong><small class="subtext">Último/médio das notas</small>` : "Sem preço histórico"}</td>
      <td>${quotation ? `<strong>${escapeHtml(quotation.supplierName)}</strong><small class="subtext">${money(quotation.landedUnitCost)} por ${escapeHtml(item.unit)}${quotation.freightKnown ? "" : " + frete a confirmar"} · nota ${quotation.score.toFixed(2)}</small>` : '<span class="pending-label">AGUARDANDO COTAÇÃO</span>'}</td>
      <td>${quotation ? `${number(quotation.deliveryDays)} dias` : "—"}</td>
      <td>${quotation ? `<span class="trust-label ${normalizeClass(quotation.reliability)}">${escapeHtml(quotation.reliability)}</span>` : "—"}</td>
      <td class="money-cell"><strong>${item.forecastCost ? money(item.forecastCost) : "Custo pendente"}</strong></td>
      <td><div class="table-actions"><button class="outline-button compact-button" data-add-quote="${escapeHtml(item.code)}">COTAÇÃO</button><button class="primary-button compact-button" data-market-search="${escapeHtml(item.code)}">PESQUISAR</button></div></td>
    </tr>`;
  }).join("") : emptyTableRow(8, "Nenhuma compra necessária no saldo atual.");

  $("#invoice-body").innerHTML = (procurement.invoices || []).map((invoice) => `<tr>
    <td><strong>${escapeHtml(invoice.number)}</strong></td><td>${escapeHtml(new Date(`${invoice.date}T12:00:00`).toLocaleDateString("pt-BR"))}</td>
    <td>${escapeHtml(invoice.supplier)}</td><td class="money-cell">${money(invoice.total)}</td><td>${escapeHtml(invoice.note)}</td>
    <td><span class="status-cell ${invoice.status === "CONFIRMADA" ? "" : invoice.status === "REJEITADA" ? "error" : "warning"}">${escapeHtml(invoice.status)}</span></td>
    <td>${invoice.status === "PENDENTE DE CONFERÊNCIA" ? `<button class="row-action invoice-confirm" data-invoice="${escapeHtml(invoice.number)}" title="Confirmar nota">✓</button>` : "—"}</td>
  </tr>`).join("");

  $("#supplier-grid").innerHTML = (procurement.suppliers || []).map((supplier) => {
    const officialSiteUrl = marketLink(supplier.officialSiteUrl);
    const siteAction = officialSiteUrl
      ? `<button class="primary-button" data-open-url="${escapeHtml(officialSiteUrl)}" data-open-purpose="supplier" data-supplier-name="${escapeHtml(supplier.name)}">ABRIR SITE OFICIAL</button>`
      : '<button class="primary-button" type="button" disabled>SITE NÃO CONFIRMADO</button>';
    return `<article class="panel supplier-card">
      <div class="supplier-card-top"><div><span class="section-index">${escapeHtml(supplier.reliability)}</span><h3>${escapeHtml(supplier.name)}</h3></div><span class="trust-label ${normalizeClass(supplier.reliability)}">${escapeHtml(supplier.reliability)}</span></div>
      <p>${escapeHtml(supplier.specialties)}</p>
      <dl><div><dt>ENDEREÇO</dt><dd>${escapeHtml(supplier.location)}</dd></div><div><dt>SITE OFICIAL</dt><dd>${officialSiteUrl ? escapeHtml(officialSiteUrl) : "Não confirmado"}</dd></div><div><dt>EVIDÊNCIA</dt><dd>${escapeHtml(supplier.evidence)}</dd></div><div><dt>CONFIRMAR</dt><dd>Preço, estoque, CNPJ faturador e compromisso de entrega por escrito.</dd></div><div><dt>VERIFICADO</dt><dd>${escapeHtml(new Date(`${supplier.verifiedAt}T12:00:00`).toLocaleDateString("pt-BR"))}</dd></div></dl>
      <div class="supplier-actions"><button class="outline-button" data-open-url="${escapeHtml(supplier.reputationUrl)}" data-open-purpose="reputation">VER REPUTAÇÃO</button>${siteAction}</div>
    </article>`;
  }).join("");

  populateProcurementForms(procurement);
  showProcurementTab(procurementTab);
}

function toolStatusMeta(status) {
  const normalized = String(status || "").toLocaleUpperCase("pt-BR");
  if (normalized === "EM_USO") return { label: "EM USO", className: "warning" };
  if (normalized === "MANUTENCAO") return { label: "EM MANUTENÇÃO", className: "warning" };
  if (normalized === "INATIVA") return { label: "INATIVA", className: "error" };
  return { label: "DISPONÍVEL", className: "" };
}

function activeToolUse(tool, history) {
  return (history || []).find((entry) => entry.id === tool.currentUseId && !entry.returnedAt) || null;
}

function setToolFormAvailability(form, enabled) {
  if (!form) return;
  $$('input, select, textarea, button', form).forEach((element) => {
    element.disabled = !enabled;
  });
}

function renderTools() {
  const tools = appState.tools || { items: [], history: [], summary: {} };
  const items = tools.items || [];
  const history = tools.history || [];
  const summary = tools.summary || {};
  const canCheckout = can("TOOL_REQUEST_WITHDRAWAL");
  const canReturn = can("TOOL_REGISTER_RETURN");
  const canManage = can("TOOL_MANAGE");
  const search = $("#tools-search")?.value.trim().toLocaleLowerCase("pt-BR") || "";
  const available = items.filter((item) => item.status === "DISPONIVEL" && !item.currentUseId);

  const toolBadge = document.getElementById("nav-tool-count");
  if (toolBadge) toolBadge.textContent = number(summary.inUse);
  $("#tool-total-count").textContent = number(summary.total);
  $("#tool-available-count").textContent = number(summary.available);
  $("#tool-in-use-count").textContent = number(summary.inUse);
  $("#tool-maintenance-count").textContent = number(summary.maintenance);
  $("#tool-history-count").textContent = `${number(summary.historyCount)} registros`;

  const checkoutSelect = $("#tool-checkout-tool");
  const previousToolId = checkoutSelect.value;
  checkoutSelect.innerHTML = available.length
    ? `<option value="">SELECIONE A FERRAMENTA</option>${available.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${item.assetTag ? ` · ${escapeHtml(item.assetTag)}` : ""}${item.location ? ` · ${escapeHtml(item.location)}` : ""}</option>`).join("")}`
    : '<option value="">Nenhuma ferramenta disponível</option>';
  if (available.some((item) => item.id === previousToolId)) checkoutSelect.value = previousToolId;
  const employeeSelect = $("#tool-checkout-employee");
  const previousEmployeeId = employeeSelect.value;
  const employees = appState.employees || [];
  employeeSelect.innerHTML = employees.length
    ? `<option value="">SELECIONE O FUNCIONÁRIO</option>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} · ${escapeHtml(employee.roleLabel || employee.login)}</option>`).join("")}`
    : '<option value="">Nenhum funcionário ativo cadastrado</option>';
  if (employees.some((employee) => employee.id === previousEmployeeId)) employeeSelect.value = previousEmployeeId;
  $("#tool-checkout-status").textContent = available.length
    ? `${number(available.length)} disponíveis para retirada`
    : "Nenhuma ferramenta disponível";
  setToolFormAvailability($("#tool-checkout-form"), canCheckout && available.length > 0 && employees.length > 0);
  setToolFormAvailability($("#tool-register-form"), canManage);
  $("#tool-checkout-authorization").classList.toggle("access-restricted", !canCheckout);

  const visibleTools = items.filter((item) => {
    if (!search) return true;
    const use = activeToolUse(item, history);
    return [item.name, item.category, item.assetTag, item.brandModel, item.location, item.status, use?.requestedBy]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(search));
  });
  $("#tool-list-summary").textContent = `${number(visibleTools.length)} de ${number(items.length)} ferramentas`;
  $("#tools-body").innerHTML = visibleTools.length
    ? visibleTools.map((item) => {
      const meta = toolStatusMeta(item.status);
      const use = activeToolUse(item, history);
      const lastMovement = item.status === "EM_USO" ? item.lastCheckoutAt : item.lastReturnAt || item.lastCheckoutAt;
      let action = "—";
      if (item.status === "EM_USO" && use) {
        action = canReturn
          ? `<button class="outline-button compact-button" data-return-tool="${escapeHtml(item.id)}">REGISTRAR DEVOLUÇÃO</button>`
          : "Devolução protegida";
      } else if (canManage && item.status === "DISPONIVEL") {
        action = `<div class="tool-actions"><button class="outline-button compact-button" data-tool-status="${escapeHtml(item.id)}" data-next-tool-status="MANUTENCAO">MANUTENÇÃO</button><button class="danger-button compact-button" data-remove-tool="${escapeHtml(item.id)}">EXCLUIR</button></div>`;
      } else if (canManage && item.status === "MANUTENCAO") {
        action = `<div class="tool-actions"><button class="outline-button compact-button" data-tool-status="${escapeHtml(item.id)}" data-next-tool-status="DISPONIVEL">LIBERAR</button><button class="danger-button compact-button" data-remove-tool="${escapeHtml(item.id)}">EXCLUIR</button></div>`;
      } else if (canManage && item.status === "INATIVA") {
        action = `<div class="tool-actions"><button class="outline-button compact-button" data-tool-status="${escapeHtml(item.id)}" data-next-tool-status="DISPONIVEL">REATIVAR</button><button class="danger-button compact-button" data-remove-tool="${escapeHtml(item.id)}">EXCLUIR</button></div>`;
      }
      return `<tr>
        <td><span class="project-name">${escapeHtml(item.name)}</span><small class="subtext">${escapeHtml(item.category)}</small></td>
        <td><strong>${escapeHtml(item.assetTag || "SEM PATRIMÔNIO")}</strong><small class="subtext">${escapeHtml(item.brandModel || "Modelo não informado")}</small></td>
        <td>${escapeHtml(item.location || "Local não informado")}</td>
        <td><span class="status-cell ${meta.className}">${escapeHtml(meta.label)}</span></td>
        <td>${use ? `<strong>${escapeHtml(use.requestedBy)}</strong><small class="subtext">Saída ${escapeHtml(dateTime(use.checkoutAt))}</small>` : "—"}</td>
        <td>${lastMovement ? escapeHtml(dateTime(lastMovement)) : "Sem movimentação"}</td>
        <td>${action}</td>
      </tr>`;
    }).join("")
    : emptyTableRow(7, search ? "Nenhuma ferramenta corresponde à busca." : "Nenhuma ferramenta cadastrada. Use o cadastro acima para iniciar o controle.");

  $("#tool-history-body").innerHTML = history.length
    ? history.slice(0, 300).map((entry) => `<tr>
      <td><strong>${escapeHtml(dateTime(entry.checkoutAt))}</strong></td>
      <td>${entry.returnedAt ? `<strong>${escapeHtml(dateTime(entry.returnedAt))}</strong>` : '<span class="pending-label">AGUARDANDO DEVOLUÇÃO</span>'}</td>
      <td><span class="project-name">${escapeHtml(entry.toolName)}</span><small class="subtext">${escapeHtml(entry.assetTag || entry.category)}</small></td>
      <td><strong>${escapeHtml(entry.requestedBy)}</strong>${entry.registeredBy && entry.registeredBy !== entry.requestedBy ? `<small class="subtext">Registrado por ${escapeHtml(entry.registeredBy)}</small>` : ""}</td>
      <td>${escapeHtml(entry.authorizedBy)}</td>
      <td>${entry.returnedBy ? escapeHtml(entry.returnedBy) : "—"}</td>
      <td>${escapeHtml(entry.purpose || "Sem finalidade informada")}${entry.returnNote ? `<small class="subtext">Devolução: ${escapeHtml(entry.returnNote)}</small>` : ""}</td>
    </tr>`).join("")
    : emptyTableRow(7, "Nenhuma retirada registrada. A primeira saída autorizada aparecerá neste histórico.");
}

function renderAccessControls() {
  if (!$("#active-user-label") || !$("#user-management-card")) return;
  const auth = appState.auth || {};
  const user = currentUser();
  $("#active-user-label").textContent = user?.name || "Sistema local";
  $("#active-role-label").textContent = user?.roleLabel || "Protegido";
  const canManageUsers = can("MANAGE_USERS");
  const card = $("#user-management-card");
  const openButton = $("#open-user-modal");
  openButton.disabled = !canManageUsers;
  card.classList.toggle("access-restricted", !canManageUsers);
  $("#user-management-notice").textContent = canManageUsers
    ? "Você administra os usuários e as permissões desta instalação."
    : "Somente o responsável geral pode cadastrar, bloquear ou alterar cargos.";
  const directory = auth.userDirectory || {};
  const directoryStatus = $("#user-directory-status");
  if (directoryStatus) {
    const shared = directory.mode === "SHARED";
    directoryStatus.textContent = shared ? (directory.connected ? "CENTRAL ATIVA" : "SEM CONEXÃO") : "LOCAL";
    directoryStatus.className = `status-badge ${shared && directory.connected ? "ready" : ""}`;
    $("#user-directory-message").textContent = directory.message || "Base de usuários não configurada.";
    $("#user-directory-path").textContent = directory.sharedDirectory || "Não configurada";
    $("#user-directory-path").title = directory.sharedDirectory || "";
    $("#enable-shared-users").disabled = !canManageUsers;
    $("#use-local-users").disabled = !canManageUsers || !shared;
  }

  const roles = auth.roles || [];
  const roleSelect = $("#user-role");
  const selectedRole = roleSelect.value;
  roleSelect.innerHTML = roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.label)}</option>`).join("");
  if (roles.some((role) => role.id === selectedRole)) roleSelect.value = selectedRole;
  else if (roles.length) roleSelect.value = roles.find((role) => role.id === "STOCK")?.id || roles[0].id;
  updateUserRoleDescription();

  const users = canManageUsers ? (auth.users || []) : [];
  $("#users-body").innerHTML = users.length
    ? users.map((item) => `<tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${escapeHtml(item.login)}</td>
      <td>${item.id === user?.id ? `<span class="role-label">${escapeHtml(item.roleLabel)}</span>` : `<select class="user-role-select" data-user-role="${escapeHtml(item.id)}">${roles.map((role) => `<option value="${escapeHtml(role.id)}"${role.id === item.role ? " selected" : ""}>${escapeHtml(role.label)}</option>`).join("")}</select>`}</td>
      <td><span class="status-cell ${item.active ? "" : "error"}">${item.active ? "ATIVO" : "BLOQUEADO"}</span></td>
      <td>${item.lastLoginAt ? escapeHtml(dateTime(item.lastLoginAt)) : "Nunca entrou"}</td>
      <td>${item.id === user?.id ? "Conta atual" : `<div class="user-actions"><button class="outline-button compact-button" data-reset-user-password="${escapeHtml(item.id)}">SENHA</button><button class="outline-button compact-button" data-toggle-user="${escapeHtml(item.id)}">${item.active ? "BLOQUEAR" : "ATIVAR"}</button></div>`}</td>
    </tr>`).join("")
    : emptyTableRow(6, canManageUsers ? "Nenhum usuário cadastrado." : "Lista protegida pelo responsável geral.");
}

function renderSettings() {
  $("#data-path").textContent = appInfo.dataPath || "—";
  $("#data-path").title = appInfo.dataPath || "";
  $("#platform-label").textContent = appInfo.platform || "—";
  $("#settings-version").textContent = appInfo.version || "0.1.0";
  $("#sidebar-version").textContent = appInfo.version || "0.1.0";
  const credentials = tavilyCredentials || appInfo.tavilyCredentials || {};
  const status = $("#market-api-status");
  if (credentials.error) {
    status.textContent = "RECONFIGURAR";
    status.className = "status-badge";
  } else if (credentials.hasKey) {
    status.textContent = "CHAVE ATIVA";
    status.className = "status-badge ready";
  } else {
    status.textContent = "KEYLESS ATIVO";
    status.className = "status-badge ready";
  }
  const input = $("#market-api-key");
  input.placeholder = credentials.hasKey ? `${credentials.maskedKey} · cole outra para substituir` : "tvly-...";
  $("#remove-market-api-key").disabled = !credentials.hasKey && !credentials.error;
  $("#market-api-mode").textContent = credentials.hasKey
    ? `Tavily com chave ${credentials.maskedKey}`
    : "Tavily Keyless + fonte aberta de reserva";
  $("#market-api-storage").textContent = credentials.storageProtected
    ? "Criptografia do sistema operacional"
    : "Proteção segura indisponível";
  const usage = credentials.usage !== null && credentials.usage !== undefined
    && credentials.limit !== null && credentials.limit !== undefined
    ? `${number(credentials.usage)} de ${number(credentials.limit)} créditos · ${number(credentials.remaining)} restantes`
    : "Uso não informado";
  $("#market-api-plan").textContent = credentials.hasKey
    ? `${credentials.plan || "Plano Tavily"} · ${usage}`
    : "Sem chave configurada";
  $("#market-api-help").textContent = credentials.error
    || (credentials.hasKey
      ? `Salva com proteção local. Último teste: ${dateTime(credentials.lastTestedAt)}. A chave nunca é devolvida inteira à tela.`
      : "Cole uma chave iniciada por tvly-, teste e salve. Sem chave, a pesquisa Keyless continua funcionando com limites temporários.");
  renderAccessControls();
}

function tavilyInputValue() {
  const value = $("#market-api-key").value.trim();
  if (!value) {
    $("#market-api-key").focus();
    throw new Error("Cole sua chave Tavily antes de continuar.");
  }
  return value;
}

function setTavilyButtonsBusy(busy, activeId = "") {
  ["test-market-api-key", "save-market-api-key", "remove-market-api-key"].forEach((id) => {
    const button = $(`#${id}`);
    button.disabled = busy || (id === "remove-market-api-key" && !tavilyCredentials?.hasKey && !tavilyCredentials?.error);
  });
  $("#test-market-api-key").textContent = busy && activeId === "test-market-api-key" ? "TESTANDO..." : "TESTAR";
  $("#save-market-api-key").textContent = busy && activeId === "save-market-api-key" ? "SALVANDO..." : "SALVAR";
  $("#remove-market-api-key").textContent = busy && activeId === "remove-market-api-key" ? "REMOVENDO..." : "REMOVER";
}

async function testMarketApiKey() {
  let apiKey;
  try {
    apiKey = tavilyInputValue();
  } catch (error) {
    toast("Chave Tavily necessária", error.message, "warning");
    return;
  }
  setTavilyButtonsBusy(true, "test-market-api-key");
  try {
    const result = await api.testTavilyKey(apiKey);
    const usage = result.usage !== null && result.limit !== null
      ? `${number(result.usage)} de ${number(result.limit)} créditos usados`
      : "uso não informado";
    $("#market-api-status").textContent = "CHAVE VÁLIDA";
    $("#market-api-status").className = "status-badge ready";
    $("#market-api-help").textContent = `Conexão aprovada em ${dateTime(result.testedAt)} · ${result.plan} · ${usage}. Clique em SALVAR para ativar esta chave.`;
    toast("Chave Tavily válida", "A conexão respondeu corretamente. Agora clique em SALVAR para ativá-la.", "success");
  } catch (error) {
    $("#market-api-status").textContent = "TESTE FALHOU";
    $("#market-api-status").className = "status-badge";
    $("#market-api-help").textContent = error.message;
    toast("Não foi possível validar a chave", error.message, "error", 8000);
  } finally {
    setTavilyButtonsBusy(false);
  }
}

async function saveMarketApiKey() {
  let apiKey;
  try {
    apiKey = tavilyInputValue();
  } catch (error) {
    toast("Chave Tavily necessária", error.message, "warning");
    return;
  }
  setTavilyButtonsBusy(true, "save-market-api-key");
  try {
    tavilyCredentials = await api.saveTavilyKey(apiKey);
    $("#market-api-key").value = "";
    renderSettings();
    toast("Chave Tavily ativada", `${tavilyCredentials.maskedKey} foi testada e salva com proteção local.`, "success");
  } catch (error) {
    toast("A chave não foi salva", error.message, "error", 8000);
  } finally {
    setTavilyButtonsBusy(false);
  }
}

async function removeMarketApiKey() {
  const accepted = await askConfirmation("Remover a chave Tavily?", "O Rasputim voltará ao modo Keyless gratuito. Estoque, projetos, cotações e histórico não serão alterados.", "REMOVER CHAVE");
  if (!accepted) return;
  setTavilyButtonsBusy(true, "remove-market-api-key");
  try {
    tavilyCredentials = await api.removeTavilyKey();
    $("#market-api-key").value = "";
    renderSettings();
    toast("Chave Tavily removida", "A pesquisa continuará no modo Keyless gratuito.", "success");
  } catch (error) {
    toast("Não foi possível remover a chave", error.message, "error", 8000);
  } finally {
    setTavilyButtonsBusy(false);
  }
}

function renderAi() {
  const online = Boolean(localAiState?.online);
  const status = $("#ai-status");
  if (!status) return;
  status.textContent = online ? "ONLINE" : "OFFLINE";
  status.className = `status-badge ${online ? "ready" : ""}`;
  const badge = $("#nav-ai-status");
  badge.textContent = online ? "ON" : "OFF";
  badge.classList.toggle("ready", online);
  $("#ai-endpoint").textContent = localAiState?.baseUrl || appInfo.localAiUrl || "http://127.0.0.1:8080";
  $("#ai-model").textContent = localAiState?.models?.[0] || localAiState?.detail || "—";
  $("#ai-core-state").textContent = aiBusy ? "PROCESSANDO RESPOSTA" : online ? "NÚCLEO LOCAL PRONTO" : "AGUARDANDO SERVIDOR LOCAL";
  $("#ai-core-detail").textContent = aiBusy
    ? "A resposta está sendo processada no llama-server deste computador."
    : online
      ? "Conexão local validada. Nenhum prompt é enviado para a internet."
      : "Inicie o llama-server para ativar o núcleo.";
  const core = $("#ai-core");
  core.classList.toggle("thinking", aiBusy);
  core.classList.toggle("online", online && !aiBusy);
  core.classList.toggle("idle", !online && !aiBusy);
  $("#ai-send").disabled = aiBusy || !online;
  $("#ai-refresh").disabled = aiBusy;
  $("#ai-prompt").disabled = aiBusy || !online;

  const log = $("#ai-chat-log");
  const baseMessage = `<div class="ai-message system"><strong>RASPUTIM</strong><p>A IA funciona somente quando o servidor local estiver ativo. Nenhum prompt desta aba é enviado a um provedor externo.</p></div>`;
  log.innerHTML = baseMessage + aiMessages.map((message) => `<div class="ai-message ${message.role}"><strong>${message.role === "user" ? "VOCÊ" : "RASPUTIM IA"}</strong><p>${escapeHtml(message.content).replaceAll("\n", "<br>")}</p></div>`).join("");
  log.scrollTop = log.scrollHeight;
}

async function refreshLocalAiStatus({ silent = false } = {}) {
  try {
    localAiState = await api.getLocalAiStatus();
  } catch (error) {
    localAiState = { online: false, baseUrl: appInfo.localAiUrl || "http://127.0.0.1:8080", error: error.message };
  }
  renderAi();
  if (!silent) {
    toast(localAiState.online ? "IA local conectada" : "IA local offline", localAiState.online ? "O núcleo está pronto para responder neste computador." : "Inicie o llama-server e teste novamente.", localAiState.online ? "success" : "warning", 4500);
  }
  return localAiState;
}

async function submitAiPrompt(event) {
  event?.preventDefault();
  if (aiBusy) return;
  const prompt = $("#ai-prompt").value.trim();
  if (!prompt) return;
  if (!localAiState.online) {
    await refreshLocalAiStatus();
    if (!localAiState.online) return;
  }
  aiMessages.push({ role: "user", content: prompt });
  $("#ai-prompt").value = "";
  aiBusy = true;
  renderAi();
  try {
    const result = await api.askLocalAi(prompt, localAiState.models?.[0] || "local-model");
    aiMessages.push({ role: "assistant", content: result.content });
  } catch (error) {
    aiMessages.push({ role: "assistant", content: `Falha local: ${error.message || "não foi possível consultar o modelo."}` });
    localAiState.online = false;
    toast("IA local indisponível", error.message || "Verifique o llama-server.", "error", 7000);
  } finally {
    aiBusy = false;
    renderAi();
  }
}

function renderAll() {
  renderDashboard();
  renderProjects();
  renderClients();
  renderPcp();
  renderReports();
  renderProcurement();
  renderTools();
  renderAi();
  renderSettings();
}

function setAnalysisStage(index, complete = false) {
  $$("#analysis-stages li").forEach((item, itemIndex) => {
    item.classList.toggle("complete", complete ? itemIndex <= index : itemIndex < index);
    item.classList.toggle("active", !complete && itemIndex === index);
  });
}

function resetAnalysisVisual() {
  $("#scanner-core").classList.remove("processing");
  $("#scanner-core").classList.add("idle");
  $("#analysis-badge").className = "status-badge ready";
  $("#analysis-badge").textContent = "PRONTO";
  $$("#analysis-stages li").forEach((item) => item.classList.remove("active", "complete"));
}

async function runProjectAnalysis(paths) {
  if (analyzing || !paths?.length) return;
  analyzing = true;
  $("#scanner-core").classList.remove("idle");
  $("#scanner-core").classList.add("processing");
  $("#analysis-badge").className = "status-badge processing";
  $("#analysis-badge").textContent = "PROCESSANDO";
  let stage = 0;
  setAnalysisStage(stage);
  const stageTimer = setInterval(() => {
    if (stage < 3) { stage += 1; setAnalysisStage(stage); }
  }, 360);

  try {
    const analysisPromise = api.analyzeProjects(paths);
    const [result] = await Promise.all([analysisPromise, wait(1100)]);
    clearInterval(stageTimer);
    setAnalysisStage(4, true);
    $("#analysis-badge").className = "status-badge ready";
    $("#analysis-badge").textContent = "CONCLUÍDO";
    appState = result.state;
    renderAll();
    if (result.imported) toast("Análise concluída", `${result.imported} ${result.imported === 1 ? "projeto foi conferido" : "projetos foram conferidos"} e salvo no histórico.`, "success");
    for (const failure of result.failures || []) toast(`Falha em ${failure.fileName}`, failure.message, "error", 6500);
    await wait(1700);
  } catch (error) {
    clearInterval(stageTimer);
    toast("Não foi possível analisar", error.message || "Verifique o arquivo selecionado.", "error", 6500);
  } finally {
    analyzing = false;
    resetAnalysisVisual();
  }
}

async function chooseAndAnalyzeProjects() {
  try {
    const paths = await api.chooseProjects();
    if (paths?.length) await runProjectAnalysis(paths);
  } catch (error) {
    toast("Seleção não concluída", error.message, "error");
  }
}

async function importSalesFile() {
  try {
    const filePath = await api.chooseSalesFile();
    if (!filePath) return;
    toast("Identificando planilha", "Conferindo se o arquivo é orçamento ou base de clientes...", "warning", 1800);
    const result = await api.importSales(filePath);
    appState = result.state;
    renderAll();
    if (result.detectedType === "PROJECT") {
      showView("projects");
      toast("Orçamento reconhecido", `${result.projectName || result.fileName} foi encaminhado automaticamente para a análise de projetos.`, "success");
    } else {
      toast("Base comercial atualizada", `${number(appState.dashboard.salesCount)} clientes e ${money(appState.dashboard.salesTotal)} em vendas registradas.`, "success");
    }
  } catch (error) {
    toast("Planilha não reconhecida", error.message, "error", 8500);
  }
}

async function importStockFile(filePath = null) {
  if (stockImportBusy) return;
  try {
    const selectedPath = filePath || await api.chooseStockFile();
    if (!selectedPath) return;
    stockImportBusy = true;
    showView("procurement");
    showProcurementTab("counts");
    toast("Conferindo levantamento", "Lendo materiais e comparando cada saldo com o estoque atual...", "warning", 2200);
    const mode = $("#stock-import-mode")?.value || "MERGE";
    currentStockImportPreview = await api.previewStock(selectedPath, mode);
    renderProcurement();
    showProcurementTab("counts");
    if (currentStockImportPreview.duplicate) {
      toast("Arquivo já aplicado", "Este mesmo levantamento já existe no histórico e não poderá ser aplicado novamente.", "error", 7500);
    } else {
      const totals = currentStockImportPreview.totals || {};
      const action = currentStockImportPreview.mode === "REPLACE"
        ? `${number(totals.removedItems)} materiais antigos serão arquivados e removidos da base ativa`
        : `${number(totals.preservedItems)} materiais ausentes serão preservados`;
      toast("Prévia pronta", `${number(totals.validItems)} materiais lidos; ${action}.`, "success", 6500);
    }
  } catch (error) {
    currentStockImportPreview = null;
    renderProcurement();
    toast("Falha ao ler levantamento", error.message || "Verifique a estrutura da planilha.", "error", 8500);
  } finally {
    stockImportBusy = false;
    renderStockImport(appState.procurement || { stockCounts: [] });
  }
}

async function cancelStockImport() {
  if (!currentStockImportPreview || stockImportBusy) return;
  const previewId = currentStockImportPreview.previewId;
  currentStockImportPreview = null;
  renderProcurement();
  try {
    await api.cancelStockPreview(previewId);
  } catch {
    // A prévia é temporária; a tela já foi limpa com segurança.
  }
}

async function applyStockImportPreview() {
  if (!currentStockImportPreview || stockImportBusy) return;
  const responsible = currentUser()?.name || "";
  if (responsible.length < 2) {
    toast("Sessão necessária", "Entre com uma conta de estoque para aplicar o levantamento.", "warning", 6000);
    return;
  }
  if (currentStockImportPreview.duplicate) {
    toast("Levantamento duplicado", "O mesmo arquivo já foi aplicado e está preservado no histórico.", "error", 6500);
    return;
  }
  const totals = currentStockImportPreview.totals || {};
  const replaceMode = currentStockImportPreview.mode === "REPLACE";
  const accepted = await askConfirmation(
    replaceMode ? "Substituir todo o estoque?" : "Aplicar esta atualização parcial?",
    replaceMode
      ? `Os ${number(totals.replacedBaseItems)} materiais atuais e seus históricos vinculados serão retirados da base ativa. Um backup automático será criado e somente os ${number(totals.validItems)} materiais da nova planilha permanecerão no estoque.`
      : `${number(totals.changedItems)} saldos serão alterados, ${number(totals.newItems)} materiais serão adicionados e ${number(totals.pendingItems)} ficarão como VERIFICAR NO ESTOQUE. Os ${number(totals.preservedItems)} materiais ausentes continuarão preservados.`,
    replaceMode ? "CONFIRMAR SUBSTITUIÇÃO TOTAL" : "APLICAR ATUALIZAÇÃO",
  );
  if (!accepted) return;

  stockImportBusy = true;
  renderStockImport(appState.procurement || { stockCounts: [] });
  try {
    const result = await api.applyStockPreview(currentStockImportPreview.previewId, { registeredBy: responsible });
    appState = result.state;
    currentStockImportPreview = null;
    renderAll();
    showView("procurement");
    showProcurementTab("counts");
    toast(
      replaceMode ? "Estoque substituído" : "Levantamento aplicado",
      replaceMode
        ? `A nova base foi criada e o estoque anterior ficou guardado em backup. Responsável: ${responsible}.`
        : `Estoque atualizado e auditoria registrada em nome de ${responsible}.`,
      "success",
      7000,
    );
  } catch (error) {
    toast("Não foi possível aplicar", error.message || "Selecione a planilha novamente.", "error", 8500);
  } finally {
    stockImportBusy = false;
    renderStockImport(appState.procurement || { stockCounts: [] });
  }
}

async function confirmInvoice(number) {
  const accepted = await askConfirmation("Confirmar esta nota de compra?", `A NF-e ${number} será marcada como conferida. Nesta versão de apresentação isso não altera o estoque automaticamente.`, "CONFIRMAR NOTA");
  if (!accepted) return;
  try {
    appState = await api.setInvoiceStatus(number, "CONFIRMADA");
    renderAll();
    toast("Nota confirmada", `A NF-e ${number} entrou no histórico validado de preços.`, "success");
  } catch (error) {
    toast("Não foi possível confirmar", error.message, "error", 6500);
  }
}

function procurementMaterial(code) {
  return (appState.procurement?.stock || []).find((item) => item.code === code);
}

function updateMovementBalance() {
  const material = procurementMaterial($("#movement-material").value);
  if (!material) {
    $("#movement-balance").textContent = "Selecione um material";
    updateMovementAuthorization();
    return;
  }
  $("#movement-balance").textContent = material.current === null
    ? "Saldo desconhecido: registre primeiro uma CONTAGEM FÍSICA."
    : `Saldo atual: ${number(material.current)} ${material.unit} · mínimo ${number(material.minimum)} ${material.unit}`;
  if (material.current === null) $("#movement-type").value = "CONTAGEM";
  updateMovementAuthorization();
}

function updateMovementAuthorization() {
  const isExit = $("#movement-type").value === "SAIDA";
  const authorization = $("#movement-authorization");
  authorization.hidden = !isExit;
  $("#movement-authorizer-login").required = isExit;
  $("#movement-authorizer-password").required = isExit;
}

function openMovementModal(code = "") {
  if (!currentUser()) {
    showAuthGate(appState.auth || {});
    return;
  }
  if (!can("STOCK_ENTRY") && !can("STOCK_COUNT") && !can("STOCK_REQUEST_EXIT")) {
    toast("Acesso restrito", "Seu cargo não possui permissão para movimentar o estoque.", "warning", 6000);
    return;
  }
  $("#movement-form").reset();
  populateProcurementForms(appState.procurement || { stock: [], suppliers: [] });
  $("#movement-user").value = currentUser().name;
  $("#movement-type").querySelector('option[value="ENTRADA"]').disabled = !can("STOCK_ENTRY");
  $("#movement-type").querySelector('option[value="CONTAGEM"]').disabled = !can("STOCK_COUNT");
  $("#movement-type").querySelector('option[value="SAIDA"]').disabled = !can("STOCK_REQUEST_EXIT");
  if ($("#movement-type").selectedOptions[0]?.disabled) {
    $("#movement-type").value = can("STOCK_REQUEST_EXIT") ? "SAIDA" : can("STOCK_ENTRY") ? "ENTRADA" : "CONTAGEM";
  }
  if (code && procurementMaterial(code)) $("#movement-material").value = code;
  updateMovementBalance();
  $("#movement-modal").classList.add("open");
  $("#movement-modal").setAttribute("aria-hidden", "false");
  $("#movement-quantity").focus();
}

function closeMovementModal() {
  $("#movement-modal").classList.remove("open");
  $("#movement-modal").setAttribute("aria-hidden", "true");
}

function openMaterialModal() {
  if (!currentUser()) {
    showAuthGate(appState.auth || {});
    return;
  }
  if (!can("STOCK_MANAGE_MATERIALS")) {
    toast("Acesso restrito", "Seu cargo não possui permissão para cadastrar materiais.", "warning", 6000);
    return;
  }
  $("#material-form").reset();
  $("#material-unit").value = "UN.";
  $("#material-current").value = "0";
  $("#material-minimum").value = "0";
  $("#material-modal").classList.add("open");
  $("#material-modal").setAttribute("aria-hidden", "false");
  $("#material-name").focus();
}

function closeMaterialModal() {
  $("#material-modal").classList.remove("open");
  $("#material-modal").setAttribute("aria-hidden", "true");
}

async function submitMaterial(event) {
  event.preventDefault();
  if (materialBusy) return;
  materialBusy = true;
  const button = $("#material-form button[type='submit']");
  if (button) button.disabled = true;
  try {
    appState = await api.addMaterial({
      material: $("#material-name").value,
      category: $("#material-category").value,
      unit: $("#material-unit").value,
      current: Number($("#material-current").value),
      minimum: Number($("#material-minimum").value),
      storageLocation: $("#material-location").value,
      notes: $("#material-notes").value,
      document: $("#material-document").value,
    });
    const name = $("#material-name").value.trim();
    renderAll();
    showView("procurement");
    showProcurementTab("stock");
    closeMaterialModal();
    toast("Material cadastrado", `${name} foi incluído no estoque e o saldo inicial foi registrado.`, "success", 6000);
  } catch (error) {
    toast("Não foi possível cadastrar o material", error.message || "Revise os campos e tente novamente.", "error", 7000);
  } finally {
    materialBusy = false;
    if (button) button.disabled = false;
  }
}

async function submitMovement(event) {
  event.preventDefault();
  if (movementBusy) return;
  const material = procurementMaterial($("#movement-material").value);
  if (!material) return;
  const continueRegistering = event.submitter?.dataset.continueMovement === "true";
  const movementType = $("#movement-type").value;
  if (movementType === "SAIDA" && (!$("#movement-authorizer-login").value.trim() || !$("#movement-authorizer-password").value)) {
    toast("Autorização necessária", "Informe o usuário e a senha de quem autorizou a saída.", "warning", 6500);
    return;
  }
  movementBusy = true;
  $$("#movement-form button[type='submit']").forEach((button) => { button.disabled = true; });
  try {
    appState = await api.recordMovement({
      materialCode: material.code,
      type: movementType,
      quantity: Number($("#movement-quantity").value),
      reason: $("#movement-reason").value,
      document: $("#movement-document").value,
      authorizerLogin: $("#movement-authorizer-login").value,
      authorizerPassword: $("#movement-authorizer-password").value,
    });
    renderAll();
    showView("procurement");
    showProcurementTab("stock");
    const updated = procurementMaterial(material.code);
    if (continueRegistering) {
      openMovementModal();
      $("#movement-type").value = movementType;
      updateMovementBalance();
    } else {
      closeMovementModal();
    }
    const negativeWarning = Number(updated.current) < 0 ? " Saldo negativo mantido para conferência, sem bloquear novas movimentações." : "";
    toast("Movimentação registrada", `${material.material}: saldo atualizado para ${number(updated.current)} ${updated.unit}.${negativeWarning}`, Number(updated.current) < 0 ? "warning" : "success", 6500);
  } catch (error) {
    toast("Não foi possível movimentar o estoque", error.message, "error", 6500);
  } finally {
    movementBusy = false;
    $$("#movement-form button[type='submit']").forEach((button) => { button.disabled = false; });
  }
}

function updateQuotationSupplier() {
  const supplier = (appState.procurement?.suppliers || []).find((item) => item.id === $("#quotation-supplier").value);
  if (supplier) {
    $("#quotation-supplier-name").value = supplier.name;
    $("#quotation-reliability").value = supplier.reliability;
  } else if ($("#quotation-supplier").value === "CUSTOM") {
    $("#quotation-supplier-name").value = "";
    $("#quotation-reliability").value = "NÃO AVALIADA";
  }
}

function openQuotationModal(code = "", prefill = null) {
  $("#quotation-form").reset();
  populateProcurementForms(appState.procurement || { stock: [], suppliers: [] });
  const item = procurementMaterial(code) || (appState.procurement?.stock || []).find((material) => Number(material.buyNow) > 0);
  if (!item) {
    toast("Nenhuma compra pendente", "O saldo atual não exige nova cotação.", "warning");
    return;
  }
  $("#quotation-material").value = item.code;
  $("#quotation-quantity").value = item.buyNow;
  if (prefill) {
    $("#quotation-price").value = prefill.price || "";
    $("#quotation-freight").value = prefill.freightKnown ? Number(prefill.freight || 0) : "";
    $("#quotation-delivery").value = prefill.deliveryDays !== null
      && prefill.deliveryDays !== undefined
      && Number.isFinite(Number(prefill.deliveryDays))
      ? Number(prefill.deliveryDays)
      : "";
    $("#quotation-url").value = prefill.sourceUrl || "";
    $("#quotation-note").value = [prefill.note || prefill.title, prefill.address, prefill.phoneNumber].filter(Boolean).join(" · ").slice(0, 400);
    const supplier = (appState.procurement?.suppliers || []).find((known) => {
      const left = normalizeClass(known.name);
      const right = normalizeClass(prefill.supplierName);
      return left === right || left.includes(right) || right.includes(left);
    });
    if (supplier) $("#quotation-supplier").value = supplier.id;
    else $("#quotation-supplier").value = "CUSTOM";
    $("#quotation-supplier-name").value = supplier?.name || prefill.supplierName || "";
    $("#quotation-reliability").value = prefill.reliability || supplier?.reliability || "NÃO AVALIADA";
  } else {
    updateQuotationSupplier();
  }
  $("#quotation-modal").classList.add("open");
  $("#quotation-modal").setAttribute("aria-hidden", "false");
  $("#quotation-price").focus();
}

function closeQuotationModal() {
  $("#quotation-modal").classList.remove("open");
  $("#quotation-modal").setAttribute("aria-hidden", "true");
}

async function submitQuotation(event) {
  event.preventDefault();
  const material = procurementMaterial($("#quotation-material").value);
  const supplier = (appState.procurement?.suppliers || []).find((item) => item.id === $("#quotation-supplier").value);
  if (!material) return;
  const supplierName = $("#quotation-supplier-name").value.trim();
  if (!supplierName) {
    toast("Fornecedor não informado", "Digite o nome da loja ou empresa responsável pela cotação.", "warning");
    return;
  }
  const freightInput = $("#quotation-freight").value.trim();
  try {
    appState = await api.addQuotation({
      materialCode: material.code,
      supplierId: supplier?.id || "",
      supplierName,
      quantity: Number($("#quotation-quantity").value),
      unitPrice: Number($("#quotation-price").value),
      freight: freightInput === "" ? null : Number(freightInput),
      freightKnown: freightInput !== "",
      deliveryDays: Number($("#quotation-delivery").value),
      reliability: $("#quotation-reliability").value,
      sourceUrl: $("#quotation-url").value,
      note: $("#quotation-note").value,
    });
    closeQuotationModal();
    renderAll();
    showView("procurement");
    showProcurementTab("purchases");
    toast("Cotação registrada", `${supplierName} foi incluído na comparação de ${material.material}.`, "success");
  } catch (error) {
    toast("Não foi possível salvar a cotação", error.message, "error", 6500);
  }
}

function closeMarketModal() {
  $("#market-modal").classList.remove("open");
  $("#market-modal").setAttribute("aria-hidden", "true");
}

function marketDistanceLabel(result) {
  if (result.distanceStatus === "WITHIN_RADIUS" && Number.isFinite(Number(result.distanceKm))) {
    return `${number(result.distanceKm)} km de Maringá`;
  }
  return "Paraná · distância confirmada no raio";
}

function isParanaMarketResult(result) {
  return result?.locationConfirmed === true
    && result?.stateCode === "PR"
    && result?.distanceStatus === "WITHIN_RADIUS";
}

function marketLink(value) {
  try {
    const parsed = new URL(String(value || ""));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function marketWhatsappLink(value) {
  const url = marketLink(value);
  if (!url) return "";
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com") ? url : "";
  } catch {
    return "";
  }
}

function marketPhone(value) {
  const phone = String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const digits = phone.replace(/\D/g, "");
  return /^[+()\d\s.-]+$/.test(phone) && [10, 11, 12, 13].includes(digits.length) ? phone : "";
}

function marketResultCard(result) {
  const newSupplier = !result.isKnown;
  const distanceClass = "inside";
  const rating = Number(result.rating) > 0
    ? `${Number(result.rating).toFixed(1)} / 5${Number(result.ratingCount) > 0 ? ` · ${number(result.ratingCount)} avaliações` : ""}`
    : "Sem avaliação pública confirmada";
  const freight = result.freightKnown
    ? Number(result.freight) === 0 ? "Frete grátis informado" : `Frete: ${money(result.freight)}`
    : "Frete a confirmar";
  const price = Number(result.price) > 0
    ? `<strong>${money(result.price)}</strong><span>${escapeHtml(freight)}</span>${result.freightKnown ? `<small>Custo anunciado: ${money(result.totalPrice || result.price)}</small>` : ""}`
    : `<strong>Solicitar cotação</strong><span>${escapeHtml(freight)}</span>`;
  const address = [marketDistanceLabel(result), result.address].filter(Boolean).join(" · ");
  const actionLabel = result.kind === "OFFER" && Number(result.price) > 0 ? "USAR NA COTAÇÃO" : "COTAR COM ELE";
  const officialSiteUrl = marketLink(result.officialSiteUrl
    || (result.kind === "SUPPLIER" && result.officialSiteConfirmed === true ? result.sourceUrl : ""));
  const offerUrl = result.kind === "OFFER"
    ? marketLink(result.offerUrl || (result.offerUrlConfirmed === true ? result.sourceUrl : ""))
    : "";
  const canOpenOffer = result.kind === "OFFER" && result.offerUrlConfirmed === true && offerUrl;
  const canOpenSupplierSite = result.officialSiteConfirmed === true && officialSiteUrl;
  const phoneNumber = marketPhone(result.phoneNumber);
  const whatsappUrl = marketWhatsappLink(result.whatsappUrl);
  const websiteAction = canOpenSupplierSite
    ? `<button class="outline-button" data-open-url="${escapeHtml(officialSiteUrl)}" data-open-purpose="supplier" data-supplier-name="${escapeHtml(result.supplierName)}">ABRIR SITE OFICIAL</button>`
    : '<button class="outline-button" type="button" disabled>SITE NÃO ENCONTRADO</button>';
  const offerAction = canOpenOffer
    ? `<button class="outline-button" data-open-url="${escapeHtml(offerUrl)}" data-open-purpose="offer" data-supplier-name="${escapeHtml(result.supplierName)}">ABRIR OFERTA</button>`
    : "";
  const whatsappAction = whatsappUrl
    ? `<button class="contact-button whatsapp" data-open-url="${escapeHtml(whatsappUrl)}" data-open-purpose="whatsapp" data-supplier-name="${escapeHtml(result.supplierName)}">${result.whatsappConfirmed === true ? "ABRIR WHATSAPP" : "TENTAR WHATSAPP"}</button>`
    : "";
  const phoneAction = phoneNumber
    ? `<button class="contact-button" data-copy-phone="${escapeHtml(phoneNumber)}">COPIAR TELEFONE</button>`
    : '<button class="contact-button" type="button" disabled>TELEFONE NÃO ENCONTRADO</button>';
  const linkDetails = [
    `<small><strong>ENDEREÇO:</strong> ${escapeHtml(address || "Não informado")}</small>`,
    `<small><strong>SITE OFICIAL:</strong> ${canOpenSupplierSite ? escapeHtml(officialSiteUrl) : "Não encontrado automaticamente"}</small>`,
    `<small><strong>TELEFONE:</strong> ${phoneNumber ? escapeHtml(phoneNumber) : "Não encontrado automaticamente"}${result.contactSource ? ` · ${escapeHtml(result.contactSource)}` : ""}</small>`,
    `<small><strong>WHATSAPP:</strong> ${whatsappUrl ? (result.whatsappConfirmed === true ? "Confirmado na fonte" : "Número móvel disponível para tentativa") : "Não encontrado automaticamente"}</small>`,
    result.kind === "OFFER" ? `<small><strong>LINK DA OFERTA:</strong> ${canOpenOffer ? escapeHtml(offerUrl) : "Não confirmado"}</small>` : "",
  ].join("");
  const confidence = result.matchConfidence || "BAIXA";
  return `<article class="market-result">
    <div class="market-result-main">
      <div class="market-result-badges"><span class="supplier-origin ${newSupplier ? "new" : "known"}">${newSupplier ? "NOVO FORNECEDOR" : "JÁ CADASTRADO"}</span><span class="distance-label ${distanceClass}">${escapeHtml(marketDistanceLabel(result))}</span><span class="source-label">PARANÁ CONFIRMADO</span><span class="source-label">${escapeHtml(result.sourceType || "BUSCA WEB")}</span><span class="source-label">ADERÊNCIA ${escapeHtml(confidence)} · ${number(result.confidenceScore || 0)}%</span></div>
      <div><h3>${escapeHtml(result.title || result.supplierName)}</h3><p>${escapeHtml(result.supplierName)} · ${escapeHtml(result.delivery || "Prazo a confirmar")}</p>${linkDetails}<small>${escapeHtml(result.note)}</small><small class="market-rating">${escapeHtml(rating)}</small></div>
    </div>
    <div class="market-result-price">${price}</div>
    <div class="market-result-actions">${websiteAction}${offerAction}${whatsappAction}${phoneAction}<button class="primary-button" data-market-use="${escapeHtml(result.id)}">${actionLabel}</button></div>
  </article>`;
}

function marketSection(title, description, results) {
  if (!results.length) return "";
  return `<section class="market-section"><div class="market-section-heading"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><span>${number(results.length)} resultados</span></div>${results.map(marketResultCard).join("")}</section>`;
}

function renderMarketResults(search) {
  currentMarketSearch = search;
  $("#market-title").textContent = search?.material || "Pesquisa de mercado";
  const results = (search?.results || []).filter(isParanaMarketResult);
  const resultLabel = results.length === 1 ? "resultado confirmado" : "resultados confirmados";
  const inspectedPages = Number(search?.diagnostics?.tavilyPages || 0)
    + Number(search?.diagnostics?.contactPages || 0)
    + Number(search?.diagnostics?.reservePages || 0);
  const extractedPages = Number(search?.diagnostics?.locationPagesExtracted || 0);
  $("#market-subtitle").textContent = search?.searchedAt
    ? `${number(results.length)} ${resultLabel} no Paraná · raio de ${number(search.radiusKm)} km${inspectedPages ? ` · ${number(inspectedPages)} páginas encontradas` : ""}${extractedPages ? ` · ${number(extractedPages)} endereços verificados` : ""} · ${dateTime(search.searchedAt)}`
    : "Resultados do Paraná para conferência.";
  const uniqueSuppliers = (items) => new Set(items.map((item) => normalizeClass(item.supplierName)).filter(Boolean)).size;
  const counts = {
    newSuppliers: uniqueSuppliers(results.filter((item) => !item.isKnown)),
    localWithinRadius: uniqueSuppliers(results),
    offersWithPrice: results.filter((item) => item.kind === "OFFER" && Number(item.price) > 0).length,
    knownSuppliers: uniqueSuppliers(results.filter((item) => item.isKnown)),
    suppliersWithSite: uniqueSuppliers(results.filter((item) => item.officialSiteConfirmed && item.officialSiteUrl)),
    suppliersWithPhone: uniqueSuppliers(results.filter((item) => item.phoneNumber)),
    suppliersWithWhatsapp: uniqueSuppliers(results.filter((item) => item.whatsappUrl)),
  };
  const warnings = search?.warnings || [];
  $("#market-radius").value = Number(search?.radiusKm) || 100;
  $("#market-summary").innerHTML = `<div class="market-kpi"><strong>${number(counts.newSuppliers)}</strong><span>NOVOS FORNECEDORES</span></div><div class="market-kpi"><strong>${number(counts.localWithinRadius)}</strong><span>LOCAIS NO RAIO</span></div><div class="market-kpi"><strong>${number(counts.offersWithPrice)}</strong><span>OFERTAS COM PREÇO</span></div><div class="market-kpi"><strong>${number(counts.knownSuppliers)}</strong><span>JÁ CADASTRADOS</span></div><div class="market-contact-summary"><strong>CONTATOS AUTOMÁTICOS</strong><span>${number(counts.suppliersWithSite || 0)} sites oficiais · ${number(counts.suppliersWithPhone || 0)} telefones · ${number(counts.suppliersWithWhatsapp || 0)} WhatsApps</span></div>${warnings.length ? `<div class="market-warning"><strong>Pesquisa parcial</strong><span>${escapeHtml(warnings.join(" · "))}</span></div>` : ""}`;

  const newLocal = results.filter((item) => item.kind === "SUPPLIER" && !item.isKnown && item.distanceStatus === "WITHIN_RADIUS");
  const localOffers = results.filter((item) => item.kind === "OFFER" && item.distanceStatus === "WITHIN_RADIUS");
  const known = results.filter((item) => item.kind === "SUPPLIER" && item.isKnown);
  const sections = [
    marketSection("Novos fornecedores do Paraná", "Empresas com endereço no Paraná e distância dentro do raio escolhido a partir de Maringá.", newLocal),
    marketSection("Ofertas de fornecedores do Paraná", "Preço anunciado por empresa localizada no Paraná e dentro do raio escolhido.", localOffers),
    marketSection("Fornecedores do Paraná já conhecidos", "Resultados confirmados novamente entre os cadastros atuais.", known),
  ].join("");
  $("#market-results").innerHTML = results.length && sections
    ? sections
    : `<div class="market-empty"><strong>Nenhum fornecedor confirmado no Paraná foi encontrado dentro do raio.</strong><span>${inspectedPages ? `A pesquisa encontrou ${number(inspectedPages)} páginas${extractedPages ? ` e abriu ${number(extractedPages)} para confirmar o endereço` : ""}, mas nenhuma comprovou endereço paranaense dentro do raio. ` : ""}Tente aumentar o raio ou conferir o nome e a especificação do material. Resultados de outros estados não serão exibidos.</span></div>`;
}

function openMarketResearch(code) {
  const material = procurementMaterial(code);
  if (!material) return;
  currentMarketMaterialCode = code;
  currentMarketSearch = null;
  $("#market-modal").classList.add("open");
  $("#market-modal").setAttribute("aria-hidden", "false");
  $("#market-title").textContent = material.material;
  $("#market-subtitle").textContent = "Escolha o raio. A pesquisa ficará obrigatoriamente dentro do Paraná.";
  $("#market-radius").value = Number(appState.procurement?.settings?.marketRadiusKm) || 100;
  $("#market-summary").innerHTML = "";
  $("#market-results").innerHTML = '<div class="market-empty market-intro"><strong>A pesquisa descobrirá fornecedores novos, mas somente no Paraná.</strong><span>O Rasputim procura automaticamente site oficial, telefone e WhatsApp. Mapas, guias de empresas e páginas de cadastro nunca serão usados no botão do site.</span></div>';
  setTimeout(() => $("#market-radius").focus(), 50);
}

async function runMarketResearch() {
  const material = procurementMaterial(currentMarketMaterialCode);
  if (!material) return;
  const radiusKm = Number($("#market-radius").value);
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 5000) {
    toast("Raio inválido", "Informe um raio entre 1 e 5.000 km.", "warning");
    $("#market-radius").focus();
    return;
  }
  const runButton = $("#market-run");
  runButton.disabled = true;
  runButton.textContent = "PESQUISANDO...";
  $("#market-summary").innerHTML = "";
  $("#market-subtitle").textContent = `Buscando somente fornecedores do Paraná em até ${number(radiusKm)} km de Maringá...`;
  $("#market-results").innerHTML = '<div class="market-loading"><span class="pulse-dot"></span><strong>CONSULTANDO EMPRESAS, PREÇOS E CONTATOS</strong><small>O sistema procura endereço, site oficial, telefone e WhatsApp sem alterar o estoque automaticamente.</small></div>';
  try {
    const result = await api.researchMarket(material.code, radiusKm);
    appState = result.state;
    renderAll();
    renderMarketResults(result.search);
  } catch (error) {
    $("#market-subtitle").textContent = "Pesquisa não concluída";
    $("#market-results").innerHTML = `<div class="market-empty error"><strong>${escapeHtml(error.message)}</strong><span>Confira a conexão com a internet e tente novamente em alguns minutos. O cadastro interno continua preservado.</span></div>`;
  } finally {
    runButton.disabled = false;
    runButton.textContent = "BUSCAR NOVOS FORNECEDORES";
  }
}

async function openExternal(url, purpose = "", supplierName = "") {
  try {
    await api.openExternal(url, purpose, supplierName);
  } catch (error) {
    toast("Não foi possível abrir o link", error.message, "error");
  }
}

async function copyMarketPhone(phoneNumber) {
  try {
    await api.copyMarketPhone(phoneNumber);
    toast("Telefone copiado", `${phoneNumber} está pronto para colar.`, "success");
  } catch (error) {
    toast("Não foi possível copiar", error.message, "error");
  }
}

function openProject(projectId) {
  const project = appState.projects.find((item) => item.id === projectId);
  if (!project) return;
  selectedProjectId = projectId;
  selectedModalTab = "environments";
  $("#modal-project-size").textContent = project.size.toUpperCase();
  $("#modal-project-file").textContent = project.fileName;
  $("#modal-project-name").textContent = project.name;
  $("#modal-project-kpis").innerHTML = [
    ["VALOR DO PROJETO", money(project.workbookTotal)],
    ["AMBIENTES", number(project.environmentCount)],
    ["DIFERENÇA INTERNA", money(project.difference)],
    ["ALERTAS", number(actionableAlerts(project).length)],
  ].map(([label, value]) => `<div class="modal-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  $$(".modal-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.modalTab === selectedModalTab));
  renderModalContent(project);
  $("#project-modal").classList.add("open");
  $("#project-modal").setAttribute("aria-hidden", "false");
}

function closeProjectModal() {
  $("#project-modal").classList.remove("open");
  $("#project-modal").setAttribute("aria-hidden", "true");
  selectedProjectId = null;
}

function renderModalContent(project) {
  if (selectedModalTab === "environments") {
    $("#modal-content").innerHTML = `<div class="table-wrap"><table><thead><tr><th>AMBIENTE</th><th>QTD.</th><th>MARCENARIA</th><th>SERRALHERIA</th><th>VIDRAÇARIA</th><th>ILUMINAÇÃO</th><th>TOTAL</th></tr></thead><tbody>${(project.environments || []).map((item) => `<tr><td class="project-name">${escapeHtml(item.name)}</td><td>${number(item.quantity)}</td><td class="money-cell">${money(item.marcenaria)}</td><td class="money-cell">${money(item.serralheria)}</td><td class="money-cell">${money(item.vidracaria)}</td><td class="money-cell">${money(item.iluminacao)}</td><td class="money-cell"><strong>${money(item.totalReported)}</strong></td></tr>`).join("")}</tbody></table></div>`;
    return;
  }
  if (selectedModalTab === "alerts") {
    const alerts = project.alerts || [];
    $("#modal-content").innerHTML = alerts.length
      ? `<div class="alert-list">${alerts.map((alert) => `<div class="alert-item ${escapeHtml(alert.severity)}"><i></i><div><strong>${escapeHtml(alert.title)}</strong><span>${escapeHtml(alert.description)}</span><small>${alert.count > 1 ? `${number(alert.count)} ocorrências · ` : ""}${alert.cells?.length ? `Células: ${escapeHtml(alert.cells.join(", "))}` : ""}</small></div><span>${escapeHtml(alert.severity === "error" ? "ERRO" : alert.severity === "warning" ? "ATENÇÃO" : "INFO")}</span></div>`).join("")}</div>`
      : '<div class="commercial-check"><h3>Nenhum alerta encontrado</h3><span>Os componentes e totais do projeto estão coerentes.</span></div>';
    return;
  }
  const comparison = project.commercialComparison;
  if (!comparison) {
    $("#modal-content").innerHTML = '<div class="commercial-check"><h3>Sem correspondência comercial</h3><p>O nome deste projeto ainda não foi relacionado a um cliente da base de vendas. Atualize a planilha comercial ou padronize os nomes para permitir a comparação.</p></div>';
    return;
  }
  $("#modal-content").innerHTML = `<div class="commercial-check"><h3>${escapeHtml(comparison.client)}</h3><div class="comparison-line"><span>Valor encontrado no projeto</span><strong>${money(comparison.projectTotal)}</strong></div><div class="comparison-line"><span>Valor registrado na base comercial</span><strong>${money(comparison.saleTotal)}</strong></div><div class="comparison-line"><span>Diferença</span><strong>${money(comparison.difference)}</strong></div><div class="comparison-result ${comparison.matches ? "" : "warning"}">${comparison.matches ? "✓ Os valores coincidem." : "! Os valores não coincidem e precisam de conferência."}</div></div>`;
}

async function exportProject(projectId = selectedProjectId) {
  if (!projectId) return;
  try {
    const result = await api.exportProjectReport(projectId);
    if (!result.canceled) toast("Relatório salvo", `PDF criado em ${result.filePath}`, "success", 6500);
  } catch (error) {
    toast("Falha ao gerar PDF", error.message, "error", 6500);
  }
}

async function exportSummary() {
  try {
    const result = await api.exportSummaryReport();
    if (!result.canceled) toast("Relatório geral salvo", `PDF criado em ${result.filePath}`, "success", 6500);
  } catch (error) {
    toast("Falha ao gerar relatório", error.message, "error", 6500);
  }
}

function askConfirmation(title, message, acceptLabel = "CONFIRMAR") {
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  $("#confirm-accept").textContent = acceptLabel;
  $("#confirm-dialog").classList.add("open");
  $("#confirm-dialog").setAttribute("aria-hidden", "false");
  return new Promise((resolve) => { confirmResolver = resolve; });
}

function closeConfirmation(result) {
  $("#confirm-dialog").classList.remove("open");
  $("#confirm-dialog").setAttribute("aria-hidden", "true");
  if (confirmResolver) confirmResolver(result);
  confirmResolver = null;
}

function toast(title, message, type = "success", duration = 4200) {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.innerHTML = `<i></i><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  $("#toast-region").append(element);
  setTimeout(() => element.remove(), duration);
}

function setAuthMessage(message = "") {
  const element = $("#auth-message");
  element.hidden = !message;
  element.textContent = message;
}

function showAuthGate(status = {}) {
  appState = { ...appState, auth: status };
  const setup = !status.hasUsers;
  $("#auth-gate").classList.add("open");
  document.body.classList.add("auth-locked");
  $("#auth-setup-form").hidden = !setup;
  $("#auth-login-form").hidden = setup;
  $("#auth-title").textContent = setup ? "Proteger esta instalação" : "Entrar no Rasputim";
  $("#auth-subtitle").textContent = setup
    ? "Cadastre o primeiro responsável geral. Depois, cada colaborador terá sua própria conta e cargo."
    : "Use sua conta pessoal. Cada operação ficará vinculada ao usuário que a realizou.";
  setAuthMessage("");
  setTimeout(() => (setup ? $("#setup-name") : $("#login-user")).focus(), 60);
}

async function connectSharedUsers() {
  const button = $("#connect-shared-users");
  button.disabled = true;
  try {
    const result = await api.connectSharedUserDirectory();
    if (result.canceled) return;
    showAuthGate(result.status);
    setAuthMessage("Base central conectada. Entre com seu usuário e senha.");
  } catch (error) {
    setAuthMessage(error.message || "Não foi possível conectar à base central.");
  } finally { button.disabled = false; }
}

function hideAuthGate() {
  $("#auth-gate").classList.remove("open");
  document.body.classList.remove("auth-locked");
  setAuthMessage("");
}

async function loadAuthenticatedApplication(nextState = null) {
  appState = nextState || await api.getState();
  [appInfo, tavilyCredentials] = await Promise.all([
    api.getAppInfo(),
    api.getTavilyCredentials(),
  ]);
  try { localAiState = await api.getLocalAiStatus(); } catch { localAiState = { online: false, baseUrl: appInfo.localAiUrl || "http://127.0.0.1:8080" }; }
  renderAll();
  hideAuthGate();
  showView(currentView || "pcp");
}

async function submitAccountSetup(event) {
  event.preventDefault();
  const password = $("#setup-password").value;
  if (password !== $("#setup-password-confirm").value) {
    setAuthMessage("As senhas informadas não coincidem.");
    $("#setup-password-confirm").focus();
    return;
  }
  const button = $("#auth-setup-form button[type='submit']");
  button.disabled = true;
  try {
    const next = await api.setupAccount({
      name: $("#setup-name").value,
      login: $("#setup-login").value,
      password,
    });
    $("#setup-password").value = "";
    $("#setup-password-confirm").value = "";
    await loadAuthenticatedApplication(next);
    toast("Acesso protegido", "O responsável geral foi criado. Agora cadastre os demais usuários em Configurações.", "success", 7000);
  } catch (error) {
    setAuthMessage(error.message || "Não foi possível criar o acesso.");
  } finally {
    button.disabled = false;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const button = $("#auth-login-form button[type='submit']");
  button.disabled = true;
  try {
    const next = await api.login({ login: $("#login-user").value, password: $("#login-password").value });
    $("#login-password").value = "";
    await loadAuthenticatedApplication(next);
    toast("Sessão iniciada", `Acesso registrado em nome de ${currentUser()?.name || "usuário"}.`, "success", 4200);
  } catch (error) {
    $("#login-password").value = "";
    setAuthMessage(error.message || "Não foi possível entrar.");
    $("#login-password").focus();
  } finally {
    button.disabled = false;
  }
}

async function logoutUser() {
  try {
    const status = await api.logout();
    showAuthGate(status);
  } catch (error) {
    toast("Não foi possível encerrar a sessão", error.message, "error", 6000);
  }
}

async function enableSharedUsers() {
  try {
    const accepted = await askConfirmation("Centralizar usuários?", "Os logins atuais serão colocados em uma base compartilhada. Nas outras máquinas, use ‘Conectar base central de usuários’ e escolha esta mesma pasta.", "CENTRALIZAR");
    if (!accepted) return;
    const result = await api.enableSharedUserDirectory();
    if (result.canceled) return;
    appState = result.state;
    renderAll();
    toast("Base central ativada", "Agora conecte as demais máquinas à mesma pasta da rede.", "success", 7000);
  } catch (error) { toast("Não foi possível centralizar", error.message, "error", 7000); }
}

async function useLocalUsers() {
  try {
    const accepted = await askConfirmation("Desconectar a base central?", "Esta máquina voltará a usar somente seu cadastro local. A base central e os demais computadores não serão apagados.", "DESCONECTAR");
    if (!accepted) return;
    appState = await api.useLocalUserDirectory();
    renderAll();
  } catch (error) { toast("Não foi possível desconectar", error.message, "error", 7000); }
}

function updateUserRoleDescription() {
  const selected = $("#user-role").value;
  const role = (appState.auth?.roles || []).find((item) => item.id === selected);
  $("#user-role-description").textContent = role?.description || "Selecione o cargo para ver o limite de acesso.";
}

function openUserModal() {
  if (!can("MANAGE_USERS")) {
    toast("Acesso restrito", "Somente o responsável geral pode cadastrar usuários.", "warning", 6000);
    return;
  }
  $("#user-form").reset();
  renderAccessControls();
  $("#user-modal").classList.add("open");
  $("#user-modal").setAttribute("aria-hidden", "false");
  $("#user-name").focus();
}

function closeUserModal() {
  $("#user-modal").classList.remove("open");
  $("#user-modal").setAttribute("aria-hidden", "true");
}

async function submitUser(event) {
  event.preventDefault();
  if ($("#user-password").value !== $("#user-password-confirm").value) {
    toast("Senhas diferentes", "Repita exatamente a mesma senha antes de criar o acesso.", "warning", 6000);
    $("#user-password-confirm").focus();
    return;
  }
  const button = $("#user-form button[type='submit']");
  button.disabled = true;
  try {
    appState = await api.createUser({
      name: $("#user-name").value,
      login: $("#user-login").value,
      role: $("#user-role").value,
      password: $("#user-password").value,
    });
    $("#user-password").value = "";
    $("#user-password-confirm").value = "";
    closeUserModal();
    renderAll();
    toast("Usuário cadastrado", "A conta foi criada. Use o botão ⇄ no topo para testar a entrada sem fechar o sistema.", "success", 7000);
  } catch (error) {
    toast("Não foi possível cadastrar", error.message, "error", 7000);
  } finally {
    button.disabled = false;
  }
}

function openPasswordReset(userId) {
  const user = (appState.auth?.users || []).find((item) => item.id === userId);
  if (!user || !can("MANAGE_USERS")) return;
  passwordResetUserId = user.id;
  $("#password-reset-form").reset();
  $("#password-reset-subtitle").textContent = `Defina uma nova senha para ${user.name} (${user.login}).`;
  $("#password-reset-modal").classList.add("open");
  $("#password-reset-modal").setAttribute("aria-hidden", "false");
  $("#password-reset-value").focus();
}

function closePasswordReset() {
  passwordResetUserId = null;
  $("#password-reset-modal").classList.remove("open");
  $("#password-reset-modal").setAttribute("aria-hidden", "true");
}

async function submitPasswordReset(event) {
  event.preventDefault();
  const password = $("#password-reset-value").value;
  if (password !== $("#password-reset-confirm").value) {
    toast("Senhas diferentes", "Repita exatamente a mesma nova senha.", "warning", 6000);
    $("#password-reset-confirm").focus();
    return;
  }
  if (!passwordResetUserId) return;
  const target = (appState.auth?.users || []).find((item) => item.id === passwordResetUserId);
  const button = $("#password-reset-form button[type='submit']");
  button.disabled = true;
  try {
    appState = await api.resetUserPassword(passwordResetUserId, password);
    closePasswordReset();
    renderAll();
    toast("Senha atualizada", `${target?.name || "Usuário"} já pode entrar com a nova senha.`, "success", 6500);
  } catch (error) {
    toast("Não foi possível redefinir a senha", error.message || "Tente novamente.", "error", 7000);
  } finally {
    button.disabled = false;
  }
}

async function toggleUser(userId) {
  const user = (appState.auth?.users || []).find((item) => item.id === userId);
  if (!user) return;
  const nextActive = !user.active;
  const accepted = await askConfirmation(
    nextActive ? "Ativar usuário?" : "Bloquear usuário?",
    nextActive
      ? `${user.name} poderá entrar novamente com a conta individual.`
      : `${user.name} perderá o acesso imediatamente em todas as sessões abertas.`,
    nextActive ? "ATIVAR" : "BLOQUEAR",
  );
  if (!accepted) return;
  try {
    appState = await api.updateUser(userId, { active: nextActive });
    renderAll();
    toast(nextActive ? "Usuário ativado" : "Usuário bloqueado", `${user.name}: acesso ${nextActive ? "liberado" : "encerrado"}.`, "success");
  } catch (error) {
    toast("Não foi possível atualizar o usuário", error.message, "error", 7000);
  }
}

async function changeUserRole(userId, role) {
  const user = (appState.auth?.users || []).find((item) => item.id === userId);
  const nextRole = (appState.auth?.roles || []).find((item) => item.id === role);
  if (!user || !nextRole || user.role === role) return;
  const accepted = await askConfirmation(
    "Alterar cargo do usuário?",
    `${user.name} passará a usar o cargo “${nextRole.label}”. As permissões serão aplicadas no próximo uso da conta.`,
    "ALTERAR CARGO",
  );
  if (!accepted) {
    renderAccessControls();
    return;
  }
  try {
    appState = await api.updateUser(userId, { role });
    renderAll();
    toast("Cargo atualizado", `${user.name}: ${nextRole.label}.`, "success", 5200);
  } catch (error) {
    renderAccessControls();
    toast("Não foi possível alterar o cargo", error.message, "error", 7000);
  }
}

async function submitToolRegister(event) {
  event.preventDefault();
  if (toolBusy) return;
  if (!can("TOOL_MANAGE")) {
    toast("Cadastro protegido", "Seu cargo não possui permissão para cadastrar ferramentas.", "error", 6500);
    return;
  }
  toolBusy = true;
  const submit = $("#tool-register-submit");
  if (submit) submit.disabled = true;
  try {
    appState = await api.addTool({
      name: $("#tool-name").value,
      category: $("#tool-category").value,
      assetTag: $("#tool-asset-tag").value,
      brandModel: $("#tool-brand-model").value,
      location: $("#tool-location").value,
      notes: $("#tool-notes").value,
    });
    event.currentTarget.reset();
    renderAll();
    toast("Ferramenta cadastrada", "O patrimônio agora aparece no controle de ferramentas.", "success", 4600);
  } catch (error) {
    toast("Não foi possível cadastrar", error.message || "Revise os dados da ferramenta.", "error", 7500);
  } finally {
    toolBusy = false;
    if (submit) submit.disabled = false;
  }
}

async function submitToolCheckout(event) {
  event.preventDefault();
  if (toolBusy) return;
  if (!can("TOOL_REQUEST_WITHDRAWAL")) {
    toast("Retirada protegida", "Seu cargo não possui permissão para solicitar retirada de ferramentas.", "error", 6500);
    return;
  }
  const toolId = $("#tool-checkout-tool").value;
  if (!toolId) {
    toast("Selecione a ferramenta", "Escolha uma ferramenta disponível antes de registrar a saída.", "warning", 5200);
    return;
  }
  const requestedById = $("#tool-checkout-employee").value;
  if (!requestedById) {
    toast("Selecione o funcionário", "Informe quem ficará responsável pela ferramenta retirada.", "warning", 5200);
    return;
  }
  toolBusy = true;
  const submit = $("#tool-checkout-submit");
  if (submit) submit.disabled = true;
  try {
    appState = await api.checkoutTool({
      toolId,
      requestedById,
      purpose: $("#tool-checkout-purpose").value,
      authorizerLogin: $("#tool-authorizer-login").value,
      authorizerPassword: $("#tool-authorizer-password").value,
    });
    event.currentTarget.reset();
    renderAll();
    toast("Saída autorizada", "A retirada foi registrada com funcionário responsável e autorizador separados.", "success", 5200);
  } catch (error) {
    toast("Retirada não registrada", error.message || "A autorização não pôde ser confirmada.", "error", 7800);
  } finally {
    toolBusy = false;
    if (submit) submit.disabled = false;
  }
}

async function returnToolFromUi(toolId) {
  if (toolBusy || !can("TOOL_REGISTER_RETURN")) return;
  const item = (appState.tools?.items || []).find((tool) => tool.id === toolId);
  if (!item) return;
  const accepted = await askConfirmation(
    "Registrar devolução da ferramenta?",
    `${item.name}${item.assetTag ? ` (${item.assetTag})` : ""} voltará a ficar disponível no controle. A devolução ficará vinculada ao seu usuário.`,
    "REGISTRAR DEVOLUÇÃO",
  );
  if (!accepted) return;
  toolBusy = true;
  try {
    appState = await api.returnTool({ toolId });
    renderAll();
    toast("Devolução registrada", `${item.name} voltou a ficar disponível.`, "success", 4600);
  } catch (error) {
    toast("Não foi possível registrar a devolução", error.message || "Tente novamente.", "error", 7500);
  } finally {
    toolBusy = false;
  }
}

async function changeToolStatus(toolId, status) {
  if (toolBusy || !can("TOOL_MANAGE")) return;
  const item = (appState.tools?.items || []).find((tool) => tool.id === toolId);
  if (!item) return;
  const isMaintenance = status === "MANUTENCAO";
  const accepted = await askConfirmation(
    isMaintenance ? "Enviar ferramenta para manutenção?" : "Liberar ferramenta para uso?",
    isMaintenance
      ? `${item.name} ficará bloqueada para novas retiradas até ser liberada.`
      : `${item.name} voltará a aparecer como disponível para retirada.`,
    isMaintenance ? "ENVIAR PARA MANUTENÇÃO" : "LIBERAR FERRAMENTA",
  );
  if (!accepted) return;
  toolBusy = true;
  try {
    appState = await api.setToolStatus(toolId, { status });
    renderAll();
    toast(isMaintenance ? "Ferramenta em manutenção" : "Ferramenta liberada", item.name, "success", 4600);
  } catch (error) {
    toast("Não foi possível alterar a ferramenta", error.message || "Tente novamente.", "error", 7500);
  } finally {
    toolBusy = false;
  }
}

async function removeToolFromUi(toolId) {
  if (toolBusy || !can("TOOL_MANAGE")) return;
  const item = (appState.tools?.items || []).find((tool) => tool.id === toolId);
  if (!item) return;
  const accepted = await askConfirmation(
    "Excluir ferramenta cadastrada?",
    `${item.name}${item.assetTag ? ` (${item.assetTag})` : ""} será removida definitivamente. Esta ação só é permitida quando não há retirada nem histórico de uso.`,
    "EXCLUIR FERRAMENTA",
  );
  if (!accepted) return;
  toolBusy = true;
  try {
    appState = await api.removeTool(toolId);
    renderAll();
    toast("Ferramenta excluída", `${item.name} foi removida do cadastro.`, "success", 4600);
  } catch (error) {
    toast("Não foi possível excluir", error.message || "Tente novamente.", "error", 7500);
  } finally {
    toolBusy = false;
  }
}

function bindEvents() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => showView(item.dataset.view)));
  document.addEventListener("click", (event) => {
    const goView = event.target.closest("[data-go-view]");
    if (goView) showView(goView.dataset.goView);
    const openButton = event.target.closest("[data-open-project]");
    if (openButton) openProject(openButton.dataset.openProject);
    const openPcpButton = event.target.closest("[data-open-pcp]");
    if (openPcpButton) openPcpDetail(openPcpButton.dataset.openPcp);
    const exportButton = event.target.closest("[data-export-project]");
    if (exportButton) exportProject(exportButton.dataset.exportProject);
    const invoiceButton = event.target.closest("[data-invoice]");
    if (invoiceButton) confirmInvoice(invoiceButton.dataset.invoice);
    const movementButton = event.target.closest("[data-movement-code]");
    if (movementButton) openMovementModal(movementButton.dataset.movementCode);
    const quotationButton = event.target.closest("[data-add-quote]");
    if (quotationButton) openQuotationModal(quotationButton.dataset.addQuote);
    const marketButton = event.target.closest("[data-market-search]");
    if (marketButton) openMarketResearch(marketButton.dataset.marketSearch);
    const linkButton = event.target.closest("[data-open-url]");
    if (linkButton) openExternal(linkButton.dataset.openUrl, linkButton.dataset.openPurpose, linkButton.dataset.supplierName);
    const copyPhoneButton = event.target.closest("[data-copy-phone]");
    if (copyPhoneButton) copyMarketPhone(copyPhoneButton.dataset.copyPhone);
    const toggleUserButton = event.target.closest("[data-toggle-user]");
    if (toggleUserButton) toggleUser(toggleUserButton.dataset.toggleUser);
    const returnToolButton = event.target.closest("[data-return-tool]");
    if (returnToolButton) returnToolFromUi(returnToolButton.dataset.returnTool);
    const toolStatusButton = event.target.closest("[data-tool-status]");
    if (toolStatusButton) changeToolStatus(toolStatusButton.dataset.toolStatus, toolStatusButton.dataset.nextToolStatus);
    const removeToolButton = event.target.closest("[data-remove-tool]");
    if (removeToolButton) removeToolFromUi(removeToolButton.dataset.removeTool);
    const resetPasswordButton = event.target.closest("[data-reset-user-password]");
    if (resetPasswordButton) openPasswordReset(resetPasswordButton.dataset.resetUserPassword);
    const marketUseButton = event.target.closest("[data-market-use]");
    if (marketUseButton && currentMarketSearch) {
      const marketResult = currentMarketSearch.results.find((item) => item.id === marketUseButton.dataset.marketUse);
      if (marketResult) {
        closeMarketModal();
        openQuotationModal(currentMarketSearch.materialCode, marketResult);
      }
    }
    if (event.target.closest("#go-market-settings")) {
      closeMarketModal();
      showView("settings");
    }
    if (event.target.closest("[data-close-movement]")) closeMovementModal();
    if (event.target.closest("[data-close-material]")) closeMaterialModal();
    if (event.target.closest("[data-close-quotation]")) closeQuotationModal();
    if (event.target.closest("[data-close-market]")) closeMarketModal();
    if (event.target.closest("[data-close-pcp-project]")) closePcpProjectModal();
    if (event.target.closest("[data-close-pcp-detail]")) closePcpDetail();
    if (event.target.closest("[data-close-pcp-network]")) closePcpNetworkModal();
    if (event.target.closest("[data-close-user-modal]")) closeUserModal();
    if (event.target.closest("[data-close-password-reset]")) closePasswordReset();
    if (event.target.closest("[data-close-modal]")) closeProjectModal();
  });
  document.addEventListener("change", (event) => {
    const roleSelect = event.target.closest("[data-user-role]");
    if (roleSelect) changeUserRole(roleSelect.dataset.userRole, roleSelect.value);
  });
  $("#auth-setup-form").addEventListener("submit", submitAccountSetup);
  $("#auth-login-form").addEventListener("submit", submitLogin);
  $("#connect-shared-users").addEventListener("click", connectSharedUsers);
  $("#logout-user").addEventListener("click", logoutUser);
  $("#select-project-dashboard").addEventListener("click", chooseAndAnalyzeProjects);
  $("#select-project-projects").addEventListener("click", chooseAndAnalyzeProjects);
  $("#project-search").addEventListener("input", renderProjects);
  $("#import-sales").addEventListener("click", importSalesFile);
  $("#pcp-new-project").addEventListener("click", () => openPcpProjectModal());
  $("#pcp-project-form").addEventListener("submit", submitPcpProject);
  $("#pcp-search").addEventListener("input", renderPcp);
  $("#pcp-stage-filter").addEventListener("change", renderPcp);
  $("#pcp-priority-filter").addEventListener("change", renderPcp);
  $("#pcp-refresh").addEventListener("click", refreshPcp);
  $("#pcp-open-network").addEventListener("click", openPcpNetworkModal);
  $("#pcp-edit-project").addEventListener("click", () => {
    const project = pcpProjectById();
    if (!project) return;
    closePcpDetail();
    openPcpProjectModal(project);
  });
  $("#pcp-previous-stage").addEventListener("click", () => movePcpProject("PREVIOUS"));
  $("#pcp-next-stage").addEventListener("click", () => movePcpProject("NEXT"));
  $("#pcp-toggle-block").addEventListener("click", togglePcpBlock);
  $("#pcp-archive-project").addEventListener("click", archivePcpSelectedProject);
  $("#pcp-select-shared").addEventListener("click", selectPcpSharedDirectory);
  $("#pcp-use-local").addEventListener("click", useLocalPcp);
  $("#pcp-save-station").addEventListener("click", savePcpStation);
  $("#import-stock").addEventListener("click", () => importStockFile());
  $("#select-stock-count").addEventListener("click", () => importStockFile());
  $("#stock-import-mode").addEventListener("change", async () => {
    if (!currentStockImportPreview) return;
    await cancelStockImport();
    toast("Modo alterado", "Selecione novamente a planilha para gerar uma prévia correspondente ao novo modo.", "warning", 5000);
  });
  $("#cancel-stock-count").addEventListener("click", cancelStockImport);
  $("#apply-stock-count").addEventListener("click", applyStockImportPreview);
  $("#open-movement").addEventListener("click", () => openMovementModal());
  $("#open-material").addEventListener("click", openMaterialModal);
  $("#stock-search").addEventListener("input", renderProcurement);
  $$("[data-procurement-tab]").forEach((button) => button.addEventListener("click", () => showProcurementTab(button.dataset.procurementTab)));
  $("#movement-form").addEventListener("submit", submitMovement);
  $("#material-form").addEventListener("submit", submitMaterial);
  $("#movement-material").addEventListener("change", updateMovementBalance);
  $("#movement-type").addEventListener("change", updateMovementAuthorization);
  $("#tools-search").addEventListener("input", renderTools);
  $("#tool-register-form").addEventListener("submit", submitToolRegister);
  $("#tool-checkout-form").addEventListener("submit", submitToolCheckout);
  $("#quotation-form").addEventListener("submit", submitQuotation);
  $("#quotation-supplier").addEventListener("change", updateQuotationSupplier);
  $("#market-run").addEventListener("click", runMarketResearch);
  $("#market-radius").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runMarketResearch();
    }
  });
  $("#export-summary").addEventListener("click", exportSummary);
  $("#ai-refresh").addEventListener("click", () => refreshLocalAiStatus());
  $("#ai-chat-form").addEventListener("submit", submitAiPrompt);
  $("#ai-prompt").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) { event.preventDefault(); submitAiPrompt(event); }
  });
  $("#test-market-api-key").addEventListener("click", testMarketApiKey);
  $("#save-market-api-key").addEventListener("click", saveMarketApiKey);
  $("#remove-market-api-key").addEventListener("click", removeMarketApiKey);
  $("#open-user-modal").addEventListener("click", openUserModal);
  $("#enable-shared-users").addEventListener("click", enableSharedUsers);
  $("#use-local-users").addEventListener("click", useLocalUsers);
  $("#user-form").addEventListener("submit", submitUser);
  $("#password-reset-form").addEventListener("submit", submitPasswordReset);
  $("#user-role").addEventListener("change", updateUserRoleDescription);
  $("#market-api-key").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      testMarketApiKey();
    }
  });
  $("#modal-export-report").addEventListener("click", () => exportProject());
  $("#modal-reveal-file").addEventListener("click", async () => {
    if (!selectedProjectId) return;
    const result = await api.revealProject(selectedProjectId);
    if (!result.ok) toast("Arquivo original indisponível", result.message, "warning");
  });
  $("#modal-delete-project").addEventListener("click", async () => {
    if (!selectedProjectId) return;
    const project = appState.projects.find((item) => item.id === selectedProjectId);
    const accepted = await askConfirmation("Excluir projeto do histórico?", `${project?.name || "Este projeto"} será removido do Rasputim. A planilha original não será apagada.`, "EXCLUIR");
    if (!accepted) return;
    appState = await api.removeProject(selectedProjectId);
    closeProjectModal();
    renderAll();
    toast("Projeto removido", "Somente o registro interno foi excluído; o arquivo original foi preservado.", "success");
  });
  $$(".modal-tabs button").forEach((button) => button.addEventListener("click", () => {
    selectedModalTab = button.dataset.modalTab;
    $$(".modal-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    const project = appState.projects.find((item) => item.id === selectedProjectId);
    if (project) renderModalContent(project);
  }));

  $("#clear-data").addEventListener("click", async () => {
    const accepted = await askConfirmation("Limpar todos os dados locais?", "Projetos analisados, clientes e histórico serão removidos do aplicativo. Os arquivos originais permanecerão intactos.", "LIMPAR DADOS");
    if (!accepted) return;
    appState = await api.clearState();
    renderAll();
    toast("Histórico limpo", "O Rasputim está pronto para receber uma nova base.", "success");
  });
  $("#restore-demo").addEventListener("click", async () => {
    const accepted = await askConfirmation("Restaurar a base inicial?", "Os três projetos de validação e os seis clientes fechados voltarão ao painel. O histórico atual será substituído.", "RESTAURAR");
    if (!accepted) return;
    appState = await api.restoreDemo();
    renderAll();
    toast("Base inicial restaurada", "Projetos pequeno, médio e grande voltaram ao painel.", "success");
  });
  $("#confirm-cancel").addEventListener("click", () => closeConfirmation(false));
  $("#confirm-accept").addEventListener("click", () => closeConfirmation(true));

  const dropZone = $("#drop-zone");
  ["dragenter", "dragover"].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); event.stopPropagation(); dropZone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); event.stopPropagation(); dropZone.classList.remove("dragging"); }));
  dropZone.addEventListener("drop", (event) => {
    const paths = [...event.dataTransfer.files].map((file) => api.pathForFile(file)).filter(Boolean);
    if (paths.length) runProjectAnalysis(paths);
  });
  dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") chooseAndAnalyzeProjects(); });

  const stockDropZone = $("#stock-drop-zone");
  ["dragenter", "dragover"].forEach((type) => stockDropZone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    stockDropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((type) => stockDropZone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    stockDropZone.classList.remove("dragging");
  }));
  stockDropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files?.[0];
    const filePath = file ? api.pathForFile(file) : "";
    if (filePath) importStockFile(filePath);
  });
  stockDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") importStockFile();
  });

  $("#minimize-window").addEventListener("click", () => api.minimize());
  $("#maximize-window").addEventListener("click", () => api.toggleMaximize());
  $("#close-window").addEventListener("click", () => api.close());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if ($("#confirm-dialog").classList.contains("open")) closeConfirmation(false);
      else if ($("#movement-modal").classList.contains("open")) closeMovementModal();
      else if ($("#material-modal").classList.contains("open")) closeMaterialModal();
      else if ($("#quotation-modal").classList.contains("open")) closeQuotationModal();
      else if ($("#market-modal").classList.contains("open")) closeMarketModal();
      else if ($("#pcp-network-modal").classList.contains("open")) closePcpNetworkModal();
      else if ($("#user-modal").classList.contains("open")) closeUserModal();
      else if ($("#password-reset-modal").classList.contains("open")) closePasswordReset();
      else if ($("#pcp-project-modal").classList.contains("open")) closePcpProjectModal();
      else if ($("#pcp-detail-modal").classList.contains("open")) closePcpDetail();
      else if ($("#project-modal").classList.contains("open")) closeProjectModal();
    }
  });
}

async function initialize() {
  bindEvents();
  resetAnalysisVisual();
  try {
    const status = await api.authStatus();
    if (status.authenticated) await loadAuthenticatedApplication();
    else showAuthGate(status);
    api.onPcpChanged((nextState) => {
      if (!nextState?.auth?.authenticated) {
        showAuthGate(nextState?.auth || {});
        return;
      }
      const previousRevision = Number(appState.pcp?.revision || 0);
      const nextRevision = Number(nextState?.pcp?.revision || 0);
      appState = nextState;
      renderAll();
      if ($("#pcp-detail-modal").classList.contains("open")) renderPcpDetail();
      if ($("#pcp-network-modal").classList.contains("open")) renderPcpNetworkModal();
      if (nextRevision > previousRevision && appState.pcpConnection?.mode === "SHARED") {
        toast("PCP atualizado por outra estação", "O quadro recebeu a movimentação mais recente da rede.", "success", 3200);
      }
    });
    authPollTimer = setInterval(async () => {
      try {
        const next = await api.authStatus();
        if (!next.authenticated && !$("#auth-gate").classList.contains("open")) showAuthGate(next);
      } catch {
        // A próxima ação do operador exibirá o erro local com mais detalhes.
      }
    }, 30000);
  } catch (error) {
    toast("Falha ao iniciar o sistema", error.message || "Reabra o aplicativo.", "error", 8000);
  }
}

initialize();
