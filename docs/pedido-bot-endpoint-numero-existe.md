# Pedido ao bot da Ana — endpoint de consulta "esse número tem WhatsApp?"

**Para:** responsável pelo bot da Ana (Z-API)
**De:** CA-Hardt
**Data:** 25/08/2026

## Por que precisamos

Os vendedores estão cadastrando clientes sem número de WhatsApp — e quando o vendedor falta, o
escritório não consegue falar com os clientes dele para fazer os pedidos. O CA-Hardt vai passar a
**exigir o WhatsApp no cadastro do cliente**.

Só que obrigar o campo não basta: o vendedor pressionado digita qualquer coisa para passar da tela.
Precisamos conferir, **no momento do cadastro**, se aquele número realmente tem WhatsApp.

## O que estamos pedindo

Um endpoint de **consulta**, aditivo, que não mexe em nada do que já existe:

```
GET /api/integracao/numero-existe?telefone=5547999998888
Header: x-api-key: <a mesma chave que já usamos no /enviar>

→ 200 { "existe": true,  "telefone": "5547999998888" }
→ 200 { "existe": false, "telefone": "5547999998888" }
```

Por trás, é o `phone-exists` da Z-API — a mesma instância que o bot já usa.

## O que NÃO estamos pedindo (e por quê isso importa)

**Não queremos credencial Z-API própria.** Consideramos e descartamos: com token da Z-API na mão, o
CA-Hardt passaria a *poder* mandar mensagem por fora do bot, e isso quebraria a auditoria por `tipo`
que é justamente o que sustenta o acordo do primeiro contato. O número já foi banido uma vez — a
gente prefere continuar passando por vocês em tudo.

**Não vamos mandar mensagem para testar número.** Isso seria exatamente a automação em massa que
derrubou o número. É consulta, não envio.

## Enquanto o endpoint não existe

O CA-Hardt já está preparado: o código trata a ausência do endpoint (404), timeout ou erro de rede
como "não deu para verificar" e **salva o cadastro normalmente**, sem selo. Nada quebra, nada trava.
Quando vocês subirem o endpoint, a verificação passa a funcionar sozinha, sem deploy do nosso lado.

Prazo: sem urgência. As outras partes da mudança (campo obrigatório e relatório de pendências) já
resolvem o problema imediato.

## Pedido futuro (não é para agora)

Um **callback de status de entrega** — hoje sabemos apenas que o bot aceitou a mensagem, não que o
cliente recebeu. Com isso conseguiríamos marcar com segurança quais números o cliente realmente
atende. Deixamos anotado para conversar depois.
