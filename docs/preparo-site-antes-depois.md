# Preparo do catálogo de Congelados — antes × depois (16/09/2026)

Gerado com o módulo real `backend/services/iaProdutoSerializer.js` (`preparoLabelDeEtiqueta` + `preparoTipoDe`) contra os 51 produtos reais de `docs/produtos-site-catalogo-completo.json`. Decisão do dono: o rótulo de preparo do card do site/IA passa a vir da **etiqueta** do PCP (`EtiquetaProduto.modoPreparo`) quando ela permitir classificar com segurança; o texto por categoria (admin do site) vira reserva.

## Resumo

- **Total de produtos:** 51
- **Mudaram de SENTIDO** (preparo errado antes — ex.: "Somente Aquecer" numa etiqueta que manda fritar/assar): **25**
- **Mudaram só de TEXTO** (mesmo sentido, rótulo reescrito — ex.: "Precisa Fritar" → "Para fritar"): **23**
- **Sem mudança nenhuma:** **3**
- **Caíram no texto por categoria** (etiqueta ausente ou sem verbo reconhecido com segurança — reserva): **3**

## Tabela completa

| Código | Nome | Preparo ANTIGO | Preparo NOVO | Origem | O que mudou | Trecho da etiqueta que justificou |
|---|---|---|---|---|---|---|
| H22MI2 | FESTA-BOLINHA DE QUEIJO 22GR | Somente Aquecer | Para fritar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 3071 | CALZONE FRANGO C/ REQUEIJÃO 160gr | Precisa Assar | Para assar | ETIQUETA | só texto | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 3072 | CALZONE CALABRESA C/CHEEDAR 160gr | Precisa Assar | Para assar | ETIQUETA | só texto | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 3086 | DOGUINHO C/ 2 SALSICHA 220gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 3088 | ENROLADINHO DE FRANGO 140gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 5298 | MÉDIO COXINHA LINGUIÇA BLUMENAU FRITO 65GR | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 3272 | ENROLADINHO DE PIZZA 140gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 3333 | ESPETINHO FRANGO C/ BACON 120gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 8 minutos |
| 3728 | TORTINHA CAMARÃO 135gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 5200 | ENROLADINHO DE CALABRESA 140gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 3611 | TORTINHA FRANGO E REQUEIJÃO 130gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 4614 | TORTINHA CARNE 130gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 3609 | TORTINHA PALMITO 130gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 3073 | CALZONE CARNE C/ REQUEIJÃO 160gr | Precisa Assar | Para assar | ETIQUETA | só texto | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 3079 | EMPANADO SALSICHA 140gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 4765 | EMPADINHA DE FRANGO 32gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 5040 | EMPADINHA DE PALMITO 32gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 3051 | COXINHA FRANGO MASSA AIPIM G FRITO 130gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 4032 | TORTINHA FRANGO E PALMITO MASSA INTEGRAL 130gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos |
| 3065 | BOLINHO CARNE FRITO 150gr | Somente Aquecer | Somente Aquecer | CATEGORIA | sem mudança (reserva) | — |
| 5128 | MÉDIO BOLINHA DE QUEIJO 60GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos |
| 3070 | RISOLES DE PIZZA FRITO 140GR | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 5023 | MÉDIO COXINHA FRANGO MASSA AIMPIM FRITO 60GR | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 3063 | RISOLES DE CARNE G 140GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos |
| 3069 | RISOLES DE CARNE FRITO 140GR | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| 3078 | EMPANADO SALSICHA G 140GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 7 minutos |
| 5151 | COXINHA FRANGO C/ REQUEIJÃO GIGANTE 170GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 175ºC, por 4:30 minutos |
| 3062 | RISOLES DE PIZZA G 140GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos |
| 4826 | MÉDIO COXINHA FRANGO MASSA AIPIM 60GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos |
| 5296 | MÉDIO COXINHA LINGUIÇA BLUMENAU 65GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos |
| 4809 | MÉDIO CROQUETE CARNE 60GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos |
| 4824 | MÉDIO TRAVESSEIRO PIZZA 60GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos |
| H22MI4 | FESTA-COXINHA DE FRANGO 22GR | Somente Aquecer | Para fritar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| H22MI5 | FESTA-COXINHA DE LINGUIÇA BLUMENAU 22GR | Somente Aquecer | Somente Aquecer | CATEGORIA | sem mudança (reserva) | — |
| H22MI6 | FESTA-CROQUETE DE CARNE 22GR | Somente Aquecer | Para fritar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| H22MI8 | FESTA-TRAVESSEIRO DE PIZZA 22GR | Somente Aquecer | Para fritar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 17 minutos |
| 5182 | COXINHA FRANGO C/ REQUEIJÃO Gigante FRITO 170gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| H22MI3 | FESTA-CHURROS DOCE DE LEITE 22GR | Somente Aquecer | Somente Aquecer | CATEGORIA | sem mudança (reserva) | — |
| 1 | COXINHA FRANGO MASSA AIPIM G 130GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos |
| 3059 | COXINHA FRANGO TRADICIONAL G 130GR | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos |
| 3087 | HAMBURGÃO C/ CHEEDAR E CEBOLA 280gr | Somente Aquecer | Para assar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos |
| H22MI1 | FESTA-BOCADINHO DE PALMITO 22GR | Somente Aquecer | Para fritar | ETIQUETA | MUDOU DE SENTIDO | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 3081 | Mini Coxinha de Frango 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 5286 | Mini Coxinha Linguiça Blumenau 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 4091 | Mini Churros Doce de Leite 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 3082 | Mini Bolinha de Queijo 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 3084 | Mini Bocadinho Palmito 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 3972 | Mini Kibe Carne 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 5183 | Mini Salsicha 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 3083 | Mini Croquete de Carne 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos |
| 3085 | Mini Travesseiro Pizza 30gr | Precisa Fritar | Para fritar | ETIQUETA | só texto | Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 17 minutos |
