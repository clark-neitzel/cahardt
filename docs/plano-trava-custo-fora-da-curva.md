# Plano: trava de "custo fora da curva" (Notas Recebidas e Contas a Pagar)

Pedido do dono em 20/10/2026. Decisões do gerente: referência = **mediana das últimas 5 compras válidas** (mensagem mostra a última compra e a data); aviso nas 3 rotas de nota (gerar-conta, registrar-entrada, corrigir-entrada-estoque) e nas 2 de despesa (POST / e PUT /:id/itens).

## 1. Regra
- **Custo fora da curva:** custo unitário resultante (valorTotal ÷ quantidade convertida) > 3× ou < 1/3 da referência → aviso, usuário pode "Confirmar mesmo assim".
- **Embalagem com fator 1:** unidade do fornecedor é de embalagem (CX, FD, PCT, BLD, SC...), nossa unidade é diferente e fator = 1 → aviso. Só na nota (despesa manual não tem unidade do fornecedor).
- Referência: mediana das últimas 5 `compras_itens` válidas (estornado=false, quantidade>0, custoUnitario>0, inclui semEstoque=true) do alvo (produtoId OU itemPcpId; alvo PCP soma as compras do produtoId espelho), excluindo a origem atual (notaEntradaId / contaPagarId). Fallback: Produto.custoManual > custoMedio; ItemPcp.custoUnitario → fonte 'CADASTRO'. Sem nada → referencia null → sem alerta de custo.
- Supressão de ruído do aviso de embalagem: se o alvo já tem compra válida com a mesma unidadeFornecedor e fator 1, não avisa.
- Fora da checagem: NFS-e, item "não é estoque", item sem destino, qtdConv ≤ 0, valorTotal 0 (bonificação). Produto criado na hora: só aviso de embalagem. Correção: só itens que mudaram vs antesAplicado. PUT /:id/itens: ignorar linha igual a compra ativa da própria despesa.

## 2. Arquitetura: híbrido (prévia + rede de segurança no POST)
- Helper único: `backend/services/custoForaDaCurvaService.js` — funções puras `normalizarUnidade`, `UNIDADES_EMBALAGEM`, `avaliarItem(...)` + `avaliarLote(itens, { excluirNotaId, excluirContaId })` com 3 consultas em lote (nunca 1 por item). Constantes no topo: razão 3, amostra 5, janela 540 dias. Cálculo idêntico a `notaEstoqueService.montarItensResolvidos` (qtd = round(q*fator,3); custo = valorTotal/qtd).
- A trava fica nas ROTAS, nunca nos services (adminExec e scripts chamam os services direto).
- Checagem só leitura, depois das validações existentes e ANTES de qualquer `$transaction`.

## 3. Contrato
**Prévia nota:** `POST /api/notas-entrada/:id/avaliar-custo` (checkAcesso). Body: mesmo `itens` do gerar-conta + `modo: 'GERAR_CONTA'|'ENTRADA_SEM_PAGAMENTO'|'CORRECAO'`. Quantidade/valor/unidade do fornecedor lidos do banco (NotaEntradaItem), nunca do cliente.
**Prévia despesa:** `POST /api/contas-pagar/avaliar-custo` (checkAcesso; declarar ANTES das rotas `/:id`). Body: `{ contaId?, itens:[{ vinculo, quantidade, valorTotal }] }`.
**Resposta:**
```
{ ok:true, temAlerta:boolean, alertas:[{
   chave,                      // itemId (nota) ou vinculo (despesa)
   descricao, tipo,            // 'CUSTO_ALTO'|'CUSTO_BAIXO'|'EMBALAGEM_FATOR_1'
   custoUnitario, unidade,
   referencia: { custo, fonte:'COMPRAS'|'CADASTRO', dataUltima, custoUltima, qtdAmostra } | null,
   razao, unidadeFornecedor, quantidadeFornecedor, quantidadeConvertida, fator,
   mensagem                    // pt-BR, montada no backend
}] }
```
Mensagens: `"R$ 124,09/kg. Última compra: R$ 9,52/kg (16/09). Confira quantidade e fator de conversão."` / `"Caixa com fator 1: 2 CX viraram 2 kg. Quantos kg tem cada caixa?"` / com fonte CADASTRO: "Custo atual do cadastro".
**Gravação (5 rotas)** aceitam `confirmarCustoForaDaCurva: true`. Sem flag e com alerta → **HTTP 409** `{ ok:false, codigo:'CUSTO_FORA_DA_CURVA', error, alertas }`. Nunca 400 (colide com itensPendentes). Com flag: grava e `console.warn('[CustoForaDaCurva] ...')` com item, razão e usuário.

## 4. Frontend
- `frontend/src/components/ModalCustoForaDaCurva.jsx` (props: alertas, onVoltar, onConfirmar, salvando): overlay `fixed inset-0 z-[100]`, um card por alerta, checkbox "Conferi quantidade e conversão" habilita o botão vermelho "Confirmar mesmo assim"; botão primário verde "Voltar e corrigir". **Enter NÃO confirma** (leitor de barras / iPad); Esc = voltar. Mobile: `max-h-[90vh] overflow-y-auto`, botões empilhados `min-h-[44px]`, sem scroll horizontal. Tema Starbucks.
- Hook `useConfirmarCustoForaDaCurva()` → `[modalElement, confirmarSeHouverAlerta(alertas): Promise<boolean>]`.
- Services: `notasEntradaService.avaliarCusto(id, payload)`, `contasPagarService.avaliarCusto(payload)`.
- `NotasRecebidasPage.jsx`: `gerar()`, `PainelRegistrarEntrada.registrar`, `corrigir()` — prévia antes do POST; se temAlerta abre modal; confirmou → POST com flag. No catch, 409 + codigo → abre modal e repete 1×. Falha da prévia (rede/500) NUNCA bloqueia.
- `ContasPagarPage.jsx` `salvar`: prévia ANTES do passo 1 (PUT /:id) quando `(!editando && itensCompra.length>0) || itensMudaram`; `contaId` na edição; flag no payload (criação) e em `atualizarItens` (edição).
- `npm run build` obrigatório; novidade-<slug>.html + novidades.json + texto WhatsApp.

## 5. Não fazer
Checagem dentro de services de estoque; 400; Enter confirma; confiar em qtd/valor do cliente na prévia da nota; 1 consulta por item; checagem dentro de $transaction; reutilizar `carregarCompras` dos indicadores; `<select>` nativo ou `window.confirm`; aviso em toast; mexer no schema Prisma.

## 6. Critérios de aceite (QA, no hardt_local)
1. APRESUNTADO: histórico ~R$ 9,52/kg; nota "2 CX" fator 1, KG, R$ 248,17 → modal com 2 alertas; nada gravado; Voltar mantém o formulário; corrigir fator → grava sem modal.
2. Confirmar mesmo assim: checkbox + botão → grava; log `[CustoForaDaCurva]`; Enter/Esc não confirmam.
3. CEBOLINHA 8215 KG → CUSTO_BAIXO. 4. CARNE MOÍDA 20 kg/R$ 2.550 ref 20 → CUSTO_ALTO. 5. Água 10 FD = 10 UN → embalagem.
6. Sem histórico e sem custo → sem alerta, grava direto; com custo de cadastro → "custo atual do cadastro".
7. Produto criado na hora, CX fator 1 → só embalagem. 8. Nota normal → sem modal, igual a hoje. 9. Nota de 20 itens, 3 ruins → 1 modal com 3 cards, 1 chamada de prévia.
10. registrar-entrada com fator errado → modal; confirmar soma estoque sem custo; valor 0 → sem alerta de custo.
11. Corrigir entrada: só item mexido gera alerta. 12. Contas a Pagar criação → modal antes de criar; Voltar não cria. 13. Edição (inclusive quitada): prévia antes do passo 1; cancelar não grava nada; só descrição → sem modal.
14. curl direto nas 5 rotas sem flag → 409 `CUSTO_FORA_DA_CURVA`; com flag → grava. 15. Prévia fora do ar → tela não trava, POST devolve 409 e o modal abre.
16. Permissões: 403 na prévia sem a permissão da tela. 17. iPad/375px: sem scroll horizontal, botões ≥ 44px. 18. `node tests/run.js` e `npm run build` passando.
19. Revisor: services de estoque e schema intocados; cálculo igual a montarItensResolvidos; checagem fora de transação; contrato igual nas duas pontas; permissões front=back.

## 7. Manuais / Clippy
Atualizar `backend/manuais/abas/notas-recebidas.md` e `contas-a-pagar.md`. Tabela ABAS não muda.
