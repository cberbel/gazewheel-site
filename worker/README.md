# Assistente de ajustes — como ligar

O teclado funciona sem isto. Sem servidor configurado, a caixa "peça com
suas palavras" continua sendo interpretada dentro do navegador, como
sempre foi, e nada sai do computador.

Ligar o assistente troca esse interpretador por uma conversa curta com o
Claude, que entende pedidos fora do vocabulário fixo ("estou vendo mal",
"erro sempre a letra do lado", "põe as vogais juntas") e pode gerar
arranjos novos para o anel de letras.

## O que acontece com a chave

A chave da API fica no Worker, no servidor da Cloudflare. Ela nunca vai
para o navegador de ninguém. Quem usa o teclado não precisa de conta,
chave, nem cartão.

## Passo a passo

1. **Chave da Anthropic.** Em <https://console.anthropic.com> crie uma
   chave e defina um limite de gasto mensal (Settings → Limits). Um
   limite baixo, tipo US$ 5, é o suficiente e evita qualquer surpresa.

2. **Instale o wrangler e entre na sua conta:**

       npm install -g wrangler
       wrangler login

3. **Crie o Worker** a partir desta pasta:

       wrangler deploy worker/assistant-worker.js --name gazewheel-assistant

4. **Guarde a chave como segredo** (ela não fica no código, nem no git):

       wrangler secret put ANTHROPIC_API_KEY --name gazewheel-assistant

5. **Crie o KV do limite diário** e ligue ao Worker:

       wrangler kv namespace create RATE

   Copie o `id` que aparecer para um `wrangler.toml` com o binding
   `RATE`, ou faça o mesmo pelo painel: Workers → gazewheel-assistant →
   Settings → Variables → KV Namespace Bindings, nome `RATE`.

   Sem o KV o Worker funciona, mas sem limite de pedidos. Não deixe o
   endereço público nessa condição.

6. **Aponte o site para o Worker.** Em `assistant.js`, a primeira linha
   de configuração:

       const ENDPOINT = "https://gazewheel-assistant.SEU-SUBDOMINIO.workers.dev";

7. **Confira as origens permitidas** no topo de `assistant-worker.js`
   (`ALLOWED`). Só esses endereços conseguem usar o Worker — é o que
   impede outra pessoa de pendurar o custo na sua chave.

## Custo: a verba é de US$ 5 por mês

No Haiku 4.5 a entrada custa US$ 1 por milhão de tokens e a saída US$ 5.
Cada pedido gasta cerca de 1.400 tokens de entrada (o texto fixo e o
esquema, que vão em cache) e 90 de saída — algo perto de **US$ 0,002 no
pior caso**, menos quando o cache pega.

Três travas, uma dentro da outra:

1. **15 pedidos por pessoa por dia**, para ninguém sozinho consumir tudo.
2. **80 pedidos por dia no site inteiro** (`GLOBAL_DAILY`) — isso fecha a
   conta em torno de US$ 4,80 no mês. Estourando, o Worker responde como
   se estivesse fora do ar e o teclado volta a ser ajustado pelo
   interpretador local: ninguém fica sem ajustar nada.
3. **Teto de gasto no console da Anthropic**, que é o freio de verdade.

Se um dia o site crescer e 80 por dia virar pouco, o número está numa
linha só no topo do arquivo — é só decidir a nova verba e trocar.

O Cloudflare Workers cobre isto de sobra no plano gratuito (100 mil
requisições por dia).

## O que sai do computador

Só a frase escrita na caixa de ajustes e os ajustes atuais (cores,
tamanhos, tempo de pausa). O texto que a pessoa escreve no teclado, o
dicionário aprendido e as frases salvas não são enviados — não passam
nem perto desta função. A caixa avisa isso na tela quando o assistente
está ligado.
