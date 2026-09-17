# Ads Manager

Criar, publicar, pausar e acompanhar campanhas sem sair do NojAds — dentro do
que cada API oficial permite.

## Estado por plataforma

| Plataforma | Conector | Notas |
|---|---|---|
| Meta (Facebook + Instagram) | **Implementado** | Marketing API completa |
| TikTok Ads | Nao implementado | Estrutura pronta |
| LinkedIn Ads | Nao implementado | Estrutura pronta |
| Google Ads | Nao implementado | Estrutura pronta |
| X Ads | Nao implementado | Acesso a API e restrito |

O formulario so oferece plataformas com conector implementado **e** credenciais
presentes.

---

## Criar um anuncio

Um so ecra, seis passos, com pre-visualizacao e resumo financeiro sempre a
vista.

### 1. Plataforma e conta
So aparecem contas publicitarias reais, sincronizadas do Business Manager. A
moeda mostrada e a da conta — nao pode ser alterada por API.

### 2. Objetivo
Os objetivos ODAX que a Marketing API aceita hoje:

| Valor | Estado no NojAds |
|---|---|
| `OUTCOME_AWARENESS` | Disponivel |
| `OUTCOME_TRAFFIC` | Disponivel |
| `OUTCOME_ENGAGEMENT` | Disponivel |
| `OUTCOME_LEADS` | Disponivel |
| `OUTCOME_SALES` | Disponivel |
| `OUTCOME_APP_PROMOTION` | Nao implementado (exige configuracao de app) |

O que nao esta disponivel aparece desativado, com a razao. Nada foi inventado.

### 3. Criativo
Formato, texto principal, titulo, descricao, botao e URL. Os botoes sao os
valores literais que a Meta aceita (`LEARN_MORE`, `SHOP_NOW`, `WHATSAPP_MESSAGE`,
…).

A Meta exige uma **Pagina do Facebook** em todos os anuncios. A conta Instagram
e opcional e usada nos posicionamentos do Instagram.

A media anexa-se no Creative Studio. Sem media, a plataforma recusa o anuncio —
e o NojAds diz isso antes de tentar.

### 4. Publico
Paises, idades, genero. As dimensoes que a API oferece mas o NojAds ainda nao
envia — semelhantes e remarketing — aparecem listadas como *nao implementadas*,
em vez de desaparecerem em silencio.

### 5. Posicionamentos
Automatico (recomendado) ou manual. No manual, so os posicionamentos que a Meta
aceita e que o NojAds sabe enviar.

### 6. Orcamento
Diario ou total. O total exige data de fim — regra da propria Meta, validada
antes do envio. O resumo mostra a moeda da conta e uma estimativa do periodo.

---

## Publicar

Guardar cria a campanha **apenas no NojAds**. Publicar envia-a. Sao dois passos
distintos e a interface trata-os como tal.

```
1. validar campos
2. validar permissoes
3. validar a conta publicitaria
4. validar a faturacao (a conta pode gastar?)
5. validar limites de gasto do cliente
6. criar Campaign        → gravar id
7. criar Ad Set          → gravar id
8. criar Creative        → gravar id
9. criar Ad              → gravar id
10. estado local: PAUSED
```

**Tudo e criado EM PAUSA.** Publicar constroi a estrutura; so a accao Ativar,
feita por uma pessoa, comeca a gastar.

Se um passo falhar, os anteriores mantem os identificadores reais. Um novo
pedido continua de onde parou, em vez de criar objetos duplicados na plataforma.

Nenhum estado de sucesso e escrito sem a plataforma devolver um identificador.

---

## Gerir

Dentro do NojAds, quando a API permite:

| Operacao | Meta |
|---|---|
| Visualizar | Sim |
| Pausar | Sim |
| Retomar | Sim |
| Alterar orcamento | Sim |
| Alterar publico | Sim |
| **Alterar criativo** | **A Meta nao permite num anuncio publicado** |
| Duplicar | Nao implementado |
| Eliminar | Sim |
| Ler metricas | Sim |

Para mudar o criativo de um anuncio ja publicado e preciso criar um anuncio
novo. O NojAds diz isso em vez de oferecer um botao que falharia.

---

## Sincronizacao

**Alteracao feita na plataforma** → a tarefa de metricas le o estado e atualiza
o NojAds.

**Alteracao feita no NojAds** → chamada a API oficial → confirmacao → so entao o
estado local muda.

O estado da plataforma e mostrado ao lado do estado local sempre que diferem.

---

## Campanhas automaticas

Uma tarefa `AUTO_CAMPAIGN` prepara a campanha completa — objetivo, publico,
orcamento, criativo com copy gerada por IA — e para no portao de aprovacao.

Para publicar sozinha, tres condicoes ao mesmo tempo:

1. a tarefa em modo `AUTOMATIC`;
2. `autoPublish: true` na configuracao da tarefa;
3. "bloquear pagamentos automaticos" **desativado** nos limites do cliente.

Por omissao a terceira e verdadeira, por isso a campanha espera por si. Mesmo
publicada automaticamente, nasce em pausa.

---

## Otimizacao

A tarefa `OPTIMIZE_CAMPAIGNS` analisa CTR, CPC, CPM, conversoes e custo por
resultado dos ultimos 14 dias e produz um relatorio.

Recomendacoes que mexam em orcamento tornam-se **propostas com pedido de
aprovacao**, nunca alteracoes diretas. O limite `ai_max_budget_increase_pct` (0
por omissao) decide se a automacao pode sequer sugerir um aumento como
executavel.

Sem provider de IA configurado, a analise numerica continua a ser guardada — os
numeros valem mais do que nada.

---

## Limites da Meta que a interface mostra

- Categorias especiais (credito, emprego, habitacao, temas sociais ou politicos)
  restringem a segmentacao, por regra da propria Meta.
- Orcamento diario minimo indicativo: cerca de 1 USD.
- Orcamento total exige data de fim.
- Os valores viajam para a API em unidades menores (centimos); a conversao
  acontece num unico sitio no codigo, para nao haver erros de 100x.
