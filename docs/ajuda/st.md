# ST (substituição tributária)

## Objetivo
Cadastrar a matriz de regras de ST por empresa, destino e operação, incluindo variantes e parâmetros personalizáveis.

## Quando usar
- Definir tratamento fiscal por UF ou operação interestadual.
- Registrar variantes (simples/outorgante) e parâmetros usados na precificação.

## Passo a passo
1. Selecione a empresa.
2. Escolha **Destino** e **Operação**.
3. Marque **Tem ST** quando aplicável e preencha `variantes_json` / `parametros_json` (ex.: `{ "simples": true }`).
4. Clique em **Salvar**. Clique em uma linha para editar.

## Erros comuns
- Não informar destino.
- JSON inválido nas variantes/parametros.

## Glossário
- **variantes_json**: flags de cenários fiscais (simples, outorgante, etc.).
- **parametros_json**: estrutura livre com bases ou percentuais usados em cálculos futuros.
