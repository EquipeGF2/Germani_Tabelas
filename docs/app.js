const state = {
  apiBase: "",
  empresas: [],
  empresaSelecionada: null,
  produtos: [],
  ncm: [],
  st: [],
  custos: [],
  pauta: [],
  destinos: [],
};

const dom = (id) => document.getElementById(id);

function setStatus(msg, isError = false) {
  const el = dom("statusBar");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b91c1c" : "inherit";
}

function getApiBaseUrl() {
  const atual = (state.apiBase || "").trim();
  if (atual) return atual;

  const salvo = (localStorage.getItem("apiBase") || "").trim();
  if (salvo) {
    state.apiBase = salvo;
    return salvo;
  }

  const vindoDoConfig = (window.APP_CONFIG?.API_BASE_URL || "").trim();
  if (vindoDoConfig) state.apiBase = vindoDoConfig;
  return vindoDoConfig;
}

function setApiBaseUrl(valor) {
  const normalizado = (valor || "").trim();
  state.apiBase = normalizado;
  localStorage.setItem("apiBase", normalizado);
  return normalizado;
}

function applyTema(temaJson) {
  if (!temaJson) return;
  try {
    const tema = typeof temaJson === "string" ? JSON.parse(temaJson) : temaJson;
    if (tema?.primaria) document.documentElement.style.setProperty("--cor-primaria", tema.primaria);
    if (tema?.texto) document.documentElement.style.setProperty("--cor-texto", tema.texto);
  } catch (e) {
    console.warn("Tema inválido", e);
  }
}

async function api(path, options = {}) {
  const base = getApiBaseUrl();
  if (!base) throw new Error("Configure a URL da API antes de continuar.");
  const urlBase = base.replace(/\/$/, "");
  let res;
  try {
    res = await fetch(`${urlBase}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    console.error(err);
    throw new Error("Não foi possível conectar à API. Confira o endpoint e sua conexão.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Erro ${res.status} ao chamar a API.`);
  }
  return res.json();
}

async function carregarEmpresas() {
  const data = await api(`/v1/empresas`);
  state.empresas = data.empresas || [];
  renderEmpresas();
}

function renderEmpresas() {
  const wrap = dom("empresasGrid");
  wrap.innerHTML = "";
  state.empresas.forEach((empresa) => {
    const card = document.createElement("div");
    card.className = `card ${state.empresaSelecionada?.id === empresa.id ? "selected" : ""}`;
    card.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;">
        ${empresa.logo_url ? `<img src="${empresa.logo_url}" alt="logo" style="width:40px;height:40px;object-fit:contain;" />` : ""}
        <div>
          <div><strong>${empresa.nome}</strong></div>
          <small class="muted">Tema configurado</small>
        </div>
      </div>
    `;
    card.onclick = () => {
      state.empresaSelecionada = empresa;
      localStorage.setItem("empresaSelecionada", empresa.id);
      applyTema(empresa.tema_json);
      renderEmpresas();
      refreshTudo();
    };
    wrap.appendChild(card);
  });
}

async function salvarEmpresa() {
  const nome = dom("empresaNome").value.trim();
  if (!nome) return setStatus("Informe o nome da empresa.", true);
  await api(`/v1/empresas`, { method: "POST", body: JSON.stringify({ nome }) });
  dom("empresaNome").value = "";
  setStatus("Empresa criada.");
  await carregarEmpresas();
}

function empresaObrigatoria() {
  if (!state.empresaSelecionada) {
    setStatus("Selecione uma empresa primeiro.", true);
    return false;
  }
  return true;
}

async function carregarProdutos() {
  if (!empresaObrigatoria()) return;
  const data = await api(`/v1/produtos?empresa_id=${state.empresaSelecionada.id}`);
  state.produtos = data.produtos || [];
  renderProdutos();
}

function preencherProdutoForm(prod = null) {
  const fields = ["produtoId","produtoSku","produtoDesc","produtoUnd","produtoFamilia","produtoGrupo","produtoPallet","produtoPalletCaixas","produtoEAN13","produtoEAN14","produtoAtivo","produtoRef","produtoPeso","produtoApresentacao","produtoCubagem","produtoPesoLiq","produtoPesoBruto","produtoCategoriaPreco"];
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
  const resp = await api(`/v1/produtos/bulk`, { method: "POST", body: JSON.stringify({ empresa_id: state.empresaSelecionada.id, template, rows }) });
  setStatus(`Importação finalizada. Inseridos: ${resp.inseridos}, Atualizados: ${resp.atualizados}`);
  await carregarProdutos();
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

async function refreshTudo() {
  if (!state.empresaSelecionada) return;
  await Promise.all([
    carregarProdutos(),
    carregarNcm(),
    carregarSt(),
    carregarCustos(),
    carregarPauta(),
  ]);
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
    btn.addEventListener("click", () => ativar(btn.dataset.tabTarget));
  });

  ativar(tabs[0].dataset.tabTarget);
}

function restaurarEmpresaSelecionada() {
  const saved = localStorage.getItem("empresaSelecionada");
  if (saved) {
    const empresa = state.empresas.find((e) => e.id === saved);
    if (empresa) {
      state.empresaSelecionada = empresa;
      applyTema(empresa.tema_json);
    }
  }
}

function init() {
  state.apiBase = getApiBaseUrl();
  dom("apiBase").value = state.apiBase;
  dom("apiBase").addEventListener("change", (e) => {
    const salvo = setApiBaseUrl(e.target.value);
    setStatus(salvo ? "Endpoint salvo. Clique em 'Carregar empresas'." : "Informe um endpoint válido.", !salvo);
  });
  dom("salvarApiBase").addEventListener("click", () => {
    const salvo = setApiBaseUrl(dom("apiBase").value);
    setStatus(salvo ? "Endpoint salvo. Clique em 'Carregar empresas'." : "Informe um endpoint válido.", !salvo);
  });
  dom("empresaForm").addEventListener("submit", (e) => { e.preventDefault(); salvarEmpresa(); });
  dom("produtoForm").addEventListener("submit", (e) => { e.preventDefault(); salvarProduto(); });
  dom("importBtn").addEventListener("click", importarProdutos);
  dom("ncmForm").addEventListener("submit", (e) => { e.preventDefault(); salvarNcm(); });
  dom("ncmSeed").addEventListener("click", seedNcm);
  dom("stForm").addEventListener("submit", (e) => { e.preventDefault(); salvarSt(); });
  dom("custoForm").addEventListener("submit", (e) => { e.preventDefault(); salvarCusto(); });
  dom("pautaForm").addEventListener("submit", (e) => { e.preventDefault(); salvarPauta(); });
  dom("simForm").addEventListener("input", simularFormula);
  dom("ajudaFechar").addEventListener("click", fecharAjuda);
  dom("carregarEmpresas").addEventListener("click", async () => {
    try {
      if (!getApiBaseUrl()) return setStatus("Informe o endpoint da API antes de carregar.", true);
      await carregarDestinos();
      await carregarEmpresas();
      restaurarEmpresaSelecionada();
      renderEmpresas();
      await refreshTudo();
    } catch (err) {
      setStatus(err.message, true);
    }
  });
  bindAjudaButtons();
  setupTabs();

  if (getApiBaseUrl()) {
    setStatus("Carregando dados iniciais...");
    Promise.all([carregarDestinos(), carregarEmpresas()])
      .then(() => { restaurarEmpresaSelecionada(); renderEmpresas(); refreshTudo(); })
      .catch((err) => setStatus(err.message, true));
  }
  preencherProdutoForm();
  preencherCustoForm();
  preencherStForm();
}

document.addEventListener("DOMContentLoaded", init);
