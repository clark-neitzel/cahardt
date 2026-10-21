# Nota de entrega — F1: vários anexos no Contas a Pagar

Gerente de entrega, 21/10/2026. Veredito: **LIBERADO PARA COMMIT/DEPLOY, com pendências que só se provam em produção** (seção 5).

---

## 1. O que muda para o escritório

- **Cada despesa do Contas a Pagar aceita vários arquivos**, não mais só 1 PDF: PDF, foto (JPG, PNG, WebP) e XML. Até 10 por vez, 30 MB cada. Foto tirada do celular é reduzida sozinha antes de subir.
- **Cada arquivo tem um tipo** (Comprovante, Nota fiscal, Boleto, Contrato ou Outro) e mostra **quem anexou e quando**. O tipo pode ser trocado depois.
- **Abrir é dentro do app**: foto em tela cheia (com zoom), PDF e XML numa janela própria. Nada abre em aba externa.
- **Selo na lista** mostra quantos anexos a despesa tem (no computador e no celular).
- **Na hora de dar a baixa**, a faixa "Documento" continua lá: "Ver documento" abre o anexo (se for só um) ou a lista (se forem vários).
- **Aviso de repetido**: se o mesmo arquivo já foi anexado (nesta ou em outra despesa), aparece um aviso amarelo — mas o anexo é salvo normalmente.
- **Quem pode fazer o quê** (igual no app e no servidor):
  - ver e abrir: quem acessa o Contas a Pagar (`Pode_Acessar_Contas_Pagar`);
  - anexar, trocar tipo e remover: quem pode dar baixa no Contas a Pagar (`Pode_Baixar_Contas_Pagar`);
  - remover: só quem anexou ou o administrador. O PDF antigo (sem autor registrado) pode ser removido por quem tem permissão de escrita.
- **O PDF antigo continua funcionando**: aparece como o primeiro anexo da despesa, o campo antigo não foi tocado, e a rota antiga de PDF segue no ar (dupla escrita: o que entra por ela aparece nos anexos e vice-versa).
- **Nada do financeiro muda**: baixa, estorno, DRE, caixa, conciliação — intocados. Só o relatório da Contabilidade passa a marcar "com anexo" também quando a despesa tem só foto/XML (antes só contava o PDF).

## 2. Segurança (o que ficou mais fechado)

- Os anexos **só abrem com login e permissão** (rota autenticada). Não existe endereço público.
- Os PDFs antigos do Contas a Pagar, que até hoje podiam ser baixados por URL direta `/uploads/contas-pagar/...` (não adivinhável, mas pública), **passam a devolver "Acesso negado"** por esse caminho. Conferi em todo o repositório (frontend, backend, nginx, e-mails, WhatsApp, manuais/Clippy, relatórios): **ninguém gera nem usa essa URL** — o app sempre abriu o PDF pela rota autenticada. O bloqueio não quebra nada.
- O servidor **confere o conteúdo** do arquivo, não a extensão: programa renomeado para `.pdf` é recusado; PDF disfarçado de imagem é recusado; XML com script/HTML/entidades externas (XXE) é recusado; XML aceito sai com cabeçalho que impede execução no navegador.
- Nome de arquivo malicioso (`../../`, aspas, quebra de linha, `<img onerror>`) não sai do lugar nem contamina cabeçalhos; nome com acento é preservado.
- Nenhum segredo (token, senha, chave) entrou no repositório.

## 3. O que foi testado e por quem

- **QA (clicando na tela, app local + navegador automatizado)**: 62+ casos — anexar PDF + 2 fotos + XML na mesma despesa, abrir cada um, trocar tipo, remover com confirmação, recarregar; PDF antigo aparecendo como anexo e abrindo pela tela antiga; backfill rodado 2x sem duplicar; `.exe` renomeado recusado; 31 MB com erro claro; 11 arquivos recusados; perfil limitado (sem `Pode_Baixar_Contas_Pagar`) vê e abre mas não anexa/remove, no app E no servidor; perfil "Producao" sem acesso recebe 403; `/uploads/anexos` e `/uploads/contas-pagar` direto = 403; pasta de uploads apagada com o servidor no ar (recria sozinha); arquivo compartilhado entre despesas só some do disco quando o último anexo é removido; baixa e estorno de parcela com anexos; 375 px (iPhone) e 1440 px sem scroll horizontal. Capturas e saídas em `docs/checklist-veiculo/evidencias-qa-f1/`.
- **Revisor de código**: 2 rodadas, aprovado.
- **Gerente de entrega (eu), em worktree isolado só com os arquivos desta entrega**: build do frontend passou (`✓ built in 5.87s`); `node --check` nos 6 arquivos de backend; `prisma validate` ok (schema válido); `require` de `anexoService`, `routes/anexos`, `contasPagar`, `contabilidadeRoutes`, `adminExec`; `index.js` subiu e montou as rotas — `/api/anexos/x/arquivo` sem token = 401, `/api/contas-pagar/x/anexos` sem token = 401, `/uploads/anexos/...` = 403, `/uploads/contas-pagar/...` = 403.
- **Ressalva do QA que eu mesmo provei de novo** (a pasta de evidências tinha só o "antes"): despesa com PDF antigo cujo arquivo sumiu → ao abrir a lista ganha 1 anexo legado marcado "Arquivo não encontrado no servidor" (`arquivoDisponivel:false`, tamanho 0); abrir devolve 404 "O arquivo deste anexo não está mais no servidor… Anexe o documento novamente"; abrir a lista de novo não duplica; a listagem mostra `qtdAnexos: 1`; remover esse anexo zera o campo antigo (`pdfPathZerado: true`). Banco local, dados de teste, tudo limpo depois.
- **Checklist do projeto conferido**: upload em `../uploads/anexos` a partir de `services/` (pasta persistente; `mkdir` na hora do upload, não só no boot); as 7 transações vizinhas de `contasPagar.js` já têm `timeout: 20000, maxWait: 10000`; schema só aditivo (tabela nova `anexos`; **nenhuma coluna nova em `contas_pagar`**); permissões iguais no app e no servidor; manual do Clippy (`contas-a-pagar.md`) atualizado; página de novidade com accordions abertos, mockups com legendas numeradas, `og:title`/`og:description` sem `og:image`, sem botão "Abrir o app".

## 4. O que o dono precisa fazer ou conferir

1. **Depois do deploy, o `prisma db push` cria a tabela `anexos`** (só adiciona; não mexe em nenhuma tabela existente). Conferir que o backend subiu.
2. **Rodar o backfill do PDF antigo** (espelha cada PDF já anexado na tabela nova; não move nem copia arquivo). **Sem parâmetro ele só simula** — primeiro ver o relatório, depois gravar em lotes:
   ```bash
   S=$(cat backend/scripts/.admin-secret)
   B=https://cahardt-github.xrqvlq.easypanel.host/api/admin-exec/anexos-migrar-pdf-contas-pagar
   curl -s -X POST -H "x-admin-secret: $S" "$B"                       # simulação: contasComPdf, aMigrar, sumiram
   curl -s -X POST -H "x-admin-secret: $S" "$B?gravar=1&limite=200"   # grava 200; repetir até restantes = 0
   ```
   (`?dry=1` sempre vence `?gravar=1`. Rodar de novo não duplica.)
3. **14 despesas em produção têm o PDF perdido** (arquivo apagado num deploy antigo, antes da regra da pasta persistente). Elas vão aparecer com 1 anexo marcado **"Arquivo não encontrado no servidor. Anexe novamente"** — na primeira vez que alguém abrir a despesa ou no backfill (campo `contasComArquivoSumido` da resposta lista quais são). O que fazer: abrir cada uma, remover o anexo perdido e anexar o documento de novo, se ainda tiver o arquivo.
4. **Testar anexar uma foto pelo celular** (Contas a Pagar → abrir uma despesa → Anexos → Adicionar arquivos → tirar foto). Um minuto. É a parte que só se prova em aparelho real.
5. **Prova de persistência em produção** (regra do projeto para tudo que grava arquivo): anexar um arquivo → publicar de novo → abrir o arquivo. Vai ser feita pelo gerente de projeto após o deploy e registrada na seção 7.

## 5. Pendências e o que ficou de fora

- **Prova em produção** (anexar → novo deploy → abrir): pendente, só após o deploy.
- **Teste em aparelho real** (foto do celular/iPad): pendente, dono.
- **F2** — foto do cupom na despesa do motorista, com leitura por IA (marca e avisa, não trava).
- **F3** — lançar a despesa do motorista no Contas a Pagar (criar ou vincular à conta já lançada), já quitada na Caixinha.
- **F4** — painel "Despesas do dia" na conferência do Caixa e relatório.
- **F5** — trava no fechamento do Caixa (por chave, desligada por padrão).
- **Decisões do dono ainda abertas** (seção 8 do plano `PLANO-despesas-anexos.md`): lançamento automático ou pelo escritório; nomes das categorias padrão por tipo de despesa (e o que fazer com "Mercadoria para a empresa"); fornecedor opcional; retroativo (sugestão: não); quais despesas exigem foto; retenção de 5 anos; despesa lançada bloqueia edição do motorista; "vincular a conta existente" quando o escritório já lançou.
- Fora desta entrega e **não devem entrar no commit**: tudo da fatia 3A do checklist (volta/pendências/diário), as mudanças de outras sessões (`entregas.js`, conversão de pedido, conciliação, `CheckoutEntregaModal`, manuais de conciliação/minhas-entregas/notas-fiscais/pedidos/caixa, `novidade-pix-vira-nota.html` e sua entrada no `novidades.json`), `backend/tok.json`, `backend/uploads/*` (inclusive a remoção acidental de `backend/uploads/contas-pagar/.gitkeep`, que deve ser restaurada com `git checkout -- backend/uploads/contas-pagar/.gitkeep`).

## 6. Texto para o grupo do WhatsApp

```
📎 *Contas a Pagar: agora cabem vários anexos na mesma despesa*

Boleto, nota, foto do comprovante, contrato, XML — tudo junto na despesa, com tipo e quem anexou. Abre dentro do app, no computador e no celular.

✅ Vários arquivos por despesa (PDF, foto, XML)
✅ Selo na lista mostra quantos anexos tem
✅ "Ver documento" na hora de pagar continua
✅ O PDF que já estava lá continua lá
🔒 Só abre com login — nada fica público

Veja as telas e como usar:
https://cahardt-github.xrqvlq.easypanel.host/novidade-anexos-contas-pagar.html
```

## 7. Prova em produção

_(preencher após o deploy: data/hora, despesa usada, arquivo anexado, deploy seguinte confirmado por `deployMarker`, arquivo aberto depois — sim/não, resultado do backfill `dry` e `gravar`, quantas das 14 contas perdidas foram reanexadas.)_
