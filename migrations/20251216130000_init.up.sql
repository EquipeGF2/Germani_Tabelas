PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ATIVA',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  UNIQUE (empresa_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos(empresa_id);

CREATE TABLE IF NOT EXISTS tabelas_preco (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  validade_inicio TEXT,
  validade_fim TEXT,
  status TEXT NOT NULL DEFAULT 'ATIVA',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tabelas_empresa ON tabelas_preco(empresa_id);

CREATE TABLE IF NOT EXISTS tabela_preco_itens (
  id TEXT PRIMARY KEY,
  tabela_id TEXT NOT NULL,
  produto_id TEXT NOT NULL,
  preco REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tabela_id) REFERENCES tabelas_preco(id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT,
  UNIQUE (tabela_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_itens_tabela ON tabela_preco_itens(tabela_id);
CREATE INDEX IF NOT EXISTS idx_itens_produto ON tabela_preco_itens(produto_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  acao TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_empresa ON audit_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_entidade ON audit_log(entidade, entidade_id);
