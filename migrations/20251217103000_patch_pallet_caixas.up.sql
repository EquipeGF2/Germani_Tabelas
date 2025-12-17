PRAGMA foreign_keys = ON;

-- PATCH: pallet em 2 dimensões
-- - produtos.pallet (TEXT) já atende o formato (ex: 04x05) quando existir
-- - produtos.pallet_caixas (INTEGER) registra quantas caixas há no pallet (Dallas e Germani)

ALTER TABLE produtos ADD COLUMN pallet_caixas INTEGER;

CREATE INDEX IF NOT EXISTS idx_produtos_pallet_caixas
ON produtos(empresa_id, pallet_caixas);
