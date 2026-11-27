---
aba: Agentes de IA
rota: /admin/agentes-ia
permissao: admin
---

# Agentes de IA

## O que é

Tela só para **administradores**. Mostra os agentes de IA do sistema (por exemplo, o **Luke**): usuários-robô que entram no sistema por um **token de acesso** (uma "senha longa" que começa com `cah_ag_`) em vez de login e senha. Aqui você controla os tokens de cada agente. **As permissões do agente (o que ele pode ver, criar, editar...) não ficam nesta tela.** A tela traz um aviso: elas serão configuradas em Usuários numa entrega futura; por enquanto o ajuste é feito pela equipe técnica, a pedido do dono.

---

## O que dá pra fazer aqui

- Ver cada agente: nome, selo **AGENTE**, se está ativo e quantos tokens ativos tem
- **Gerar novo token** (escolhe o nome e a validade: 30, 90, 180 dias ou 1 ano)
- **Rotacionar** o token: gera um novo e oferece revogar os antigos com um clique
- **Revogar** um token (o agente que usa esse token perde o acesso na hora)
- Ver o último uso de cada token (quando e de qual endereço), quantos usos teve e o limite por minuto
- **Novo agente**: cria um agente novo (ele nasce sem acesso a nada; as permissões são dadas em Usuários)

---

## Estados do token

| Estado | O que significa |
|--------|-----------------|
| Ativo (verde) | Funciona normalmente |
| Expira em N dias (amarelo) | Faltam 14 dias ou menos: use **Rotacionar** antes de vencer, para o agente não ficar sem acesso |
| Expirado (vermelho) | Passou da validade; o agente não entra mais |
| Revogado (cinza) | Você cancelou; não volta mais (só gerando outro) |

Tokens revogados ou vencidos ficam recolhidos em "Tokens revogados ou vencidos".

---

## Como fazer (passo a passo real)

### Gerar um token novo
1. Clique em **Gerar novo token** no cartão do agente
2. Dê um nome (para você reconhecer depois) e escolha a validade
3. Clique em **Gerar token**
4. O token aparece **uma única vez**. Clique em **Copiar token** e cole direto na configuração do agente
5. Só então feche a janela. **Depois de fechar não existe jeito de ver o token de novo**: se perder, gere outro
6. Nunca cole o token em conversa, e-mail ou WhatsApp

### Trocar o token sem deixar o agente parado (rotacionar)
1. Clique em **Rotacionar**, escolha nome e validade, **Gerar token**
2. Copie o novo token e coloque no agente
3. Quando o agente já estiver usando o novo, clique em **Revogar os antigos agora**

### Revogar um token
1. No token, clique em **Revogar** e confirme
2. Quem usa esse token perde o acesso imediatamente. Não dá para desfazer

---

## Regras e cuidados

- Só administrador abre esta tela; quem não é administrador vê "Acesso negado".
- O agente **nunca** pode ser administrador.
- **Ao revogar o token, as solicitações pendentes DESTE AGENTE são recusadas automaticamente: todas, não só as do token revogado.** O mesmo vale ao usar "Revogar os antigos agora" na rotação. A tela avisa quantas foram recusadas.
- Por segurança, o sistema guarda só uma "impressão digital" do token. Por isso ele não pode ser mostrado de novo.
- Se o token vazou ou foi colado onde não devia: **revogue na hora** e gere outro.
- O que o agente pede e precisa da sua autorização cai na tela **Solicitações do Luke** (veja o manual dela).

---

## Perguntas frequentes

**Perdi o token, como vejo de novo?** Não dá. Gere um novo e revogue o antigo.
**Onde mudo o que o agente pode fazer?** Hoje, por um técnico, a pedido do dono. Em uma entrega futura ficará em Usuários → (agente) → Permissões.
**O agente parou de funcionar de repente.** Veja se o token venceu ou foi revogado; gere um novo e coloque no agente.
