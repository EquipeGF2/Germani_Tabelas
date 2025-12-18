const state = {
  apiBase: "",
  empresas: [],
  empresaSelecionada: null,
  apiStatus: "loading",
  apiStatusDetalhe: "",
  produtos: [],
  ncm: [],
  st: [],
  custos: [],
  pauta: [],
  destinos: [],
  tabsCarregados: new Set(),
};

const dom = (id) => document.getElementById(id);

function setStatus(msg, isError = false) {
  const el = dom("statusBar");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b30f1f" : "#6b7280";
}

function setGateMensagem(msg = "", isError = false) {
  const el = dom("empresaGateMensagem");
  if (!el) return;
  el.textContent = msg;
  el.className = `badge ${isError ? "error" : "warn"}`;
}

function setApiStatus(status = "ok", detalhe = "") {
  state.apiStatus = status;
  state.apiStatusDetalhe = detalhe || "";
  const badge = dom("apiStatusBadge");
  const btn = dom("apiStatusDetalhes");
  if (!badge) return;

  const config = {
    ok: { texto: "API OK", classe: "badge ok" },
    error: { texto: "API indisponível", classe: "badge error" },
    loading: { texto: "Sincronizando API...", classe: "badge loading" },
  };

  const alvo = config[status] || config.loading;
  badge.textContent = alvo.texto;
  badge.className = alvo.classe;

  if (btn) {
    if (status === "error" && detalhe) {
      btn.style.display = "inline-flex";
      btn.dataset.detalhe = detalhe;
    } else {
      btn.style.display = "none";
      btn.dataset.detalhe = "";
    }
  }
}

function atualizarEmpresaAtivaLabel() {
  const alvo = dom("empresaAtivaNome");
  if (!alvo) return;
  alvo.textContent = state.empresaSelecionada?.nome || "Nenhuma selecionada";
}

function normalizeBaseUrl(valor) {
  let v = (valor || "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/^http:\/\//i, "https://");
  return v.replace(/\/$/, "");
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  if (payload?.empresas && Array.isArray(payload.empresas)) return payload.empresas;
  return [];
}

function getApiBaseUrl() {
  const vindoDoConfig = normalizeBaseUrl(window.APP_CONFIG?.API_BASE_URL || "");
  state.apiBase = vindoDoConfig;
  return vindoDoConfig;
}

function applyTema(temaJson) {
  if (!temaJson) return;
  try {
    const tema = typeof temaJson === "string" ? JSON.parse(temaJson) : temaJson;
    if (tema?.primaria) {
      document.documentElement.style.setProperty("--brand", tema.primaria);
      document.documentElement.style.setProperty("--brand-dark", tema.primaria);
    }
    if (tema?.texto) document.documentElement.style.setProperty("--cor-texto", tema.texto);
  } catch (e) {
    console.warn("Tema inválido", e);
  }
}

async function api(path, options = {}) {
  const base = getApiBaseUrl();
  if (!base) throw new Error("URL base da API não configurada em window.APP_CONFIG.");
  const urlBase = base.replace(/\/$/, "");
  let res;
  try {
    res = await fetch(`${urlBase}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    console.error(err);
    setApiStatus("error", "Não foi possível conectar à API. Confira a rede ou o Worker.");
    throw new Error("API indisponível no momento.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detalhe = body?.details || body?.error || `Erro ${res.status}`;
    if (body?.error === "DB_ERROR") setApiStatus("error", detalhe);
    const mensagem = body?.error === "DB_ERROR" ? "API indisponível" : (body?.error || "Falha na API");
    const erro = new Error(mensagem);
    erro.details = detalhe;
    throw erro;
  }
  setApiStatus("ok");
  return res.json();
}

function empresaObrigatoria() {
  if (!state.empresaSelecionada) {
    abrirGate();
    setStatus("Selecione uma empresa para continuar.", true);
    return false;
  }
  return true;
}

async function carregarEmpresasGate() {
  setGateMensagem("Carregando empresas...");
  const wrap = dom("empresaGateLista");
  if (wrap) wrap.innerHTML = "";
  try {
    const data = await api(`/v1/empresas`);
    const empresas = normalizeItems(data);
    state.empresas = empresas;
    renderEmpresasGate(empresas);
    renderEmpresasTab();
    setGateMensagem(empresas.length ? "" : "Nenhuma empresa cadastrada ainda.");
    setStatus(empresas.length ? "Selecione uma empresa para continuar." : "Nenhuma empresa cadastrada ainda.");
  } catch (err) {
    console.error(err);
    const detalhe = err?.details || err?.message || "Erro ao carregar empresas";
    setGateMensagem("API indisponível para listar empresas.", true);
    setStatus("Não foi possível listar empresas agora.", true);
    setApiStatus("error", detalhe);
  }
}

function renderEmpresasGate(empresas) {
  const wrap = dom("empresaGateLista");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!empresas.length) {
    wrap.innerHTML = '<div class="notice">Nenhuma empresa cadastrada ainda.</div>';
    return;
  }
  empresas.forEach((empresa) => {
    const card = document.createElement("div");
    card.className = `card selectable ${state.empresaSelecionada?.id === empresa.id ? "selected" : ""}`;
    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        ${empresa.logo_url ? `<img src="${empresa.logo_url}" alt="logo" style="width:40px;height:40px;object-fit:contain;" />` : ""}
        <div>
          <div><strong>${empresa.nome}</strong></div>
          <small class="muted">${empresa.id}</small>
        </div>
      </div>
      <button class="button btn-primary" type="button">Selecionar</button>
    `;
    card.querySelector("button").onclick = () => selecionarEmpresa(empresa.id);
    wrap.appendChild(card);
  });
}

function renderEmpresasTab() {
  const wrap = dom("empresasGrid");
  if (!wrap) return;
  wrap.innerHTML = "";
  state.empresas.forEach((empresa) => {
    const card = document.createElement("div");
    card.className = `card selectable ${state.empresaSelecionada?.id === empresa.id ? "selected" : ""}`;
    card.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;">
        ${empresa.logo_url ? `<img src="${empresa.logo_url}" alt="logo" style="width:40px;height:40px;object-fit:contain;" />` : ""}
        <div>
          <div><strong>${empresa.nome}</strong></div>
          <small class="muted">Clique para ativar</small>
        </div>
      </div>
    `;
    card.onclick = () => selecionarEmpresa(empresa.id);
    wrap.appendChild(card);
  });
}

async function selecionarEmpresa(id) {
  const empresa = state.empresas.find((e) => e.id === id);
  if (!empresa) return;
  state.empresaSelecionada = empresa;
  localStorage.setItem("empresaSelecionada", id);
  applyTema(empresa.tema_json);
  setGateMensagem("");
  fecharGate();
  setStatus(`Empresa ativa: ${empresa.nome}`);
  atualizarEmpresaAtivaLabel();
  state.tabsCarregados.clear();
  const ativa = document.querySelector(".tab-link.active")?.dataset.tabTarget;
  if (ativa) await carregarTab(ativa);
}

async function salvarEmpresa(formId = "empresaForm", { autoSelecionar = false } = {}) {
  const inputId = formId === "empresaGateForm" ? "empresaNomeGate" : "empresaNome";
  const nomeEl = dom(inputId);
  const nome = nomeEl?.value.trim();
  if (!nome) return setStatus("Informe o nome da empresa.", true);
  try {
    const created = await api(`/v1/empresas`, { method: "POST", body: JSON.stringify({ nome }) });
    if (nomeEl) nomeEl.value = "";
    setStatus("Empresa criada.");
    await carregarEmpresasGate();
    if (autoSelecionar && created?.id) {
      await selecionarEmpresa(created.id);
    }
  } catch (err) {
    setStatus(err.message, true);
    if (formId === "empresaGateForm") setGateMensagem(err.message, true);
    throw err;
  }
}

function restaurarEmpresaSelecionada() {
  const saved = localStorage.getItem("empresaSelecionada");
  if (!saved) return;
  const empresa = state.empresas.find((e) => e.id === saved);
  if (empresa) {
    state.empresaSelecionada = empresa;
    applyTema(empresa.tema_json);
    fecharGate();
    setStatus(`Empresa ativa: ${empresa.nome}`);
    atualizarEmpresaAtivaLabel();
  }
}

function bloquearTabs(bloquear = true) {
  document.querySelectorAll(".tab-link").forEach((btn) => {
    btn.disabled = bloquear;
    btn.setAttribute("aria-disabled", bloquear ? "true" : "false");
  });
}

function abrirGate() {
  document.body.classList.add("gate-open");
  bloquearTabs(true);
}

function fecharGate() {
  document.body.classList.remove("gate-open");
  bloquearTabs(false);
}

async function carregarProdutos() {
  if (!empresaObrigatoria()) return;
  const data = await api(`/v1/produtos?empresa_id=${state.empresaSelecionada.id}`);
  state.produtos = data.produtos || [];
  renderProdutos();
}

function preencherProdutoForm(prod = null) {
  const fields = ["produtoId","produtoSku","produtoDesc","produtoUnd","produtoFamilia","produtoGrupo","produtoPallet","produtoPalletCaixas","produtoEAN13","produtoEAN14","produtoPeso","produtoApresentacao","produtoCubagem","produtoPesoLiq","produtoPesoBruto","produtoCategoriaPreco"];
  fields.forEach((f) => { dom(f).value = prod ? (prod[mapeiaForm(f)] ?? "") : ""; });
  dom("produtoAtivo").checked = prod ? prod.ativo === 1 || prod.ativo === true : true;
  dom("produtoRef").checked = prod ? prod.ref_familia === 1 : false;
}

function mapeiaForm(id) {
  const map = {
    produtoSku: "sku",
    produtoDesc: "descricao",
    produtoUnd: "unidade",
    produtoFamilia: "familia",
    produtoGrupo: "grupo_preco",
    produtoPallet: "pallet",
    produtoPalletCaixas: "pallet_caixas",
    produtoEAN13: "ean13",
    produtoEAN14: "ean14_caixa",
    produtoAtivo: "ativo",
    produtoRef: "ref_familia",
    produtoPeso: "peso_kg",
    produtoApresentacao: "apresentacao",
    produtoCubagem: "cubagem_m3",
    produtoPesoLiq: "peso_liq_kg",
    produtoPesoBruto: "peso_bruto_kg",
    produtoCategoriaPreco: "categoria_preco_base",
  };
  return map[id] || id;
}

async function salvarProduto() {
  if (!empresaObrigatoria()) return;
  const payload = {
    empresa_id: state.empresaSelecionada.id,
    sku: dom("produtoSku").value.trim(),
    descricao: dom("produtoDesc").value.trim(),
    unidade: dom("produtoUnd").value.trim() || "UN",
    familia: dom("produtoFamilia").value || null,
    grupo_preco: Number(dom("produtoGrupo").value) || 1,
    pallet: dom("produtoPallet").value || null,
    pallet_caixas: Number(dom("produtoPalletCaixas").value) || null,
    ean13: dom("produtoEAN13").value || null,
    ean14_caixa: dom("produtoEAN14").value || null,
    ativo: dom("produtoAtivo").checked ? 1 : 0,
    ref_familia: dom("produtoRef").checked ? 1 : 0,
    peso_kg: Number(dom("produtoPeso").value) || null,
    apresentacao: dom("produtoApresentacao").value || null,
    cubagem_m3: Number(dom("produtoCubagem").value) || null,
    peso_liq_kg: Number(dom("produtoPesoLiq").value) || null,
    peso_bruto_kg: Number(dom("produtoPesoBruto").value) || null,
    categoria_preco_base: dom("produtoCategoriaPreco").value || null,
  };
  const id = dom("produtoId").value;
  if (id) {
    await api(`/v1/produtos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setStatus("Produto atualizado.");
  } else {
    await api(`/v1/produtos`, { method: "POST", body: JSON.stringify(payload) });
    setStatus("Produto criado.");
  }
  preencherProdutoForm();
  await carregarProdutos();
}

function renderProdutos() {
  const tbody = dom("produtosBody");
  tbody.innerHTML = "";
  const lista = dom("produtosLista");
  if (lista) lista.innerHTML = "";
  state.produtos.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.sku}</td><td>${p.descricao}</td><td>${p.unidade}</td><td>${p.pallet || "-"}</td><td>${p.pallet_caixas || "-"}</td>`;
    tr.onclick = () => preencherProdutoForm(p);
    tbody.appendChild(tr);
    if (lista) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.label = `${p.sku} - ${p.descricao}`;
      lista.appendChild(opt);
    }
  });
}

async function importarProdutos() {
  if (!empresaObrigatoria()) return;
  const template = dom("templateSelect").value;
  const texto = dom("importArea").value.trim();
  if (!texto) return setStatus("Cole dados para importar.", true);
  const linhas = texto.split(/\n+/).map((l) => l.split(/;|,/)).filter((l) => l.some(Boolean));
  const cabecalho = linhas.shift();
  const rows = linhas.map((cols) => {
    const obj = {};
    cabecalho.forEach((c, idx) => { obj[c.trim()] = cols[idx]; });
    return obj;
  });
  try {
    const resp = await api(`/v1/produtos/bulk`, { method: "POST", body: JSON.stringify({ empresa_id: state.empresaSelecionada.id, template, rows }) });
    setStatus(`Importação finalizada. Inseridos: ${resp.inseridos}, Atualizados: ${resp.atualizados}`);
    const feedback = dom("importFeedback");
    if (feedback) {
      const erros = Array.isArray(resp.erros) ? resp.erros : [];
      feedback.style.display = "block";
      if (erros.length) {
        const linhasErro = erros.map((e) => `<li>Linha ${e.linha}: ${e.erro}</li>`).join("");
        feedback.innerHTML = `<strong>Erros encontrados:</strong><ul>${linhasErro}</ul>`;
      } else {
        feedback.textContent = "Importação concluída sem erros.";
      }
    }
    await carregarProdutos();
  } catch (err) {
    const detalhe = err?.details || err?.message || "Falha ao importar";
    setStatus("Falha na importação.", true);
    const feedback = dom("importFeedback");
    if (feedback) {
      feedback.style.display = "block";
      feedback.textContent = detalhe;
    }
  }
}

async function carregarNcm() {
  if (!empresaObrigatoria()) return;
  const data = await api(`/v1/ncm?empresa_id=${state.empresaSelecionada.id}`);
  state.ncm = data.categorias || [];
  const list = dom("ncmList");
  list.innerHTML = "";
  state.ncm.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = `${c.nome} (${c.ncm})`;
    list.appendChild(li);
  });
}

async function salvarNcm() {
  if (!empresaObrigatoria()) return;
  const payload = { empresa_id: state.empresaSelecionada.id, nome: dom("ncmNome").value.trim(), ncm: dom("ncmCodigo").value.trim() };
  await api(`/v1/ncm`, { method: "POST", body: JSON.stringify(payload) });
  dom("ncmNome").value = "";
  dom("ncmCodigo").value = "";
  setStatus("NCM cadastrada.");
  await carregarNcm();
}

async function seedNcm() {
  if (!empresaObrigatoria()) return;
  await api(`/v1/ncm/bulk`, { method: "POST", body: JSON.stringify({ empresa_id: state.empresaSelecionada.id }) });
  setStatus("Categorias padrão carregadas.");
  await carregarNcm();
}

async function carregarDestinos() {
  const data = await api(`/v1/destinos`);
  state.destinos = data.destinos || [];
  renderDestinosSelect();
}

function renderDestinosSelect() {
  const selects = ["stDestino","custoDestino","pautaDestino"];
  selects.forEach((id) => {
    const el = dom(id);
    if (!el) return;
    el.innerHTML = state.destinos.map((d) => `<option value="${d.codigo}">${d.codigo} - ${d.descricao}</option>`).join("");
  });
}

async function carregarSt() {
  if (!empresaObrigatoria()) return;
  const dest = dom("stDestino").value;
  const op = dom("stOperacao").value;
  const data = await api(`/v1/st?empresa_id=${state.empresaSelecionada.id}&destino=${dest}&operacao=${op}`);
  state.st = data.regras || [];
  const tbody = dom("stBody");
  tbody.innerHTML = "";
  state.st.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.destino_codigo}</td><td>${r.operacao}</td><td>${r.tem_st ? "Sim" : "Não"}</td>`;
    tr.onclick = () => preencherStForm(r);
    tbody.appendChild(tr);
  });
}

function preencherStForm(r = null) {
  dom("stId").value = r?.id || "";
  dom("stDestino").value = r?.destino_codigo || dom("stDestino").value;
  dom("stOperacao").value = r?.operacao || "INTERNA";
  dom("stTem").checked = r?.tem_st ? true : false;
  dom("stVariantes").value = r?.variantes_json || "";
  dom("stParametros").value = r?.parametros_json || "";
}

async function salvarSt() {
  if (!empresaObrigatoria()) return;
  const payload = {
    empresa_id: state.empresaSelecionada.id,
    destino_codigo: dom("stDestino").value,
    operacao: dom("stOperacao").value,
    tem_st: dom("stTem").checked ? 1 : 0,
    variantes_json: jsonParseSafe(dom("stVariantes").value),
    parametros_json: jsonParseSafe(dom("stParametros").value),
    ativo: 1,
  };
  const id = dom("stId").value;
  if (id) {
    await api(`/v1/st/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setStatus("Regra de ST atualizada.");
  } else {
    await api(`/v1/st`, { method: "POST", body: JSON.stringify(payload) });
    setStatus("Regra de ST criada.");
  }
  preencherStForm();
  await carregarSt();
}

async function carregarCustos() {
  if (!empresaObrigatoria()) return;
  const dest = dom("custoDestino").value;
  const op = dom("custoOperacao").value;
  const data = await api(`/v1/custos-logisticos?empresa_id=${state.empresaSelecionada.id}&destino=${dest}&operacao=${op}`);
  state.custos = data.custos || [];
  const tbody = dom("custoBody");
  tbody.innerHTML = "";
  state.custos.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${c.destino_codigo}</td><td>${c.tipo_custo}</td><td>${c.valor}</td><td>${c.unidade_cobranca}</td>`;
    tr.onclick = () => preencherCustoForm(c);
    tbody.appendChild(tr);
  });
}

function preencherCustoForm(c = null) {
  dom("custoId").value = c?.id || "";
  dom("custoDestino").value = c?.destino_codigo || dom("custoDestino").value;
  dom("custoOperacao").value = c?.operacao || "INTERNA";
  dom("custoTipo").value = c?.tipo_custo || "PALETIZACAO";
  dom("custoValor").value = c?.valor || "";
  dom("custoUnidade").value = c?.unidade_cobranca || "POR_PALLET";
  dom("custoFiltro").value = c?.aplica_em_json || "";
}

async function salvarCusto() {
  if (!empresaObrigatoria()) return;
  const payload = {
    empresa_id: state.empresaSelecionada.id,
    destino_codigo: dom("custoDestino").value,
    operacao: dom("custoOperacao").value,
    tipo_custo: dom("custoTipo").value,
    valor: Number(dom("custoValor").value || 0),
    unidade_cobranca: dom("custoUnidade").value,
    aplica_em_json: jsonParseSafe(dom("custoFiltro").value),
    ativo: 1,
  };
  const id = dom("custoId").value;
  if (id) {
    await api(`/v1/custos-logisticos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setStatus("Custo atualizado.");
  } else {
    await api(`/v1/custos-logisticos`, { method: "POST", body: JSON.stringify(payload) });
    setStatus("Custo criado.");
  }
  preencherCustoForm();
  await carregarCustos();
}

async function carregarPauta() {
  if (!empresaObrigatoria()) return;
  const dest = dom("pautaDestino").value;
  const op = dom("pautaOperacao").value;
  const data = await api(`/v1/pauta-itens?empresa_id=${state.empresaSelecionada.id}&destino=${dest}&operacao=${op}`);
  state.pauta = data.itens || [];
  const tbody = dom("pautaBody");
  tbody.innerHTML = "";
  state.pauta.forEach((i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i.sku}</td><td>${i.pauta_tipo}</td><td>${i.pauta_preco ?? i.pauta_percentual ?? "-"}</td>`;
    tr.onclick = () => preencherPautaForm(i);
    tbody.appendChild(tr);
  });
}

function preencherPautaForm(i = null) {
  dom("pautaId").value = i?.id || "";
  dom("pautaDestino").value = i?.destino_codigo || dom("pautaDestino").value;
  dom("pautaOperacao").value = i?.operacao || "INTERNA";
  dom("pautaProduto").value = i?.produto_id || "";
  dom("pautaTipo").value = i?.pauta_tipo || "PRECO";
  dom("pautaPreco").value = i?.pauta_preco || "";
  dom("pautaPercentual").value = i?.pauta_percentual || "";
  dom("pautaAplicacao").value = i?.percentual_aplicacao || "";
  dom("pautaMva").value = i?.mva_pct || "";
  dom("pautaAliquota").value = i?.aliquota_pct || "";
}

async function salvarPauta() {
  if (!empresaObrigatoria()) return;
  const payload = {
    empresa_id: state.empresaSelecionada.id,
    destino_codigo: dom("pautaDestino").value,
    operacao: dom("pautaOperacao").value,
    produto_id: dom("pautaProduto").value,
    pauta_tipo: dom("pautaTipo").value,
    pauta_preco: Number(dom("pautaPreco").value) || null,
    pauta_percentual: Number(dom("pautaPercentual").value) || null,
    percentual_aplicacao: Number(dom("pautaAplicacao").value) || null,
    mva_pct: Number(dom("pautaMva").value) || null,
    aliquota_pct: Number(dom("pautaAliquota").value) || null,
    ativo: 1,
  };
  const id = dom("pautaId").value;
  if (id) {
    await api(`/v1/pauta-itens/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setStatus("Pauta atualizada.");
  } else {
    await api(`/v1/pauta-itens`, { method: "POST", body: JSON.stringify(payload) });
    setStatus("Pauta criada.");
  }
  preencherPautaForm();
  await carregarPauta();
}

function simularFormula() {
  const precoTabela = Number(dom("simPreco").value) || 0;
  const mva = Number(dom("simMva").value) || 0;
  const aliquota = Number(dom("simAliq").value) || 0;
  const pauta = Math.max(0, precoTabela * (mva / 100) * (aliquota / 100));
  dom("simResultado").textContent = pauta.toFixed(2);
}

function jsonParseSafe(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { setStatus("JSON inválido, usando vazio.", true); return null; }
}

function bindAjudaButtons() {
  document.querySelectorAll("[data-ajuda]").forEach((btn) => {
    btn.addEventListener("click", () => abrirAjuda(btn.dataset.ajuda));
  });
}

async function abrirAjuda(slug) {
  const backdrop = dom("ajudaModal");
  const content = dom("ajudaConteudo");
  backdrop.style.display = "flex";
  content.innerHTML = "Carregando...";
  try {
    const res = await fetch(`./ajuda/${slug}.md`);
    const txt = await res.text();
    content.innerHTML = marked.parse(txt);
  } catch (e) {
    content.textContent = "Ajuda não encontrada.";
  }
}

function fecharAjuda() {
  dom("ajudaModal").style.display = "none";
}

async function carregarTab(tabId) {
  if (!state.empresaSelecionada && tabId !== "tab-empresas") {
    abrirGate();
    return;
  }
  switch (tabId) {
    case "tab-empresas":
      renderEmpresasTab();
      break;
    case "tab-produtos":
      await carregarProdutos();
      break;
    case "tab-ncm":
      await carregarNcm();
      break;
    case "tab-st":
      if (!state.destinos.length) await carregarDestinos();
      await carregarSt();
      break;
    case "tab-custos":
      if (!state.destinos.length) await carregarDestinos();
      await carregarCustos();
      break;
    case "tab-pauta":
      if (!state.destinos.length) await carregarDestinos();
      if (!state.produtos.length) await carregarProdutos();
      await carregarPauta();
      break;
  }
  state.tabsCarregados.add(tabId);
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-link");
  const panes = document.querySelectorAll(".tab-pane");
  if (!tabs.length || !panes.length) return;

  const ativar = (id) => {
    tabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tabTarget === id);
    });
    panes.forEach((pane) => {
      pane.classList.toggle("active", pane.id === id);
    });
  };

  tabs.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const alvo = btn.dataset.tabTarget;
      ativar(alvo);
      try {
        await carregarTab(alvo);
      } catch (err) {
        setStatus(err.message, true);
      }
    });
  });

  ativar(tabs[0].dataset.tabTarget);
}

function bindFormListeners() {
  dom("empresaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await salvarEmpresa();
    } catch (err) {
      console.error(err);
    }
  });
  dom("empresaGateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await salvarEmpresa("empresaGateForm", { autoSelecionar: true });
    } catch (err) {
      // mensagem já exibida
    }
  });
  dom("gateAtualizar").addEventListener("click", () => carregarEmpresasGate());
  dom("produtoForm").addEventListener("submit", (e) => { e.preventDefault(); salvarProduto(); });
  dom("importBtn").addEventListener("click", importarProdutos);
  dom("ncmForm").addEventListener("submit", (e) => { e.preventDefault(); salvarNcm(); });
  dom("ncmSeed").addEventListener("click", seedNcm);
  dom("stForm").addEventListener("submit", (e) => { e.preventDefault(); salvarSt(); });
  dom("custoForm").addEventListener("submit", (e) => { e.preventDefault(); salvarCusto(); });
  dom("pautaForm").addEventListener("submit", (e) => { e.preventDefault(); salvarPauta(); });
  dom("simForm").addEventListener("input", simularFormula);
  dom("ajudaFechar").addEventListener("click", fecharAjuda);
  const limpar = dom("produtoLimpar");
  if (limpar) limpar.addEventListener("click", () => preencherProdutoForm());
  dom("apiStatusDetalhes")?.addEventListener("click", abrirErroApi);
  dom("apiErroFechar")?.addEventListener("click", fecharErroApi);
  dom("gateAtualizarGate")?.addEventListener("click", () => carregarEmpresasGate());
}

async function init() {
  state.apiBase = getApiBaseUrl();
  if (!state.apiBase) {
    setStatus("Configure window.APP_CONFIG.API_BASE_URL para usar a aplicação.", true);
    abrirGate();
    return;
  }

  setApiStatus("loading");
  abrirGate();
  setStatus("Carregando empresas...");
  bindFormListeners();
  bindAjudaButtons();
  setupTabs();
  preencherProdutoForm();
  preencherCustoForm();
  preencherStForm();
  preencherPautaForm();

  try {
    await carregarEmpresasGate();
    restaurarEmpresaSelecionada();
    atualizarEmpresaAtivaLabel();
    if (state.empresaSelecionada) {
      const ativa = document.querySelector(".tab-link.active")?.dataset.tabTarget;
      if (ativa) await carregarTab(ativa);
    } else {
      abrirGate();
    }
  } catch (err) {
    const detalhe = err?.details || err?.message || "Erro ao carregar";
    setStatus("Não foi possível carregar os dados iniciais.", true);
    setApiStatus("error", detalhe);
    abrirGate();
  }
}

function abrirErroApi() {
  const modal = dom("apiErroModal");
  const conteudo = dom("apiErroConteudo");
  if (!modal || !conteudo) return;
  conteudo.textContent = state.apiStatusDetalhe || "Sem detalhes adicionais.";
  modal.style.display = "flex";
}

function fecharErroApi() {
  const modal = dom("apiErroModal");
  if (modal) modal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", init);
