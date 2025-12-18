# Produtos

## Objetivo
Manter o catálogo por empresa, incluindo dados logísticos (pallet, pesos, cubagem) e identificadores (SKU, EAN).

## Quando usar
- Cadastro manual rápido de SKUs.
- Ajustes pontuais de informações logísticas ou de preço base.

## Passo a passo
1. Selecione a empresa.
2. Preencha SKU, descrição e unidade (padrão UN).
3. Informe dados opcionais (família, grupo de preço, pallet, EAN, pesos).
4. Clique em **Salvar produto**. Para editar, clique na linha da tabela para preencher o formulário.

## Exemplos
- Pallet Dallas: formato `04x05`, caixas = 20.
- Pallet Germani: deixar formato vazio e apenas **Pallet caixas**.

## Erros comuns
- Não informar SKU único por empresa.
- Ignorar pallet_caixas quando o formato estiver no padrão `NxM` (o importador calcula automaticamente se não vier preenchido).

## Glossário
- **Grupo de preço**: agrupamento 1..4 usado em custos e tabelas.
- **Categoria preço base**: chave livre para vincular ST ou pauta específica.
