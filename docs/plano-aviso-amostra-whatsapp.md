# Plano — aviso no WhatsApp quando nasce uma amostra (11/11/2026)

Pedido do dono: "Quem recebe o aviso deve ser selecionado nas configurações do usuário."
Complementa `docs/plano-amostra-nao-esquecer.md` (commit 46ed0b15). Porte: média, toca WhatsApp → equipe completa.

## 1. Objetivo
Quando uma amostra nasce, mandar WhatsApp (tipo `interno`) a cada usuário ativo marcado em
Administração → Usuários com o flag novo `avisoAmostraWhatsapp`, exceto quem criou a amostra.
Best-effort: nunca bloqueia nem falha a criação.

## 2. Mapa do código (confirmado)
- Único `amostra.create` do backend: `backend/services/amostraService.js` → `criar` (linha ~33). Único chamador: `amostraController.js:11` com `solicitadoPorId: req.user.id`. Não há criação pela API da IA nem pelo site.
- Disparo: logo após `gcal.disparar(gcal.sincronizarAmostra, criada.id)`. `criada` já traz itens{produto}, solicitadoPor{nome}, cliente{NomeFantasia,Nome}, lead{nomeEstabelecimento,numero}, numero, dataEntrega, observacao. Cidade NÃO vem (`Cliente.End_Cidade`, `Lead.cidade`) → o service de aviso busca numa consulta própria; **não alterar o include/retorno de `criar`**.
- Padrão de envio: `backend/services/checklistAvisosService.js` (`destinatarios` ~29, `enviarParaTodos` ~124-146, `cortar`/`trunc` ~108). Não exporta → criar service novo copiando o padrão; não refatorar o checklist. `webhookService.enviarMensagemCustom` em `webhookService.js:459`.
- Schema: `Vendedor.alertaPedidoConvertido` em `schema.prisma:739`; campo novo logo abaixo.
- Usuários backend: `vendedorController.js:159` (desestruturação do PUT) e ~181 (`if (x !== undefined)`); listagem (linha ~18) é `findMany` sem select → flag chega à tela sozinho. PUT exige admin ou vendedores.edit.
- Frontend: `frontend/src/pages/Admin/Vendedores/ListaVendedores.jsx` — `handleToggleAlertaConvertido` ~56-66; botões desktop em `Acoes` ~207-212; mobile ~432-434.
- Manuais: `backend/manuais/abas/vendedores.md` (rota /admin/vendedores), `pedidos.md` seção Amostras (~232), opcional `embarque.md`. `BOOL_INDEX`/tabela `ABAS` não mudam.

## 3. Contratos
**Schema (dev-backend)** — em `Vendedor`, após `alertaPedidoConvertido`:
```
// Recebe WhatsApp quando uma amostra nova é criada (expedição/produção)
avisoAmostraWhatsapp Boolean @default(false) @map("aviso_amostra_whatsapp")
```
**vendedorController.js** — incluir `avisoAmostraWhatsapp` na desestruturação e
`if (avisoAmostraWhatsapp !== undefined) dataToUpdate.avisoAmostraWhatsapp = avisoAmostraWhatsapp === true;`

**Service novo `backend/services/amostraAvisoService.js`** — exporta `avisarNovaAmostra(amostra)`:
1. `prisma.vendedor.findMany({ where:{ ativo:true, avisoAmostraWhatsapp:true, id:{ not: amostra.solicitadoPorId } }, select:{ id,nome,telefone } })`; telefone com `soDigitos(...).length >= 10`, senão loga `[AvisoAmostra] <nome> sem telefone válido: pulado`.
2. Monta o texto uma vez (cidade via consulta própria).
3. Por destinatário: `webhookService.enviarMensagemCustom(d.telefone, d.nome, cortar(texto,1990), { tipo:'interno', origem:'amostra', referencia:`amostra-nova-${amostra.id}-${d.id}` })`; `require` do webhookService dentro da função; try/catch por envio. **Nunca `referenciaUnica`.**
4. try/catch externo com `console.error('[AvisoAmostra]', e.message)`; nunca lança; sem `$transaction`. Retorna `{ enviados, falhas }`.

**Disparo em `amostraService.criar`** (após o gcal, sem await):
```js
amostraAvisoService.avisarNovaAmostra(criada).catch(e => console.error('[AvisoAmostra]', e.message));
```

**Texto** (`AM#N`):
```
📦 *Nova amostra AM#58*
*Para:* Padaria Pão Quente — Blumenau
*Entrega:* 12/11   (ou "sem data")
*Pedida por:* João
*Itens:*
• 2 × Coxinha 30g
• 1 × Risoles
_+3 itens_          (acima de 5)
*Obs:* texto truncado em 120 caracteres
Ela já aparece em *Expedição → Cargas* (faixa Amostras fora de carga) e em *Pedidos → Amostras*.
```
Destinatário: `cliente.NomeFantasia || cliente.Nome`; senão `lead.nomeEstabelecimento` + " (lead)". Cidade só se existir; nunca interpolar `undefined`. Data pelo mesmo `diaEntrega` do amostraService (slice do ISO), formatada dd/mm; sem `toLocaleDateString` sem fuso. Item: `item.produto?.nome || item.nomeProduto`. Sem carimbo 🤖.

**Frontend `ListaVendedores.jsx`** — `handleToggleAvisoAmostra` (clone do toggle de pedido convertido; `vendedorService.atualizar(id, { avisoAmostraWhatsapp })`; toasts "Aviso de amostra nova ativado/desativado" / "Erro ao salvar aviso de amostra"). Botão novo ao lado do Repeat em desktop (`Acoes`) e mobile, classe `p-2 rounded-full hover:bg-gray-100`, ligado `text-teal-600`, desligado `text-gray-300`, ícone `Package` (ou `FlaskConical`) importado do lucide-react. Title "Aviso de amostra nova no WhatsApp: ligado/desligado"; se ligado e sem telefone, title avisa "sem telefone cadastrado: não receberá".

**Manuais e novidade** — `vendedores.md` (item + subseção curta), `pedidos.md` (parágrafo em Amostras), opcional `embarque.md`. `novidade-amostra-sem-esquecer.html`: accordion novo `acc aberto` "Aviso no WhatsApp" com mock da linha de Usuários (pin + legenda) e mock do balão do WhatsApp; passo em "Para começar a usar". `novidades.json`: só o `resumo` da entrada `amostra-sem-esquecer`.

## 4. Ordem
(a) dev-backend: schema + `prisma generate` + `db push` LOCAL (hardt_local) + controller + service + disparo.
(b) dev-frontend em paralelo: toggle + manuais + novidade + json; build.
(c) QA + revisor em paralelo → (d) gerente-entrega. Devs não commitam; `git add` explícito (árvore tem arquivos de outra sessão).

## 5. Riscos
1. `db push` em produção: coluna aditiva NOT NULL DEFAULT false — não bloqueia; conferir log do deploy.
2. Flag nasce desligado para todos → dono precisa marcar as pessoas (nota de entrega).
3. Usuário marcado sem telefone/inválido: pula e loga. Inativo: filtrado. Externo: escolha do dono.
4. Envio lento/falho: sem await; falha reagendável vai à fila com a MESMA referência.
5. Regra do bot: transacional, ato concreto. Várias amostras = várias mensagens; teto 200/h absorvido pela fila.
6. Idempotência: referência única por amostra+pessoa.
7. Criador excluído por `solicitadoPorId` (= req.user.id hoje).
8. Contrato da IA `/v1` não é tocado. Retorno de `criar` não muda.
9. Boy scout: conferir `$transaction` vizinhas do `amostraService.js` (timeout 20s/maxWait 10s).

## 6. Não fazer
Aviso dentro de transação ou com await no caminho do 201; `referenciaUnica`; tipo ≠ interno; remover campo; tela/rota/permissão nova; flag no `BOOL_INDEX`; `db push` em produção pelo dev; carimbo 🤖.

## 7. Roteiro de QA (local, hardt_local, sem BOT_WHATSAPP_URL → fila PENDENTE)
Preparação: `env | grep BOT_WHATSAPP` vazio. Usuários: U1 (cria), U2 (marcado, tel ok), U3 (tel ok, sem flag), U4 (marcado, sem tel), U5 (marcado, tel ok, inativo).
1. Admin → Usuários: ícone novo em todos, desligado, desktop e 375px sem scroll horizontal.
2. Ligar U1, U2, U4, U5; toast; recarregar → persiste; `SELECT nome, aviso_amostra_whatsapp, ativo, telefone FROM vendedores`.
3. Desligar/religar U2.
4. Como U1 criar amostra (cliente + 2 itens + entrega amanhã + obs) → 201.
5. `SELECT tipo, origem, referencia, status, telefone, left(texto,300) FROM bot_whatsapp_envios WHERE origem='amostra' ORDER BY created_at DESC` → 1 linha (U2), interno/amostra/`amostra-nova-<id>-<U2>`/PENDENTE; nenhuma para U1, U3, U4, U5. Log: U4 "sem telefone válido: pulado"; sem erro.
6. Texto: AM#N, destinatário, cidade, dd/mm, quem pediu, itens, obs, frase final; sem undefined/null; < 2000.
7. Borda: 8 itens + obs 500 chars → 5 itens + "+3 itens", obs truncada.
8. Lead sem cliente → nome + cidade do lead. 9. Sem data → "sem data".
10. Idempotência: duas amostras = duas linhas (refs diferentes); chamar `avisarNovaAmostra` de novo para a MESMA amostra (script node) → sem linha nova / duplicado.
11. Resiliência: ninguém marcado → 0 mensagens, 201; service lançando → 201.
12. Regressão: faixa em Cargas, Pedidos → Amostras, toggles antigos.
13. Evidências: SQL antes/depois, DOM/captura desktop e 375px, 201, log.

## 8. Checklist do revisor
Retorno de `criar` igual; sem await no 201; sem transação; try/catch `[AvisoAmostra]`; tipo/origem/referência determinística; texto ≤ 1990 sem undefined; criador excluído; telefone validado; ativo:true; schema aditivo com @map; controller `=== true`; nome do campo idêntico front/back; botão desktop E mobile; ícone importado (build ok); manuais + novidade (`acc aberto`, pins, sem "Abrir o app") + json válido; nenhum arquivo alheio no diff.

## 9. Aceite
Toggle persiste (desktop/mobile); criar amostra gera 1 linha por marcado ativo com telefone, nenhuma para os demais; criação nunca falha/atrasa; texto no contrato < 2000; idempotência comprovada; build passa; manuais/novidade atualizados; após deploy a coluna existe e o dono marca as pessoas.
