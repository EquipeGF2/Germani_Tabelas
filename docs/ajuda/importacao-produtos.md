# Importação de produtos

## Objetivo
Realizar upsert em massa respeitando templates Dallas e Germani, incluindo logística e pallets.

## Quando usar
- Receber planilha das equipes e aplicar no catálogo.
- Sincronizar ajustes de pallets ou EAN em lote.

## Passo a passo
1. Escolha o **template** correspondente ao arquivo.
2. Cole o conteúdo da planilha (CSV separado por `;` ou `,` com cabeçalho).
3. Clique em **Importar**. O relatório mostra inseridos, atualizados e erros por linha.

## Templates
- **DALLAS_PRODUTOS**: `Cod, Descrição, Und, PalletFormato, PalletCaixas, EAN13, Família, Ativo, Ref, Grupo`.
- **GERMANI_PRODUTOS**: `Cod, Descrição, Und, PalletCaixas, EAN14_caixa, Família(opcional), Ativo, Ref, Grupo`.
- **DALLAS_LOGISTICA**: adiciona `Apresentacao, Cubagem_m3, PesoLiq_kg, PesoBruto_kg, Peso_kg, PalletFormato, PalletCaixas`.

## Regras extras
- Se **PalletCaixas** vier vazio e **PalletFormato** for `NxM`, o sistema calcula automaticamente.
- Upsert por `empresa_id + sku` (mantém IDs).

## Erros comuns
- Cabeçalho divergente do template escolhido.
- SKU vazio ou descrição ausente.
- Valores numéricos com vírgula ao invés de ponto (padronize antes de colar).

## Glossário
- **Upsert**: atualiza se o SKU existir, cria caso contrário.
