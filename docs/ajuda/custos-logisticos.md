# Custos logísticos

## Objetivo
Registrar custos específicos por destino e operação, incluindo paletização para Dallas.

## Quando usar
- Precificar frete, paletização ou cobranças por grupo de preço/família.
- Simular custos aplicados a pedidos com filtros (aplica_em_json).

## Passo a passo
1. Selecione a empresa.
2. Preencha destino, operação e tipo de custo.
3. Informe valor e unidade de cobrança (ex.: `POR_PALLET`, `POR_PEDIDO`).
4. Opcional: defina `aplica_em_json` (ex.: `{ "grupo_preco": [1,2] }`).
5. Clique em **Salvar** e use a tabela para editar registros existentes.

## Erros comuns
- Valor vazio ou não numérico.
- Não definir unidade de cobrança.

## Glossário
- **tipo_custo**: label que identifica o custo (PALETIZACAO, FRETE_FIXO etc.).
- **aplica_em_json**: filtros para restringir o custo a grupos, famílias ou SKUs específicos.
