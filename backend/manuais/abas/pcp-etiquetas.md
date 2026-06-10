# Etiquetas de Produtos (PCP)

## O que é
Sistema de impressão de etiquetas de embalagem dos produtos Hardt. Cada etiqueta contém informações nutricionais, composição, modo de preparo, alérgenos, código de barras e datas de fabricação/validade.

## Duas abas no PCP

### Etiquetas (`/pcp/etiquetas`)
Tela principal de uso em produção. Mostra todos os produtos ativos em cards (4 por linha, ordem alfabética).

**Como usar:**
1. Digite o nome ou código na barra de busca (filtro instantâneo)
2. Ou clique em um botão de categoria (pills abaixo da busca) para filtrar por grupo de produto
3. Clique no card do produto desejado — abre o modal de impressão
4. No modal: confirme ou altere a data de fabricação; a validade é calculada automaticamente
5. Ajuste o número de cópias (pode digitar diretamente ou usar os botões + / -)
6. Clique em **Imprimir** — o diálogo de impressão do Chrome aparece diretamente, sem abrir janela extra
7. Selecione a impressora ZDesigner ZT230 e imprima

**Tamanho da etiqueta:** 80mm × 100mm (8cm largura × 10cm altura)

### Dados Etiquetas (`/pcp/etiquetas/dados`)
Gerenciamento do cadastro. Permite criar, editar, ativar/inativar e remover etiquetas.

**Campos do formulário:**
- Código do produto, nome, peso unitário (g), peso da porção nutricional (g)
- Quantidade por embalagem + flag "Qtd. aproximada" (exibe "APROXIMADAMENTE X UNIDADES" na etiqueta)
- Código de barras EAN-13
- Tabela nutricional completa (valor energético, carboidratos, proteínas, gorduras, fibra, sódio)
- Composição / ingredientes
- Modo de preparo
- Armazenamento / conservação
- Alérgenos: leite, glúten, ovo, outros; aviso de traços
- Validade em dias (padrão 90)
- Vínculo com produto do catálogo (opcional, permite filtrar por categoria comercial)

## Etiqueta impressa contém
- Nome do produto (negrito grande)
- CÓD. + Peso unitário
- Tabela nutricional por porção
- Rodapé: "% Valores diários com base em 2.000 kcal"
- CONTÉM X UNIDADES (ou APROXIMADAMENTE X quando marcado)
- INGREDIENTES
- ALÉRGICOS + aviso de traços
- MODO DE PREPARO
- Conservação (FREEZER -12°C)
- Código de barras EAN-13
- Fabricação - DD/MM/AAAA · Validade - DD/MM/AAAA

## Permissão
Controlada por `pcp.etiquetas` no painel de permissões de Vendedores (seção PCP). Admin acessa automaticamente.

## Impressora
ZDesigner ZT230-200dpi ZPL — etiqueta 80mm × 100mm, margem 2mm.
