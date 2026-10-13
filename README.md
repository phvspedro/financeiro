# Controle Financeiro

Sistema de controle de gastos no formato da planilha mensal: **Laravel 13** (API) + **React** (Vite + Tailwind) + **MySQL**, tudo em **Docker**.

## Subir com Docker

```bash
cp .env.example .env      # já existe um .env gerado com senhas aleatórias
docker compose up -d --build
```

Acesse **http://localhost:8080** (porta configurável em `APP_PORT` no `.env`).

Login: **admin@admin.com** / **admin101**. O login fica salvo no navegador até clicar em **Sair**.

Na primeira subida o banco é criado e recebe os dados da planilha de **agosto/2024**. Quando você abre qualquer mês novo, os itens fixos são copiados automaticamente.

## Como funciona

| Bloco | O que é |
|---|---|
| **Saídas** | contas do mês, com check de **pago**. O card "Falta pagar" soma o que ainda não foi pago |
| **Entradas** | clique no card **Entrada** no topo para abrir a tabela. Os itens marcados como fixos (🔁) formam o **Salário FIXO** |
| **Recorrentes Cartão** | Valor previsto × Real × Diferença |
| **Recorrentes PIX** | Valor previsto × Real × Diferença. Em amarelo = real ainda não lançado |

Totais (mesmas regras da planilha):

- **Final** = Entrada − Saída
- **Total Cartão** = soma do *valor previsto* do cartão
- **Total PIX** = soma do *real* do PIX
- **Salário − Custo** = Salário fixo − (Cartão + PIX)
- **Sobra (fixo + flex)** = Todas as entradas − (Cartão + PIX)
- **Total fixo mês** = itens fixos (🔁) dos recorrentes Cartão + PIX
- **Mínimo possível** = só os fixos **essenciais** (🔒), que não dá pra cortar (ex.: condomínio)
- **Dá pra cortar** = Total fixo − Mínimo (ex.: streaming)

### Abas em Recorrentes Cartão e PIX

Cada tabela tem abas que separam os itens pelo tipo: **Todos** (visão unificada), **Assinaturas** (no PIX: **Fixos**), **Parcelas** e **Gastos do mês** (avulsos). Cada aba mostra a quantidade de itens; o total no título da tabela acompanha a aba escolhida, e os totais do topo continuam somando tudo. A aba escolhida fica lembrada.

- **Gasto do mês que repete todo mês com valor variável** (gasolina, mercado, lanches): no menu do badge, escolha **Gasto do mês** e marque **Repete todo mês (o valor varia)**. O item fica na aba Gastos do mês (com um ↻ no badge), vem para os meses seguintes com o valor como estimativa e o Real zerado, **não entra no Total fixo nem no Mínimo**, e aparece no card de fixos como "Gastos variáveis previstos". Um gasto avulso mostra um ↻ discreto ao passar o mouse, para transformá-lo em variável.
- Na coluna **Tipo** aparece o **badge da categoria** do item (Assinatura / Fixo, Parcela, Gasto do mês), útil principalmente na aba **Todos**. Clique no badge para trocar a categoria e as parcelas.
- O ícone de fixo (↻) ou parcelado (calendário, com a parcela, ex.: 3/10) fica ao lado do cadeado; clicar nele abre o mesmo menu.
- **Adicionar…** numa aba cria o item já com o tipo dela (em Parcelas, começa em 1/2: ajuste no menu da coluna Tipo).
- Mudar o tipo de um item faz ele passar para a aba correspondente.
- **Real = prev.** e arrastar para reordenar valem só para os itens da aba aberta.

### Real preenchido nos fixos e assinaturas

Nos recorrentes do Cartão e do PIX, **gasto fixo e assinatura já têm o Real preenchido** (igual ao valor); o **amarelo** fica só para o que ainda falta lançar (parcelas, gastos do mês e gastos variáveis).

- Mês novo, replicação e itens novos: o fixo já vem com Real = valor.
- Mudou o valor de um fixo: o Real acompanha, a não ser que você tenha digitado um Real diferente (esse é respeitado).
- Transformou um item em fixo/assinatura: o Real em branco é preenchido. Se ele deixar de ser fixo e o Real era só esse preenchimento automático, volta a ficar em aberto.
- Para itens que já existiam, a atualização preencheu os fixos em branco **do mês atual em diante**; meses passados não são reescritos.

### Tipo de cada item: fixo, parcelado ou avulso

Na coluna **Tipo** (clique no selo):

| Tipo | Quando usar | Mês seguinte | Conta no Total fixo? |
|---|---|---|---|
| **Fixo** 🔁 | sempre preciso ter (condomínio, seguro do carro) | sempre vem. Se tiver parcelas (ex. seguro 10x), ao chegar em 10/10 volta para 1/10 (renovação) | sim |
| **Parcelado** 📅 | compra com prazo (TV, remédio parcelado) | vem até a última parcela e depois some | não, aparece no card **Parcelados (com prazo)** |
| **Avulso** | só neste mês | não vem | não |

O card **Parcelados** mostra quanto as parcelas pesam no mês, quanto ainda falta pagar e quando cada compra termina. O "falta pagar" só conta a parcela do mês atual se ela ainda não foi paga (check de pago nas Saídas; Real lançado no Cartão e PIX).

### Vencimento das Saídas

Coluna **Venc.** na tabela de Saídas. Digite só o dia (`10`, no mês que está na tela), `10/11` ou a data completa `10/11/2026`. Vazio (ou Delete) limpa; data inválida (`31/02`) não é aceita.

- **Vermelho:** atrasado (vencimento passou e não está pago). O título da tabela mostra "N vencidas".
- **Âmbar:** vence hoje ou nos próximos 3 dias.
- **Apagado e riscado:** já pago.
- Ao abrir um mês novo ou replicar, o vencimento vem junto no mesmo dia do mês (dia 31 num mês de 30 dias vira 30).
- Mudanças de data entram no histórico e podem ser desfeitas.

### Avisos e confirmações

Perguntas antes de ações que apagam ou desfazem em vários meses (excluir linha, "Voltar até aqui", desfazer uma replicação) e os avisos de sucesso/erro usam **SweetAlert2**. Esc fecha só a pergunta.

### Replicar o mês

Botão **Replicar mês**: faz uma **cópia do mês inteiro** (entradas, saídas, cartão e PIX; fixos, parcelados e avulsos) nos meses seguintes. Você escolhe **até qual mês** no calendário (ou pelos atalhos: só o próximo, 3 meses, 6 meses, até dezembro, 12 meses), e todos os meses entre o seguinte e o escolhido são preenchidos (até 24 meses).

- Os vencimentos vão para o mesmo dia de cada mês.
- As parcelas avançam sozinhas pela distância entre os meses: uma TV em 3/5 em agosto vira 4/5 em setembro e 5/5 em outubro, e não aparece em novembro. Um fixo parcelado (seguro em 10x) recomeça em 1/10 depois do 10/10.
- Por padrão o **Real** e o **pago** começam zerados nos meses novos; marque "Copiar também o Real e o pago" para levá-los junto.
- Itens com o mesmo nome e grupo que já existem no mês de destino não são duplicados; com "Atualizar os valores", eles recebem o novo valor.
- Tudo entra no histórico como uma única ação, que dá para desfazer de uma vez (mesmo atingindo vários meses).

### Desfazer, refazer e voltar atrás

- **Desfazer** (Ctrl+Z) e **Refazer** (Ctrl+Y) na barra acima das tabelas. A dica do botão diz o que vai ser desfeito. Dentro de um campo de texto, Ctrl+Z continua desfazendo a digitação.
- Cada ação do usuário é uma entrada no histórico: editar uma célula, marcar como pago, adicionar/excluir linha, mudar o tipo, **Real = prev.** (todos os itens de uma vez), trazer fixos, replicar. Exclusões guardam o item inteiro e voltam do mesmo jeito.
- No **Histórico**, cada entrada tem **Desfazer** (só aquela ação) e **Voltar até aqui** (desfaz tudo o que veio depois dela). Ações desfeitas ficam riscadas e têm **Refazer**.
- Segurança: só desfaz se o item ainda estiver como a ação o deixou. Se algo mudou depois, o sistema avisa e não altera nada ("desfaça primeiro as alterações mais recentes"), para nunca apagar uma edição mais nova.
- O desfazer também fica registrado no histórico (nada é apagado do log).
- Não entram no desfazer: reordenar linhas por arrastar e as anotações do mês. Quando o sistema abre um mês novo e já traz os fixos, isso aparece no histórico, mas não é desfeito pelo Ctrl+Z (só pelo botão da própria entrada), para um Ctrl+Z sem querer não limpar o mês.

### Mudou o tipo ou as parcelas? Vale para os meses seguintes

Um mês novo copia os itens do anterior na hora em que é criado; meses que já existem ficam com a versão antiga. Por isso, ao salvar uma mudança de tipo ou de parcelas no menu da coluna **Tipo**:

- **Com parcelas informadas** (ex.: Parcelado 1/6): aplica **direto, sem perguntar**, levando também o valor (as parcelas valem o mesmo). Os meses seguintes que já existem são ajustados (2/6, 3/6…), e se as parcelas passarem do último mês existente, **os meses que faltarem são criados, um a um, até o mês da última parcela**, sempre a partir do último mês já criado (com os fixos e parcelados dele).
- **Sem parcelas** (virou fixo ou avulso): pergunta antes, porque o item pode sair de outros meses.
- Botão **Aplicar aos próximos meses…** no mesmo menu: aplica na hora, a qualquer momento.
- Depois da última parcela o item é removido dos meses seguintes. Um fixo parcelado (seguro em 10x) recomeça em 1 e não cria meses novos.
- Entra no histórico como uma só ação e dá para desfazer (Ctrl+Z); os itens removidos voltam. Meses criados por essa ação continuam existindo, vazios, se você desfizer (use **Trazer fixos do mês anterior** para preenchê-los).

### Histórico e mudanças

- Botão **Histórico**: lista tudo o que foi alterado no mês (valor de → para, pago, tipo, parcelas, itens criados/excluídos), com data e hora. Ações que mexem em vários itens (Real = prev., replicar) aparecem agrupadas.
- Nas células de valor, uma **seta** indica que o valor mudou em relação ao mês anterior (passe o mouse para ver quanto). Um **ponto azul** indica item novo no mês.

### Fixos

- Em Entradas, o ícone 🔁 marca a entrada como fixa (Salário FIXO).
- Ícone 🔒 (Cartão e PIX, só em itens fixos): marca como **essencial**, ou seja, não dá pra cortar. Sem cadeado = cortável.
- Ao abrir um mês pela primeira vez, ele já vem com os fixos e parcelas do mês anterior. O botão **Trazer fixos do mês anterior** busca o que você tiver adicionado depois, sem duplicar.

### Edição estilo Excel

- Clique duas vezes, aperte **Enter**/**F2** ou simplesmente comece a digitar.
- **Enter** salva e desce, **Tab** vai para a direita, **setas** navegam, **Esc** cancela, **Delete** limpa.
- Valores aceitam `1.234,56`, `2.000`, `R$ 99,90` e contas: `540+60`, `=1600/2`.
- Linha **Adicionar…** no fim de cada bloco: digite o nome e aperte Enter, e o cursor já vai para o valor.
- Arraste pela alça ⋮⋮ (à esquerda da linha) para reordenar.

A aba **Ano** mostra o gráfico de Entradas × Saídas e a tabela com os 12 meses (clique num mês para abrir).

## Estrutura

```
docker-compose.yml   db (mysql 8.4) · api (php-fpm 8.4) · web (nginx + React build)
backend/             Laravel: app/Models/{Mes,Lancamento}, app/Services/MesService.php, routes/api.php
frontend/            React: src/pages/{Planilha,Anual,Login}.tsx, src/components/{Grade,Celula,Resumo}.tsx
```

## Testes

```bash
cd backend && php artisan test     # desfazer/refazer, conflitos, replicar e parcelas
```

## Desenvolvimento sem Docker

```bash
cd backend && php artisan migrate --seed && php artisan serve      # API em :8000 (SQLite)
cd frontend && npm install && npm run dev                          # http://localhost:5173
```
