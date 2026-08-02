/* ==================================================================
   GazeWheel — proxy do assistente de ajustes (Cloudflare Worker)
   ------------------------------------------------------------------
   A chave da API fica AQUI, no servidor, nunca no site. Quem abre o
   teclado nunca vê a chave e não precisa ter conta em lugar nenhum.

   O Worker faz três coisas e nada mais:
     1. recusa pedidos que não vieram do gazewheel.org;
     2. limita quantos pedidos cada pessoa faz por dia (o custo não
        pode escapar num projeto que é de graça para quem usa);
     3. obriga o Claude a responder com um objeto de configuração —
        uma ferramenta com esquema fixo, não texto livre. O modelo não
        tem como devolver código, e o site confere tudo de novo antes
        de aplicar.
   ================================================================== */

const ALLOWED = [
  "https://www.gazewheel.org",
  "https://gazewheel.org",
  "https://cberbel.github.io"
];

const DAILY_LIMIT = 25;          /* pedidos por pessoa por dia */
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 400;

/* O esquema é o contrato. Tudo que o assistente pode mexer está aqui;
   o que não está aqui, ele não alcança. */
const TOOL = {
  name: "apply_settings",
  description: "Apply the requested keyboard settings. Only include the fields the person actually asked to change.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "One short sentence, in the person's language, saying what you changed. No greetings, no offers of further help."
      },
      theme:     {type: "string", enum: ["blue","red","green","purple","amber"]},
      light:     {type: "boolean", description: "Light background. Mutually exclusive with hc."},
      hc:        {type: "boolean", description: "High contrast (black and white). Mutually exclusive with light."},
      outer:     {type: "boolean", description: "Show the full alphabet on the outer ring."},
      dwell:     {type: "boolean", description: "Select by holding the cursor still, for eye trackers that cannot click."},
      autoSpeak: {type: "boolean", description: "Speak the sentence aloud when it ends with a full stop."},
      order:     {type: "string", enum: ["alpha","prob"], description: "Inner ring order: alphabetical, or by probability."},
      layout:    {type: "string", enum: ["wheel","qwerty"], description: "Round wheel or traditional grid."},
      scale:     {type: "number", description: "Wheel size, 0.45 to 1.15."},
      fs:        {type: "number", description: "Text size, 0.7 to 1.6."},
      rate:      {type: "number", description: "Speaking rate, 0.5 to 1.6."},
      dwellMs:   {type: "number", description: "Dwell time in milliseconds, 400 to 2500."},
      innerN:    {type: "number", enum: [0,4,5,6,8], description: "Letters on the inner ring; 0 means automatic."},
      abcOrder: {
        type: "array",
        items: {type: "string"},
        description: "A new order for the 26 letters on the outer ring, clockwise from the top. Must contain every letter a-z exactly once. Only send this when the person asks for a different arrangement."
      }
    },
    required: ["reply"]
  }
};

const SYSTEM = `You set up GazeWheel, a round on-screen keyboard used by people who cannot type with their hands and cannot speak. They point with their eyes, their head, or a slow pointer.

Every selection costs them real effort and several seconds, so: change what they asked for and nothing else, and answer in one short sentence. Never ask a follow-up question — they would have to type the answer letter by letter.

The wheel: the full alphabet sits on the outer ring, clockwise from the top. The likely next letters appear larger on the inner ring. The middle holds space, delete, speak and swap.

Judgement you are expected to use:
- "hard to see", "my eyes are tired", "too small" → bigger text and a bigger wheel, and consider high contrast.
- "I keep hitting the wrong letter", "it's twitchy" → a bigger wheel and fewer letters on the inner ring; if they use an eye tracker, a longer dwell time.
- "too slow", "it fires before I mean it" → shorter dwell time.
- "the room is bright", "the screen glares" → light background.
- Arrangement requests ("letters I use most near the top", "vowels together", "by frequency") → send abcOrder with all 26 letters, each exactly once. English frequency order is etaoinsrhldcumfpgwybvkxjqz; Portuguese is aeosridnmutcplvgqbfhzjxkwy. Alphabetical is the default because it is predictable and can be found without hunting — only change it when they ask.
- Anything you cannot do with these settings: say so plainly in one sentence.

Answer in Portuguese if the request is in Portuguese, otherwise in English.`;

function cors(origin){
  const ok = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "access-control-allow-origin": ok,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function json(data, status, origin){
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({"content-type": "application/json"}, cors(origin))
  });
}

/* Contagem por dia. Precisa de um KV chamado RATE; sem ele o Worker
   ainda funciona, só que sem limite — configure o KV antes de deixar
   o endereço público. */
async function overLimit(env, req){
  if(!env.RATE) return false;
  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${ip}`;
  const n = parseInt(await env.RATE.get(key) || "0", 10);
  if(n >= DAILY_LIMIT) return true;
  await env.RATE.put(key, String(n + 1), {expirationTtl: 172800});
  return false;
}

export default {
  async fetch(req, env){
    const origin = req.headers.get("origin") || "";

    if(req.method === "OPTIONS") return new Response(null, {status: 204, headers: cors(origin)});
    if(req.method !== "POST")    return json({reply: "POST only"}, 405, origin);
    if(!ALLOWED.includes(origin)) return json({reply: "not allowed"}, 403, origin);

    let body;
    try{ body = await req.json(); }
    catch(e){ return json({reply: "bad request"}, 400, origin); }

    const q = String(body.q || "").slice(0, 400).trim();
    if(!q) return json({reply: ""}, 200, origin);

    if(await overLimit(env, req)){
      return json({reply: body.lang === "pt"
        ? "Você já fez muitos pedidos hoje. Os botões dos Ajustes continuam funcionando normalmente."
        : "That is a lot of requests for one day. The Settings buttons all still work."}, 200, origin);
    }

    const current = JSON.stringify(body.cfg || {});
    let r;
    try{
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [{type: "text", text: SYSTEM, cache_control: {type: "ephemeral"}}],
          tools: [TOOL],
          tool_choice: {type: "tool", name: "apply_settings"},
          messages: [{role: "user", content: `Current settings: ${current}\n\nRequest: ${q}`}]
        })
      });
    }catch(e){
      return json({reply: ""}, 502, origin);
    }

    if(!r.ok) return json({reply: ""}, 502, origin);

    const data = await r.json();
    const use = (data.content || []).find(c => c.type === "tool_use");
    if(!use) return json({reply: ""}, 200, origin);

    return json(use.input, 200, origin);
  }
};
