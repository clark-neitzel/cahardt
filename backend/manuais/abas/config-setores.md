---
aba: Config — Setores
rota: /config/setores
permissao: configuracoes (ver); admin ou configuracoes.edit (criar, renomear, ordenar, desativar, excluir)
---

# Config — Setores (cadastro de setores da empresa)

## O que é

A lista de setores usada na **ficha do funcionário** (campo Setor) e no **Como Fazer** (conteúdos, treinamentos, rotinas, tablets). Antes eram só quatro, fixos: Cozinha, Estoque, Expedição e Motorista. Agora o RH cadastra, renomeia e organiza os setores aqui, e **o nome novo aparece em todo lugar**.

## O que dá pra fazer aqui

- Ver todos os setores, com o ícone (emoji), o nome, o **código interno** (cinza, só leitura), quantos funcionários e quantos conteúdos usam cada um, e se está Ativo ou Inativo
- **Novo setor**: informe o nome (até 40 letras) e, se quiser, um emoji. O código interno é gerado sozinho a partir do nome (ex.: "Limpeza" vira LIMPEZA). Não é possível ter dois setores com o mesmo nome (maiúscula e acento não contam)
- **Editar** o nome e o ícone. **O código interno nunca muda** — por isso renomear não perde nada: os funcionários, os conteúdos do Como Fazer e os **tablets já liberados continuam valendo**, só o nome exibido muda
- **Mudar a ordem** com as setas (vale nos chips e nas listas de escolha)
- **Desativar / Reativar**: setor desativado some das listas de escolha e o **tablet dele fica fora do ar** (mostra "este setor foi desativado"). Nada é apagado; reativar restaura tudo. Funcionários e conteúdos que já estavam no setor continuam cadastrados
- **Excluir**: só funciona se o setor **não tem nenhum funcionário nem conteúdo**. Em uso, o sistema recusa e mostra as quantidades — o caminho então é desativar

## Quem pode

Qualquer pessoa logada **vê** a lista (o RH precisa dela na ficha). Criar, editar, ordenar, desativar e excluir exige **admin** ou **Configurações → editar**.

## Dúvidas comuns

- **"Renomeei e o tablet pediu link novo?"** Não deve pedir — o vínculo do tablet é pelo código interno, que não muda.
- **"Não consigo excluir."** O setor está em uso; desative em vez de excluir.
- **"Desativei por engano."** Reative: o tablet e as escolhas voltam na hora.
- **Ficha de funcionário com setor desativado:** continua mostrando o setor dele e pode ser salva normalmente; para escolher um setor desativado em outra pessoa, reative antes.
