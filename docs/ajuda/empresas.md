# Empresas

## Objetivo
Cadastrar e gerenciar empresas, permitindo que cada uma tenha tema e configurações próprias. A empresa selecionada define o contexto de todos os outros cadastros.

## Quando usar
- Primeira configuração do ambiente.
- Troca de identidade visual ou ajustes de governança (logo, tema, config_json).

## Passo a passo
1. Informe o **endpoint** da API no topo da página.
2. Clique em **Carregar empresas** para listar as existentes.
3. Preencha o nome e clique em **Criar** para adicionar uma nova empresa.
4. Clique no card para selecionar a empresa. O tema é aplicado automaticamente.

## Exemplos
- Logo em URL pública: `https://.../logo.png`
- Tema: `{ "primaria": "#0f766e", "texto": "#0b1021" }`

## Erros comuns
- Não selecionar a empresa antes de acessar outros módulos.
- Informar endpoint incorreto do Worker.

## Glossário
- **Tema**: JSON com cores que personalizam o front.
- **Config_json**: Ajustes específicos para a operação (ex.: prazos, flags de exibição).
