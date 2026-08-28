# Impasto Moreira — Etapa 4: arquitetura de produção

Sistema completo, pronto para hospedagem, com a identidade visual da marca
(fundo marrom escuro, dourado e a logo enviada).

## Estilo Wabiz — pedido pelo WhatsApp, app instalável e QR Code

A pedido, o cardápio incorpora os três diferenciais centrais da Wabiz:

- **📲 Pedido direto pelo WhatsApp** — no checkout, se o WhatsApp do
  restaurante estiver configurado (painel → Configurações), aparece o botão
  "Confirmar e enviar pelo WhatsApp": o pedido é salvo no sistema e uma
  mensagem já formatada com os itens, endereço e total abre no WhatsApp do
  cliente, pronta para enviar. Sem comissão, sem intermediário.
- **📱 App instalável (PWA)** — o cardápio tem `manifest.json` e service
  worker; no celular do cliente aparece a opção de "Adicionar à tela
  inicial", ficando com ícone próprio (a logo enviada) como um app nativo.
- **🔗 QR Code e link para divulgação** — em Configurações, o admin vê o QR
  Code do cardápio pronto para colocar na mesa/embalagem e um botão para
  copiar o link.

## O que tem nesta etapa

- 🌐 Estrutura pronta para publicação (Dockerfile, docker-compose, .env)
- 🔐 Usuários e permissões: **admin**, **cozinha**, **atendimento**, com senha com hash (bcrypt) e login por JWT
- 🍕 Cardápio público (`/`) separado do painel (`/admin`)
- 🛒 Carrinho completo com checkout
- 📍 Endereço de entrega
- 🚚 Taxa de entrega por bairro (tabela `delivery_zones`)
- 🧾 Pedido completo (cliente, endereço, itens, pagamento, observações)
- 👨‍🍳 Painel da cozinha com atualização de status
- 🔄 Fluxo de status: Recebido → Preparando → Pronto → Saiu para entrega → Entregue / Cancelado
- 📦 Estoque integrado à ficha técnica (baixa automática ao iniciar o preparo)
- 💰 Financeiro integrado aos pedidos (receita lançada automaticamente a cada pedido)
- 📊 Relatórios: vendas por dia, produtos mais vendidos, receita por categoria, estoque baixo
- 📱 Interface responsiva (cardápio e painel)
- 🔒 Proteção da API: Helmet, CORS configurável, rate limiting geral + limite extra no checkout e no login, senhas com hash, JWT com expiração, permissões por papel em cada rota administrativa
- 🗄️ PostgreSQL com constraints, índices e schema idempotente

## Sobre "colocar no ar agora"

Este ambiente onde eu trabalho não tem acesso à internet nem às suas
credenciais de hospedagem — por isso eu não consigo publicar o sistema
sozinho. O que preparei aqui é o pacote completo, pronto para você (ou eu,
te guiando passo a passo) publicar em poucos minutos. Abaixo está o caminho
mais rápido.

## Passo a passo para publicar (≈15–20 min)

### 1. Banco de dados PostgreSQL
Use um provedor com camada gratuita, por exemplo **Neon** (neon.tech) ou
**Supabase** (supabase.com):
1. Crie um projeto/banco novo.
2. Copie a *connection string* (formato `postgresql://usuario:senha@host/banco`).
3. Rode o arquivo `database.sql` nesse banco (painel SQL do Neon/Supabase, ou
   `psql "SUA_CONNECTION_STRING" -f database.sql`).

### 2. Hospedagem da aplicação
Use **Railway** (railway.app) ou **Render** (render.com) — ambos fazem deploy
direto de um repositório Git com Dockerfile:
1. Suba esta pasta para um repositório no GitHub.
2. Crie um novo serviço "Web Service" apontando para o repositório (ele
   detecta o `Dockerfile` automaticamente).
3. Configure as variáveis de ambiente do serviço com os valores de `.env.example`:
   `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PGSSL=true`.
4. Faça o deploy.

### 3. Criar seu usuário administrador
Depois do primeiro deploy, rode uma vez (Railway/Render têm um "shell" do
serviço, ou rode localmente apontando para o mesmo `DATABASE_URL`):
```
ADMIN_NAME="Seu Nome" ADMIN_EMAIL="voce@seudominio.com.br" ADMIN_PASSWORD="senha-forte" npm run seed:admin
```
Pronto — acesse `https://SEU-DOMINIO/admin` e entre com esse e-mail e senha.

### 4. Domínio próprio
Na Railway/Render, adicione seu domínio em "Custom Domain" e aponte o DNS
(registro CNAME) conforme instruído por eles. Sem isso, o sistema já fica
acessível pela URL gratuita que a plataforma fornece (ex:
`impasto-moreira.up.railway.app`) — ou seja, dá para publicar e testar hoje
mesmo mesmo sem domínio próprio ainda.

### 5. Configurar o WhatsApp de pedidos
Como administrador, abra **Configurações** no painel e informe o WhatsApp do
restaurante (só números, com DDI+DDD, ex: `5511999998888`) e o nome do
restaurante. O botão de pedido pelo WhatsApp aparece automaticamente no
cardápio assim que o número for salvo — nenhum redeploy é necessário.

### 6. Cadastrar a equipe
Como administrador, use o menu **Usuários** no painel para criar os logins
de **cozinha** e **atendimento** — cada papel só vê e faz o que precisa.

## Testar localmente antes de publicar
Com Docker instalado:
```
docker compose up --build
```
Acesse `http://localhost:3000` (cardápio) e `http://localhost:3000/admin`
(painel). O banco de testes já sobe com os dados do `database.sql`.

Sem Docker:
```
cd server
npm install
# configure um .env local com DATABASE_URL, JWT_SECRET etc.
npm run seed:admin
npm start
```

## Ajustes antes de publicar de verdade
- Edite as linhas de `delivery_zones` em `database.sql` com os bairros e
  taxas reais da sua região.
- Revise nomes/preços do cardápio (tabela `products`) — os itens atuais são
  apenas exemplo, reaproveitados da Etapa 3.
- Troque `JWT_SECRET` por um valor gerado (veja `.env.example`).

## Preparado para a próxima etapa
O código já tem os pontos de extensão prontos para a próxima fase:
- `app.use('/api/integrations/*', ...)` no `server.js` — onde entram PIX,
  WhatsApp, impressão e notificações em tempo real.
- `orders.status` já tem todo o histórico em `order_status_history`, pronto
  para disparar eventos (WebSocket) a cada mudança.
- `finance_entries.order_id` já vincula cada pedido ao lançamento financeiro,
  facilitando conciliar com um gateway de pagamento (PIX) no futuro.
- Estrutura de `payment_method` já aceita "PIX" como opção no checkout — falta
  apenas conectar o gateway para gerar QR code e confirmar pagamento
  automaticamente.

## Papéis de acesso
| Papel | Acesso |
|---|---|
| **admin** | Tudo: dashboard, pedidos, cozinha, cardápio, estoque, financeiro, relatórios, usuários |
| **atendimento** | Pedidos (visualizar/atualizar status) e painel da cozinha |
| **cozinha** | Apenas painel da cozinha, só pode marcar "Preparando" e "Pronto" |

Nenhuma senha de demonstração é criada automaticamente — o primeiro acesso
sempre vem do `npm run seed:admin`, por segurança.
