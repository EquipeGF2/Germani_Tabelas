PRAGMA foreign_keys = ON;

-- =========================
-- PRODUTOS (Dallas: cubagem + pesos; geral: apresentação e categoria interna)
-- =========================
ALTER TABLE produtos ADD COLUMN apresentacao TEXT;        -- ex: 12X400G, 05X5KG
ALTER TABLE produtos ADD COLUMN cubagem_m3 REAL;          -- cubagem unitária (m³)
ALTER TABLE produtos ADD COLUMN peso_liq_kg REAL;         -- peso líquido unitário (kg)
ALTER TABLE produtos ADD COLUMN peso_bruto_kg REAL;       -- peso bruto unitário (kg)
ALTER TABLE produtos ADD COLUMN categoria_preco_base TEXT;-- classificação interna para base de preço/frete (opcional)

CREATE INDEX IF NOT EXISTS idx_produtos_familia ON produtos(empresa_id, familia);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria_base ON produtos(empresa_id, categoria_preco_base);

-- =========================
-- TABELAS DE PREÇO (campos para PDF + defaults por tabela)
-- =========================
ALTER TABLE tabelas_preco ADD COLUMN pdf_header_left  TEXT;
ALTER TABLE tabelas_preco ADD COLUMN pdf_header_center TEXT;
ALTER TABLE tabelas_preco ADD COLUMN pdf_header_right TEXT;

ALTER TABLE tabelas_preco ADD COLUMN pdf_footer_left  TEXT;
ALTER TABLE tabelas_preco ADD COLUMN pdf_footer_center TEXT;
ALTER TABLE tabelas_preco ADD COLUMN pdf_footer_right TEXT;

ALTER TABLE tabelas_preco ADD COLUMN pdf_template TEXT NOT NULL DEFAULT 'PADRAO'; -- DALLAS_PADRAO | GERMANI_PADRAO | DALLAS_EXPORT | etc
ALTER TABLE tabelas_preco ADD COLUMN frete_modalidade TEXT NOT NULL DEFAULT 'CIF'; -- CIF | FOB
ALTER TABLE tabelas_preco ADD COLUMN protecoes_json TEXT; -- lista de percentuais e rótulos (flexível)
ALTER TABLE tabelas_preco ADD COLUMN protecao_pct_total REAL NOT NULL DEFAULT 0; -- atalho (soma)

-- =========================
-- ITENS DA TABELA (quebra de componentes do preço: base/frete/descarga/proteção/ST)
-- Mantém "preco" como preço final (compatibilidade), mas adiciona colunas para cálculo auditável
-- =========================
ALTER TABLE tabela_preco_itens ADD COLUMN preco_base REAL;          -- preço base antes de ajustes
ALTER TABLE tabela_preco_itens ADD COLUMN frete_valor REAL;         -- acréscimo frete unitário
ALTER TABLE tabela_preco_itens ADD COLUMN descarga_valor REAL;      -- acréscimo descarga unitário
ALTER TABLE tabela_preco_itens ADD COLUMN protecao_pct_total REAL;  -- soma dos percentuais usados
ALTER TABLE tabela_preco_itens ADD COLUMN st_pct REAL;              -- ST aplicada (%)
ALTER TABLE tabela_preco_itens ADD COLUMN preco_final REAL;         -- preço final unitário (espelho de "preco")

CREATE INDEX IF NOT EXISTS idx_itens_tabela_produto ON tabela_preco_itens(tabela_id, produto_id);

-- =========================
-- FRETE REGRAS (Dallas MS interestadual: por KG e/ou % do preço; flexível por "local")
-- =========================
CREATE TABLE IF NOT EXISTS frete_regras (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tabela_base_id TEXT NOT NULL,         -- regra amarrada à tabela base
  destino_codigo TEXT,                  -- ex: MS (opcional)
  operacao TEXT,                        -- INTERNA | INTERESTADUAL (opcional)
  local_nome TEXT,                      -- ex: "CAMPO GRANDE", "DOURADOS", "INTERIOR"
  tipo TEXT NOT NULL,                   -- POR_KG | PERCENTUAL | AMBOS
  valor_por_kg REAL,                    -- quando POR_KG/AMBOS
  percentual REAL,                      -- quando PERCENTUAL/AMBOS (sobre preço base)
  aplica_em_json TEXT,                  -- filtros: {"grupo_preco":[1,2], "familia":[...], "categoria_preco_base":[...], "produto_ids":[...]}
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_frete_regras_base ON frete_regras(empresa_id, tabela_base_id);
CREATE INDEX IF NOT EXISTS idx_frete_regras_destino ON frete_regras(empresa_id, destino_codigo, operacao);

-- =========================
-- PRODUTOS BASE POR FAMÍLIA (substituição quando sai de linha)
-- Usa prioridade: menor número = mais prioritário
-- =========================
CREATE TABLE IF NOT EXISTS familia_bases (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  familia TEXT NOT NULL,
  produto_id TEXT NOT NULL,
  prioridade INTEGER NOT NULL DEFAULT 1,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(empresa_id, familia, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_familia_bases ON familia_bases(empresa_id, familia, prioridade);
