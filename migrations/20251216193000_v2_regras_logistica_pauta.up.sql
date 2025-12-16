PRAGMA foreign_keys = ON;

-- =========================
-- EMPRESAS (branding + config)
-- =========================
ALTER TABLE empresas ADD COLUMN logo_url TEXT;
ALTER TABLE empresas ADD COLUMN tema_json TEXT;    -- ex: {"primaria":"#d00","secundaria":"#fff"}
ALTER TABLE empresas ADD COLUMN config_json TEXT;  -- ex: {"prazo_7d_pct":0.02,...}

-- =========================
-- PRODUTOS (campos por empresa + logística)
-- =========================
ALTER TABLE produtos ADD COLUMN familia TEXT;
ALTER TABLE produtos ADD COLUMN ean13 TEXT;
ALTER TABLE produtos ADD COLUMN ean14_caixa TEXT;
ALTER TABLE produtos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;        -- 1=ativo 0=inativo
ALTER TABLE produtos ADD COLUMN ref_familia INTEGER NOT NULL DEFAULT 0;  -- 1=referência
ALTER TABLE produtos ADD COLUMN grupo_preco INTEGER NOT NULL DEFAULT 1;  -- 1..4 (agrupamento)
ALTER TABLE produtos ADD COLUMN peso_kg REAL;                            -- NOVO (logística)
ALTER TABLE produtos ADD COLUMN ncm_categoria_id TEXT;                   -- Dallas (tipo/NCM)

CREATE INDEX IF NOT EXISTS idx_produtos_grupo ON produtos(empresa_id, grupo_preco);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos(empresa_id, ativo);

-- =========================
-- DESTINOS (UF e outros destinos)
-- =========================
CREATE TABLE IF NOT EXISTS destinos (
  codigo TEXT PRIMARY KEY,  -- ex: RS, SC, MS, EX
  tipo TEXT NOT NULL DEFAULT 'UF', -- UF | EXTERIOR | OUTRO
  descricao TEXT NOT NULL
);

-- Seed UFs + exportação (EX)
INSERT OR IGNORE INTO destinos (codigo, tipo, descricao) VALUES
('AC','UF','Acre'),('AL','UF','Alagoas'),('AP','UF','Amapá'),('AM','UF','Amazonas'),
('BA','UF','Bahia'),('CE','UF','Ceará'),('DF','UF','Distrito Federal'),('ES','UF','Espírito Santo'),
('GO','UF','Goiás'),('MA','UF','Maranhão'),('MT','UF','Mato Grosso'),('MS','UF','Mato Grosso do Sul'),
('MG','UF','Minas Gerais'),('PA','UF','Pará'),('PB','UF','Paraíba'),('PR','UF','Paraná'),
('PE','UF','Pernambuco'),('PI','UF','Piauí'),('RJ','UF','Rio de Janeiro'),('RN','UF','Rio Grande do Norte'),
('RS','UF','Rio Grande do Sul'),('RO','UF','Rondônia'),('RR','UF','Roraima'),('SC','UF','Santa Catarina'),
('SP','UF','São Paulo'),('SE','UF','Sergipe'),('TO','UF','Tocantins'),
('EX','EXTERIOR','Exportação');

-- =========================
-- NCM CATEGORIAS (Dallas: tipo -> NCM)
-- =========================
CREATE TABLE IF NOT EXISTS ncm_categorias (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, -- ex: ARROZ
  ncm TEXT NOT NULL,  -- ex: 1006.30.21
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ncm_empresa ON ncm_categorias(empresa_id);

-- =========================
-- ST REGRAS (matriz + variantes)
-- =========================
CREATE TABLE IF NOT EXISTS st_regras (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  destino_codigo TEXT NOT NULL, -- ex: MS
  operacao TEXT NOT NULL,       -- INTERNA | INTERESTADUAL
  tem_st INTEGER NOT NULL DEFAULT 0,
  variantes_json TEXT,          -- ex: {"simples":true} ou {"outorgante":false}
  parametros_json TEXT,         -- base para cálculo futuro
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_st_empresa ON st_regras(empresa_id, destino_codigo, operacao);

-- =========================
-- CUSTOS LOGÍSTICOS (inclui paletização)
-- =========================
CREATE TABLE IF NOT EXISTS custos_logisticos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  destino_codigo TEXT NOT NULL,
  operacao TEXT NOT NULL,        -- INTERNA | INTERESTADUAL
  tipo_custo TEXT NOT NULL,      -- PALETIZACAO | FRETE_FIXO | etc
  aplica_em_json TEXT,           -- ex: {"grupo_preco":[1,2],"familia":["X"],"produto_ids":[...]}
  valor REAL NOT NULL,
  unidade_cobranca TEXT NOT NULL, -- POR_PALLET | POR_PEDIDO | POR_KG | etc
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custos_empresa ON custos_logisticos(empresa_id, destino_codigo, operacao);

-- =========================
-- TABELAS PREÇO (base/sub + export + pedido mínimo)
-- =========================
ALTER TABLE tabelas_preco ADD COLUMN tipo TEXT NOT NULL DEFAULT 'BASE';      -- BASE | SUB
ALTER TABLE tabelas_preco ADD COLUMN tabela_base_id TEXT;                   -- nullable
ALTER TABLE tabelas_preco ADD COLUMN destino_codigo TEXT;                   -- nullable (UF/EX)
ALTER TABLE tabelas_preco ADD COLUMN operacao TEXT;                         -- nullable
ALTER TABLE tabelas_preco ADD COLUMN pedido_minimo REAL;                    -- nullable (se null, não mostra)
ALTER TABLE tabelas_preco ADD COLUMN exportacao INTEGER NOT NULL DEFAULT 0; -- 1 export
ALTER TABLE tabelas_preco ADD COLUMN moeda_exibicao TEXT NOT NULL DEFAULT 'BRL'; -- BRL | USD | BRL_USD
ALTER TABLE tabelas_preco ADD COLUMN cotacao_usd_fixada REAL;               -- nullable
ALTER TABLE tabelas_preco ADD COLUMN cotacao_protegida INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tabelas_tipo ON tabelas_preco(empresa_id, tipo);

-- =========================
-- REGRAS DE SUBTABELA (geração automatizada)
-- =========================
CREATE TABLE IF NOT EXISTS regras_subtabela (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tabela_base_id TEXT NOT NULL,
  nome_subtabela TEXT NOT NULL,
  destino_codigo TEXT,
  operacao TEXT,
  aplica_prazo INTEGER NOT NULL DEFAULT 0,
  prazo_dias INTEGER NOT NULL DEFAULT 0,  -- 0/7/14/21/28
  aplica_st INTEGER NOT NULL DEFAULT 0,
  aplica_custo_logistico INTEGER NOT NULL DEFAULT 0,
  exportacao INTEGER NOT NULL DEFAULT 0,
  moeda_exibicao TEXT NOT NULL DEFAULT 'BRL',
  cotacao_usd_fixada REAL,
  cotacao_protegida INTEGER NOT NULL DEFAULT 0,
  pedido_minimo REAL,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subregras_empresa ON regras_subtabela(empresa_id, tabela_base_id);

-- =========================
-- PAUTA (por item) + fórmula especial
-- =========================
CREATE TABLE IF NOT EXISTS pauta_itens (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  destino_codigo TEXT NOT NULL, -- MS
  operacao TEXT NOT NULL,       -- INTERNA
  produto_id TEXT NOT NULL,
  pauta_tipo TEXT NOT NULL,     -- PRECO | PERCENTUAL | FORMULA_ESPECIAL
  pauta_preco REAL,             -- quando PRECO (R$)
  percentual_aplicacao REAL,    -- quando PRECO (% “paga um %”)
  pauta_percentual REAL,        -- quando PERCENTUAL (%)
  mva_pct REAL,                 -- quando FORMULA_ESPECIAL (ex “25%”)
  aliquota_pct REAL,            -- quando FORMULA_ESPECIAL (ex “12%”)
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pauta_item
ON pauta_itens(empresa_id, destino_codigo, operacao, produto_id);

-- =========================
-- MOVIMENTOS DE PREÇO (auditoria premium por item)
-- =========================
CREATE TABLE IF NOT EXISTS preco_movimentos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tabela_id TEXT NOT NULL,
  produto_id TEXT NOT NULL,
  preco_anterior REAL,
  preco_novo REAL NOT NULL,
  origem TEXT NOT NULL,       -- MANUAL | IMPORTACAO | SUBTABELA
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mov_empresa ON preco_movimentos(empresa_id, tabela_id);
