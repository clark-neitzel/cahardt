# Nota de entrega — API da IA v1.6.5: a Ana monta o catálogo de preços do cliente

**Data:** 19/09/2026 · **Veredito do gerente de entrega:** LIBERADO COM PENDÊNCIA

---

## O que mudou (em termos de uso)

Quando um cliente pedir "me manda a lista de preços" no WhatsApp, a **Ana** (a IA de atendimento)
passa a conseguir montar sozinha o **mesmo catálogo personalizado** que o vendedor monta na tela
Produtos → Catálogo, e mandar o link para o cliente.

- O link sai no domínio da marca: `https://hardtsalgados.com.br/lista/<código>` (não o endereço
  técnico do servidor).
- A Ana só monta catálogo para **cliente reconhecido pelo telefone** de quem está mandando a
  mensagem. Telefone desconhecido = nada é gerado.
- O preço usa a **condição de pagamento padrão do cliente** (ou outra, se a Ana informar uma válida).
- "Manda o catálogo inteiro" = todos os produtos ativos de venda ("Produto Acabado" e "Mercadoria
  para Revenda"), sem insumo, sem imobilizado.
- O catálogo fica registrado **em nome do vendedor do cliente** (não "Ana"), com título
  "Catálogo · Ana · <data>", e a geração fica gravada no histórico de auditoria.
- Se a Ana repetir a mesma chamada em até 10 minutos, o sistema devolve o catálogo que já existe em
  vez de criar outro.
- A Ana também consegue **reler** um catálogo pelo código e **listar** os catálogos ativos do cliente
  ("me manda de novo aquela lista").

Nada do que já existia na API mudou: são três endpoints novos, nenhum campo antigo foi alterado.

## O que foi testado e por quem

- **Revisor de código:** aprovado; os dois ajustes pedidos (domínio do link e explicação honesta
  sobre a proteção contra duplicata) foram aplicados e conferidos.
- **QA:** 9 de 9 chamadas da API passaram; a página pública `/lista/<código>` abriu certo no
  computador e em tela de celular (375px); código inexistente mostra mensagem amigável.
- **Gerente de entrega (conferência própria, backend local com banco de teste):**
  - sintaxe dos 6 arquivos de código verificada (`node --check`);
  - sem chave → 401; chave errada → 401;
  - gerar com `todos:true` → 54 itens, **zero** ferragem/insumo, link em `hardtsalgados.com.br`,
    vendedor do cliente no catálogo, condição "14 dias - Boleto", versão `1.6.5` no envelope;
  - repetir a chamada → devolveu o mesmo catálogo (`reaproveitado: true`);
  - reler pelo código → 54 itens; listar → 1 catálogo com o link certo;
  - telefone desconhecido → `reconhecido: false`; sem produtos → 400 `SEM_PRODUTOS`; condição
    inválida → 400 `CONDICAO_INVALIDA`; código inexistente → 404;
  - id do produto do site foi convertido corretamente para o produto do app;
  - banco: 2 catálogos + 2 registros de auditoria criados como esperado — **apagados depois**
    (banco local voltou a zero);
  - produção: `hardtsalgados.com.br/lista/...` responde (200) e a API pública do catálogo também.
- **Guia do bot** (`docs/api-ia-v1.6.5-para-o-bot.md`): endereço base correto, campos batem com o
  que a API devolveu de verdade, exemplos de `curl` para os 3 endpoints, **nenhuma chave nem dado do
  banco local** dentro do arquivo.

## O que o dono precisa fazer

1. **Publicar** (push → deploy do backend). Depois, conferir em 1 minuto que a versão nova está no ar:
   `curl -H "x-ia-api-key: <chave>" https://cahardt-github.xrqvlq.easypanel.host/api/ia-consulta/v1/status`
   e ver `"versaoApi":"1.6.5"` no `meta`.
2. **Mandar ao time do bot** o arquivo `docs/api-ia-v1.6.5-para-o-bot.md` + a chave
   (`IA_WHATSAPP_API_KEY`, a mesma que eles já usam — por canal seguro, nunca dentro do documento).
3. Pedir que eles testem um `POST /catalogo/gerar` com `todos:true` no telefone de um cliente real e
   abram o link recebido.

## Pendências (para o dono decidir — não fazem parte desta entrega)

**(a) Não existe tela "Meus catálogos" no app.** O sistema guarda os catálogos, mas nenhuma tela
lista, mostra as visualizações ou arquiva um catálogo — nem os do vendedor, nem os que a Ana gerar.
Ou seja: hoje o vendedor **não fica sabendo** que a Ana mandou uma lista de preços para o cliente
dele. Isso já era assim antes desta entrega (o backend de listar/remover existe, só falta a tela).
*Recomendação:* criar uma aba simples "Catálogos enviados" em Produtos → Catálogo (lista com data,
cliente, quem gerou, visualizações e botão "arquivar"). Tarefa pequena/média de frontend.

**(b) Catálogo não aplica promoção vigente.** O catálogo (do vendedor e da Ana) sai com o preço
cheio da condição; já o "reconhecer telefone" da Ana mostra o preço promocional. Se houver promoção
ativa, o cliente pode ver dois preços diferentes para o mesmo produto. Também pré-existente.
*Recomendação:* decidir se o catálogo deve mostrar a promoção (com validade) ou continuar sendo a
tabela cheia — e, se for mostrar, aplicar no `catalogoPersonalizadoService.criar` para vendedor e
Ana de uma vez.

**(c) Achado do gerente (baixo risco, correção de minutos):** quando a Ana manda `produtoIds`
explícitos, o filtro de "categorias de venda" **não** é aplicado — só o de ativo + vendável. No
teste, o id de uma abraçadeira (Material de Uso e Consumo) entrou no catálogo com preço. Na prática
a Ana só tem em mãos ids de produtos do site, então dificilmente isso acontece; mas o link é público.
*Recomendação:* aplicar em `resolverProdutoIds` o mesmo filtro de `categorias_vendas` que
`todos:true` já usa. Pode ir junto com o próximo ajuste da API.

**(d) Frase do manual do Clippy a corrigir** (`backend/manuais/abas/catalogo.md`, último
parágrafo): diz que os catálogos da Ana "aparecem misturados com os do vendedor na mesma
listagem/tabela". Como a listagem não existe (pendência a), a frase mente. Trocar por: "hoje não há
tela no app que liste os catálogos (nem do vendedor, nem da Ana); ficam gravados no banco e são
consultáveis pela API".

## O que ficou de fora

- Teste em produção com a chave real e um telefone de cliente verdadeiro — só o dono/time do bot
  consegue fazer depois do deploy.
- Nenhuma página de novidade foi criada: a mudança não é visível para a equipe no app (é API para
  o bot). Quando existir a tela "Meus catálogos", aí sim cabe anúncio no grupo.
