# Regras de BACKEND — CA-Hardt (banco, transação, upload, prova em produção)

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## Regras de Schema Prisma (NUNCA QUEBRAR O DEPLOY)

### Nunca remover campos do schema.prisma que já existem no banco

O deploy usa `prisma db push` (sem `--accept-data-loss`). Se um campo for removido do schema e a coluna ainda existir no banco, o Prisma recusa o push e o servidor **não sobe**.

**Errado — causa falha de deploy:**
```prisma
// Antes:
tipoFlex String @default("NORMAL") @map("tipo_flex")
// Depois (removido):
// (campo deletado do schema)
```

**Certo — manter o campo legado no schema:**
```prisma
tipoFlex     String  @default("NORMAL") @map("tipo_flex")  // legado — mantido para não dropar a coluna
flexPositivo Boolean @default(true) @map("flex_positivo")
flexNegativo Boolean @default(true) @map("flex_negativo")
```

**Regra:** ao substituir um campo por outro, **sempre manter o campo antigo** no schema com um comentário `// legado`. Só é seguro remover após confirmar que a coluna foi dropada manualmente no banco de produção.

Isso se aplica a qualquer campo que já existia em produção — mesmo que não seja mais usado no código.

---

## Regras de Transação Prisma (`$transaction`) — banco compartilhado é LENTO

O banco de produção é compartilhado e em horário de pico fica lento. O timeout padrão de uma transação interativa do Prisma é **5 segundos** — fácil de estourar quando a transação tem várias operações. Sintoma real: operação (ex.: dar baixa em parcela) **falha de forma intermitente e só funciona "na 2ª/3ª tentativa"** — é a transação dando timeout e fazendo rollback; ao repetir, uma hora o banco responde rápido o bastante e passa.

**Regras OBRIGATÓRIAS ao escrever qualquer `prisma.$transaction` com callback:**

1. **Sempre passar timeout generoso** — nunca confiar no padrão de 5s:
   ```js
   await prisma.$transaction(async (tx) => { /* ... */ }, { timeout: 20000, maxWait: 10000 });
   ```
2. **Dentro da transação, só o que é atômico de verdade** (o que precisa dar certo junto ou desfazer junto — ex.: criar o registro de pagamento + atualizar a parcela + atualizar a conta).
3. **Tirar da transação tudo que é secundário/log** (registro de `Atendimento`/histórico, notificação, webhook, etc.) e rodar **depois**, em `try/catch` próprio — um log lento ou que falha **nunca** pode derrubar nem fazer rollback da operação principal:
   ```js
   await prisma.$transaction(async (tx) => { /* crítico */ }, { timeout: 20000, maxWait: 10000 });
   try { await prisma.atendimento.create({ /* log */ }); }
   catch (logErr) { console.error('Falha no log (operação já efetivada):', logErr); }
   ```
4. **Nunca** colocar dentro da transação chamada de rede/API externa (Asaas, Focus NFe, bot do WhatsApp etc.) — só banco.

**Por que é crítico:** operação financeira (baixa, estorno) que falha silenciosamente por timeout faz o usuário clicar várias vezes achando que travou — e no pior caso registra duplicado se a lógica não for idempotente. Referência do padrão correto: `backend/routes/contasReceber.js` (rota `POST /:parcelaId/baixa`).

**Regra de "boy scout" (pedido explícito do usuário):** ao mexer em **qualquer arquivo que já tenha `$transaction`**, verificar as transações vizinhas do mesmo arquivo e ajustar as que não seguem este padrão (faltando `timeout`, ou com log/API externa dentro) — mesmo que não sejam o foco da tarefa. Não é preciso sair varrendo o projeto inteiro de uma vez; a correção acontece naturalmente conforme cada arquivo é tocado. (Em julho/2026 havia ~25 arquivos no backend usando `$transaction` — a maioria ainda no padrão antigo.)

---

## Regras de UPLOAD DE ARQUIVO (o arquivo TEM que sobreviver ao deploy)

Todo arquivo que o usuário anexa (PDF de boleto/NF, foto, XML, certificado) é gravado em disco no
container do backend. **Só `backend/uploads/` é persistido entre deploys.** Qualquer outro caminho
é apagado na próxima publicação — e o pior: **sem erro nenhum na hora**. O upload responde
"anexado com sucesso", o nome do arquivo aparece na tela, o banco guarda o caminho; o arquivo só
some depois, e o usuário descobre ao tentar abrir. Foi exatamente o que aconteceu com o PDF do
Contas a Pagar em 07/2026 — **14 documentos perdidos**, sem recuperação.

**Certo — sempre `../uploads` a partir de `backend/routes/` ou `backend/services/`:**
```js
const DIR = path.join(__dirname, '../uploads/contas-pagar');   // → /app/uploads/... (volume) ✅
```

**Errado — um nível a mais sai do app:**
```js
const DIR = path.join(__dirname, '../../uploads/contas-pagar'); // → /uploads/... (efêmero) ❌
```

No container o `WORKDIR` é `/app` e recebe o conteúdo de `backend/` — então `backend/routes/x.js`
vira `/app/routes/x.js`, e `../../uploads` cai em `/uploads`, **fora** do volume.

**Regras:**
1. Todo destino de upload usa `path.join(__dirname, '../uploads/<pasta>')`. Conferir contando os
   níveis a partir do arquivo onde a constante está declarada.
2. Ao criar upload novo, **grepar os destinos já existentes** (`grep -rn "uploads/" backend --include=*.js`)
   e seguir o mesmo padrão dos que já funcionam (`certificado`, `tarefas`, `notas-xml`).
3. Ao ler o arquivo, **nunca** confiar só no caminho gravado no banco: se não existir, devolver
   mensagem que explique ("o arquivo se perdeu, anexe novamente") em vez de um erro genérico.
4. **Testar DEPOIS de um deploy, não só localmente** (ver regra abaixo).

---

## REGRA — funcionalidade que grava no servidor só é "pronta" depois de testada EM PRODUÇÃO

Build passando e teste local **não provam** que uma função que grava arquivo, cria pasta ou depende
do ambiente do container funciona de verdade. Local roda fora do Docker, com outra árvore de
diretórios — o bug do PDF do Contas a Pagar **funcionava perfeitamente na máquina local** e só
falhava no servidor, no deploy seguinte.

**Antes de dizer ao usuário que está pronto**, para qualquer coisa que grave arquivo/pasta no
servidor ou dependa de caminho, env var ou volume:
1. Publicar (esperar o deploy concluir de fato — conferir que a versão nova está no ar, ex.: rota
   de diagnóstico respondendo, não 404).
2. Exercitar o fluxo completo **em produção**: gravar → **publicar de novo / reiniciar** → ler.
   O ciclo tem que incluir um deploy no meio, senão o teste não prova persistência.
3. Só então avisar que está pronto. Se não der para testar assim, **dizer isso ao usuário**
   explicitamente em vez de afirmar que está funcionando.

Vale o mesmo espírito da regra do build do frontend: não subir sem testar — aqui, "testar" quer
dizer **no servidor, atravessando um deploy**.
