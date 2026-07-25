---
aba: Usuários (Vendedores)
rota: /admin/vendedores
permissao: admin
---

# Usuários (Vendedores)

> O item no menu **Administração** agora se chama **Usuários** (antes "Vendedores"). A tela e a rota são as mesmas.

## O que é

Gerenciamento de todos os usuários do sistema (chamados de "vendedores", mas incluem motoristas, escritório e qualquer pessoa com acesso). Aqui se configura: limites de Flex, alerta de faturamento, formas de atendimento visíveis, permissões detalhadas e status ativo/inativo.

> **Desde 25/07/2026 os usuários são criados 100% pelo app** (botão "Novo Usuário"). A importação de vendedores do Conta Azul foi desligada — o "Sincronizar Tudo" não traz mais usuários. Cada usuário novo nasce **vinculado a uma pessoa do cadastro de clientes** (futuro cadastro de pessoas); usuários antigos (vindos do CA) podem ser vinculados aos poucos pelo link "Vincular cadastro" sob o nome.

---

## O que dá pra fazer aqui

- **Criar um usuário novo** (botão "Novo Usuário", só admin): busca a pessoa no cadastro de clientes, os dados (nome, e-mail, telefone) vêm preenchidos, define login e senha — e o painel de permissões abre sozinho em seguida
- **Vincular um usuário antigo ao cadastro** (link "Vincular cadastro" sob o nome, quando ainda não tem vínculo)
- Listar todos os usuários (ativos e inativos)
- Buscar por nome
- Editar: e-mail, telefone, **% Flex** (percentual sobre vendas 30 dias), % máximo de desconto por item
- Ver o **Flex Disponível (30d)**: calculado automaticamente — não é mais editável manualmente (detalhes de orçamento/usado aparecem ao pousar o mouse sobre o valor)
- Ativar ou inativar um usuário
- Configurar quais formas de atendimento aparecem para o vendedor (Presencial, WhatsApp, Telefone)
- Ligar/desligar alerta de faturamento por WhatsApp
- Abrir o modal de permissões para configurar as permissões detalhadas do usuário

---

## Como fazer (passo a passo real)

### Criar um usuário novo (só admin)
1. Clique em **"+ Novo Usuário"** no topo da tela
2. **Passo 1 — buscar a pessoa**: digite o nome (ou documento/código) — a busca é no cadastro de clientes. Se a pessoa não existir ainda, use "Cadastrar nova pessoa" (abre o Novo Cadastro de clientes) e volte aqui depois
3. **Passo 2 — dados de acesso**: nome completo, e-mail e telefone vêm do cadastro (dá pra ajustar); defina **login** e **senha** (mínimo 4 caracteres)
4. Clique em "Criar usuário" — o painel de **permissões abre sozinho** para configurar os acessos
5. O usuário já nasce ativo e vinculado ao cadastro selecionado

### Vincular um usuário antigo ao cadastro
1. Na linha do usuário, sob o nome, clique em **"Vincular cadastro"** (aparece só para quem ainda não tem vínculo)
2. Busque e selecione a pessoa no cadastro — o vínculo é salvo na hora
3. Um cadastro só pode estar vinculado a um usuário (o sistema avisa se já estiver em uso)

### Editar dados de um vendedor
1. Clique no ícone de lápis na linha do vendedor
2. Campos editáveis aparecem: e-mail, telefone, **% Flex** (orçamento dinâmico sobre vendas 30 dias), **% Máx Desc.** (limite por item)
3. Salve com o ícone de check

### Configurar permissões (painel repaginado em 25/07/2026)
1. Clique no ícone de escudo (permissões) na linha do vendedor
2. O painel abre em tela larga, com **menu lateral por seção** (Acesso e Conta, Dashboard, Tarefas, Vendas, Logística, Financeiro, Caixa Diário, Administração, Produção/Estoque, PCP, RH, Configurações) e contador de ativas em cada uma. No celular, o menu vira chips deslizantes no topo
3. **Busca no topo**: procura pelo nome da permissão, pela descrição **e por palavras do dia a dia** (ex.: "quitar" acha "Baixar no Caixa"; "senha" acha "Autorizar Desconsiderar Devolução"). O interruptor funciona direto no resultado. Atalho: tecla `/`
4. **Aplicar perfil rápido**: marca em um clique o conjunto típico de uma função (Vendedor de campo, Motorista, Escritório/Financeiro, Produção/PCP). Perfis nunca ligam admin nem permissões da zona de risco
5. **Marcar tudo / Limpar** em cada seção (o "Marcar tudo" pula a zona de risco de propósito)
6. **Copiar de outro usuário**: botão na barra do topo — escolhe a pessoa e copia todas as permissões dela
7. Filtros **"Só ativas"** e **"Zona de risco"** ajudam a auditar rapidamente
8. Na seção **Caixa Diário** também fica o campo **"Tabela para cobrança de faltas de devolução"** — a tabela de preço usada para cobrar o motorista quando falta mercadoria na conferência (padrão automático: "À vista - Funcionário")
9. O rodapé mostra **quantas alterações estão pendentes**; nada é gravado até clicar em **Salvar** (e fechar com pendências pede confirmação)

### Histórico de permissões (auditoria + desfazer)
1. No painel de permissões, clique em **"Histórico"** na barra do topo
2. Cada save que mudou permissões vira uma entrada: **quando, quem** e o resumo (＋X ligadas / −Y desligadas; "Ver o que mudou" lista os nomes)
3. **"↩ Voltar como estava antes desta mudança"** re-aplica o estado anterior àquele save — revise e clique em Salvar. Nada é apagado: a restauração também vira uma entrada nova (dá para desfazer o desfazer)
4. Guarda as últimas 50 versões por usuário; a senha nunca entra no histórico. Só admin vê o histórico

### Ativar ou inativar
- Clique no ícone de usuário com X (inativar) ou com check (reativar)
- Confirme o alerta — usuários inativos não conseguem acessar o sistema

### Configurar formas de atendimento visíveis
- Clique nos botões de forma (Presencial, WhatsApp, Telefone) no card do vendedor
- As formas marcadas aparecem como opção no modal de atendimento da Rota para aquele vendedor
- A mudança é salva automaticamente

### Ligar/desligar alerta de faturamento
- Clique no ícone de sino na linha do vendedor
- Quando ativo, o vendedor recebe notificação por WhatsApp quando um pedido é faturado no CA

---

## Permissões disponíveis (exemplos principais)

| Permissão | Função |
|-----------|--------|
| `admin` | Acesso total ao sistema |
| `Pode_Aprovar_Especial` | Aprova pedidos especiais |
| `Pode_Aprovar_Bonificacao` | Aprova bonificações |
| `Pode_Excluir_Pedido` | Exclui pedidos normais |
| `Pode_Fazer_Devolucao` | Registra devoluções |
| `Pode_Executar_Entregas` | Aparece como motorista nos embarques |
| `Pode_Editar_Caixa` | Acessa caixas de outros vendedores |
| `Pode_Conferir_Devolucao_Caixa` | Recebe a mercadoria devolvida e digita a contagem na conferência de devoluções do caixa |
| `Pode_Autorizar_Desconsiderar_Devolucao` | A senha desta pessoa libera falta de devolução sem cobrança ao motorista |
| `Pode_Gerenciar_Metas` | Cria e edita metas de vendas |
| `Pode_Ver_Dashboard_Admin` | Vê o painel gerencial do dashboard |
| `Pode_Editar_Veiculos` | Cadastra e edita veículos |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total à aba, incluindo **criar usuário** |
| `vendedores` (edit) | Pode editar dados não-sensíveis do usuário (e-mail, telefone, % Flex, formas de atendimento) e vincular ao cadastro |

> **Segurança:** **criar usuário** e alterar **permissões, login, senha ou status (ativo/inativo)** é restrito a `admin` — o backend bloqueia (HTTP 403) quem não for admin, mesmo que consiga abrir a tela. Isso impede que alguém sem ser admin conceda privilégios a si mesmo ou troque a senha de outra pessoa.

---

## Depende de / Interfere em

- **Rota** — as formas de atendimento configuradas aqui aparecem no modal de atendimento
- **Caixa / Embarque** — a flag `Pode_Executar_Entregas` define quem aparece como motorista
- **Pedidos** — o flex disponível dinâmico é verificado ao finalizar um pedido com desconto
- **Dashboard** — `Pode_Ver_Dashboard_Admin` habilita o painel gerencial

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Vendedores/ListaVendedores.jsx` | Tela principal |
| `frontend/src/pages/Admin/Vendedores/NovoUsuarioModal.jsx` | Modal de criação/vínculo com o cadastro |
| `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` | Modal de permissões |
| `frontend/src/services/vendedorService.js` | Chamadas de API |
| `backend/routes/vendedorRoutes.js` | Rotas do backend (GET, POST, PUT) |
