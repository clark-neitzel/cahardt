---
aba: Conferir Carga (Motorista)
rota: /conferencia-motorista
permissao: Pode_Conferir_Carga_Motorista
---

# Conferir Carga (Motorista)

## O que é
Tela para o motorista **conferir, no celular, o que está no caminhão** antes de sair, com letra grande e **funcionando sem internet** (carga e toques ficam guardados no aparelho; ao fechar e abrir o app sem sinal, volta para a conferência). Cada produto mostra **LEVAR** (o que o pedido pede), **CONFERI** (o que você contou) e **FALTA**. A contagem é do zero: você **não vê o que a separação contou**; só aparece um aviso na linha quando a separação marcou falta ("Separação avisou: falta X").

O que se marca aqui **não muda** pedido, nota, estoque nem a carga, e **não bloqueia a entrega**. Nenhuma mensagem (WhatsApp) é enviada a ninguém.

## Quem pode usar
- Quem tem a permissão **Conferir Carga (Motorista)** (Administração → Usuários → Permissões, grupo Logística) e o administrador. Não exige acesso a Embarque, Pedidos nem Minhas Entregas.
- **Administrador** vê todas as cargas com pedido pendente de entrega; **os demais veem só as cargas em que são o motorista responsável**. Pedir/gravar carga de outro motorista é recusado ("Esta carga é de outro motorista").
- A lista traz cargas com data de saída de ontem em diante e ao menos um pedido ainda pendente; carga totalmente entregue some.

## Como fazer
1. Com internet, abra Logística → Conferir Carga (Motorista) (ou o botão **Conferir carga** em Minhas Entregas) e escolha a carga: ela é baixada para o aparelho.
2. Conte e toque: **+ / −** ou digite o número; **Conferi tudo** fecha a linha. Se faltar, escolha o motivo: **Não veio** ou **Vem depois**.
3. **Ficou faltando** lista o que ainda tem falta. Ao **Concluir**, o sistema avisa se sobrou linha sem tocar.
4. Sem sinal tudo fica guardado e é enviado sozinho quando voltar (sem duplicar). Dois aparelhos na mesma carga: vale o último toque de cada linha.

## Modos
- **Carga inteira**: soma de todos os pedidos por produto.
- **Por pedido**: um pedido por vez (ordem Da carga / Por cidade / Eu escolho). **Falta por cliente só existe neste modo.** Informe as **bolsas** (0 a 20) e imprima **Imprimir N etiquetas** ("BOLSA i de N") na impressora de etiqueta 100×120 (impressão só com a permissão; offline só em "Imprimir agora"). A contagem de bolsas é independente da feita na Separação (se os dois imprimirem, saem duas séries).

## Onde aparece o resultado
- **Embarque**: "Conferida por <nome> às HH:MM · N faltas" no card e no detalhe, ou o selo âmbar "Saiu sem conferência".
- **Minhas Entregas / Rota → Entregas**: "N bolsas" e "Faltou: …" no cartão do pedido (conferência por pedido).

## Perguntas comuns
- *Não vejo a carga*: você não é o motorista responsável por ela (só admin vê todas) ou todos os pedidos já foram entregues.
- *Não vejo o que a separação contou*: é de propósito, a conferência é independente.
- *Sem sinal e a tela não abre*: abra a tela e baixe a carga com internet antes de sair da cobertura.
- *Quero sair sem separar nada*: toque em **‹ Sair** (canto esquerdo da barra escura do topo, ou no alto da tela de escolher carga). A contagem já feita fica guardada no aparelho e os toques ainda não enviados sincronizam depois; nada é perdido.
