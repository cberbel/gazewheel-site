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

## Custo

Cada pedido são algumas centenas de tokens de entrada e uma resposta
curta, no Haiku, com o texto fixo em cache. Dá algo perto de US$ 0,001
por ajuste — mil ajustes por mês ficam em torno de um dólar. O limite
diário por pessoa e o teto de gasto no console seguram o resto.

O Cloudflare Workers cobre isto de sobra no plano gratuito (100 mil
requisições por dia).

## O que sai do computador

Só a frase escrita na caixa de ajustes e os ajustes atuais (cores,
tamanhos, tempo de pausa). O texto que a pessoa escreve no teclado, o
dicionário aprendido e as frases salvas não são enviados — não passam
nem perto desta função. A caixa avisa isso na tela quando o assistente
está ligado.
