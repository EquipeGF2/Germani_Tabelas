# Pauta MS interna

## Objetivo
Gerenciar pauta por item para a operação interna em MS com três tipos: PRECO, PERCENTUAL e FORMULA_ESPECIAL.

## Quando usar
- Definir valores de pauta específicos por SKU para operações internas.
- Simular rapidamente o cálculo da fórmula especial.

## Passo a passo
1. Selecione a empresa.
2. Preencha destino (MS) e operação (INTERNA).
3. Escolha o produto (ID ou use a lista de apoio), selecione o tipo de pauta e preencha os campos obrigatórios:
   - **PRECO**: `pauta_preco` + `percentual_aplicacao`.
   - **PERCENTUAL**: `pauta_percentual`.
   - **FORMULA_ESPECIAL**: `mva_pct` + `aliquota_pct` (o simulador calcula `max(0, preco * mva% * aliq%)`).
4. Clique em **Salvar**. A tabela lista os itens e permite editar ao clicar na linha.

## Erros comuns
- Informar tipo de pauta sem preencher os campos obrigatórios.
- Não selecionar produto da mesma empresa.

## Glossário
- **percentual_aplicacao**: percentual usado para reduzir o valor fixo.
- **mva_pct**: margem de valor agregado usada na fórmula especial.
