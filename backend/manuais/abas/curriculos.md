---
aba: Currículos (RH)
rota: /rh/curriculos
permissao: admin (ou permissão de RH)
---

# Currículos (RH)

## O que é

Módulo de gestão de candidatos para vagas na empresa. Quando alguém envia um currículo (por formulário externo ou cadastro manual), ele aparece aqui. A equipe de RH acompanha o funil de seleção, agenda entrevistas, atualiza o status de cada candidato e registra as decisões.

---

## O que dá pra fazer aqui

- Ver lista de candidatos com status do processo seletivo
- Ver cards de resumo: total, novos, editados, em entrevista, contratados
- Filtrar por: texto livre, status (múltipla seleção) e área de interesse
- Navegar para o detalhe de cada candidato
- Atualizar o status do candidato (avançar no funil)
- Ver contagem por status e por área de interesse

---

## Status do funil de seleção

| Status | Cor | Significado |
|--------|-----|-------------|
| Novo | Azul | Currículo recém-chegado |
| Editado | Âmbar | Candidato atualizou os dados |
| Em Análise | Amarelo | Em revisão pelo RH |
| Entrevista | Roxo | Chamado para entrevista |
| Agendado | Índigo | Entrevista agendada |
| Entrevistado | Ciano | Entrevista realizada |
| Aprovado | Verde água | Aprovado no processo |
| Contratado | Verde | Foi contratado |
| Não Qualificado | Cinza | Perfil não atende |
| Rejeitado | Vermelho | Reprovado na seleção |
| Desistiu | Laranja | Candidato desistiu |
| Não Disponível | Ardósia | Indisponível no momento |

---

## Áreas de interesse

- Produção
- Entrega
- Vendas
- Administrativo
- Outros

---

## Como fazer (passo a passo real)

### Ver novos currículos
1. Abra a aba Currículos
2. Os cards no topo mostram quantos estão "Novos" e "Editados" — foque neles
3. Filtre pelo status "Novo" para ver só os recém-chegados

### Avançar um candidato no funil
1. Clique no candidato para abrir o detalhe
2. Mude o status conforme o andamento do processo
3. Salve

### Filtrar por status
- Clique no dropdown de status
- Marque um ou mais status simultaneamente
- A lista atualiza com os candidatos que correspondem

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total |

---

## Página pública de candidatura (`/candidatura`)

Página aberta (sem login) onde o candidato envia ou atualiza o próprio currículo.

- **Candidato novo:** digita o CPF → preenche o formulário → envia. Simples, sem código.
- **Candidato que já enviou antes (CPF já existe):** por segurança (LGPD), o sistema **não mostra mais os dados só com o CPF**. Ele envia um **código de verificação pelo WhatsApp cadastrado**; o candidato digita o código para acessar e editar. Sem o código, ninguém vê nem altera os dados.
  - O código vale 30 minutos, com limite de tentativas.
  - **Perdeu o número cadastrado?** A tela oferece "Falar com a empresa no WhatsApp". No horário comercial, o RH atualiza o telefone do candidato (na tela de detalhe) e ele consegue receber o código no número novo.
- Isso corrige uma falha em que qualquer pessoa puxava o currículo completo (nome, endereço, contato) só digitando um CPF.

---

## Depende de / Interfere em

- Módulo isolado — não interfere diretamente em outras abas do sistema
- O envio do código de verificação usa o **webhook do BotConversa** (mesmo canal das mensagens de WhatsApp)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/RH/ListaCurriculos.jsx` | Lista com filtros e cards de resumo |
| `frontend/src/pages/RH/DetalheCurriculo.jsx` | Detalhe e edição do candidato |
| `frontend/src/services/curriculoService.js` | Chamadas de API |
| `backend/src/routes/curriculos.js` | Rotas do backend |
