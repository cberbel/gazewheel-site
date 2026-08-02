/* ==================================================================
   GazeWheel — assistente de ajustes
   ------------------------------------------------------------------
   Melhora a caixa "peça com suas palavras" que já existe nos Ajustes.
   Sem servidor configurado, nada muda: continua valendo o interpretador
   local (applyCommand), que roda no navegador e não manda nada para
   lugar nenhum.

   Com servidor configurado, o pedido em texto livre vai para um proxy
   (Cloudflare Worker) que fala com o Claude e devolve SÓ um objeto de
   configuração. O que volta é conferido aqui, item por item, antes de
   ser aplicado: nada que venha de fora vira código, nunca.

   O que sai daqui: a frase que a pessoa escreveu na caixa de ajustes e
   os ajustes atuais (cores, tamanhos). O que NUNCA sai: o texto que a
   pessoa escreve no teclado, o dicionário aprendido, as frases salvas.
   ================================================================== */
(function(){
"use strict";

/* Endereço do proxy. Vazio = assistente desligado, só o interpretador
   local. Preencha depois de publicar o Worker (veja worker/README.md). */
const ENDPOINT = "";

const PT = /^pt/i.test(document.documentElement.lang || "");
const T = PT ? {
  wait:    "pensando…",
  off:     "não consegui falar com o assistente — usando o interpretador local",
  bad:     "não entendi o pedido. Tente dizer de outro jeito.",
  undo:    "desfazer",
  undone:  "voltei como estava",
  privacy: "Esta caixa manda o seu pedido para um servidor. O que você escreve no teclado e o seu dicionário não saem daqui.",
  local:   "Funciona sem internet: os pedidos comuns são entendidos aqui mesmo.",
  layout:  "arranjo novo aplicado",
  chips:   ["roda menor", "letras bem maiores", "fundo claro, azul",
            "põe as letras mais usadas perto do centro", "fala mais devagar",
            "seleção por pausa, 1,5 segundo", "arranjo em ordem de frequência"]
} : {
  wait:    "thinking…",
  off:     "couldn't reach the assistant — using the local interpreter",
  bad:     "I didn't get that. Try saying it another way.",
  undo:    "undo",
  undone:  "put back the way it was",
  privacy: "This box sends your request to a server. What you type on the keyboard and your dictionary never leave.",
  local:   "Works offline: the common requests are understood right here.",
  layout:  "new arrangement applied",
  chips:   ["smaller wheel", "much bigger letters", "light background, blue",
            "put the most used letters near the centre", "speak slower",
            "dwell selection, 1.5 seconds", "arrange by letter frequency"]
};

/* ---------- limites: iguais aos dos botões dos Ajustes ---------- */
const ABC = "abcdefghijklmnopqrstuvwxyz".split("");
const SCHEMA = {
  theme:     v => ["blue","red","green","purple","amber"].includes(v) ? v : null,
  light:     v => typeof v === "boolean" ? v : null,
  hc:        v => typeof v === "boolean" ? v : null,
  outer:     v => typeof v === "boolean" ? v : null,
  dwell:     v => typeof v === "boolean" ? v : null,
  autoSpeak: v => typeof v === "boolean" ? v : null,
  order:     v => ["alpha","prob"].includes(v) ? v : null,
  layout:    v => ["wheel","qwerty"].includes(v) ? v : null,
  scale:     v => num(v, 0.45, 1.15),
  fs:        v => num(v, 0.7, 1.6),
  rate:      v => num(v, 0.5, 1.6),
  dwellMs:   v => num(v, 400, 2500),
  innerN:    v => [0,4,5,6,8].includes(v) ? v : null,
  abcOrder:  v => perm(v)
};
function num(v, lo, hi){
  const n = typeof v === "number" ? v : parseFloat(v);
  if(!isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}
/* um arranjo só vale se for o alfabeto inteiro, cada letra uma vez:
   um teclado sem a letra "e" não é um arranjo criativo, é um defeito. */
function perm(v){
  if(!Array.isArray(v) || v.length !== 26) return null;
  const seen = new Set();
  for(const raw of v){
    if(typeof raw !== "string") return null;
    const c = raw.toLowerCase();
    if(!ABC.includes(c) || seen.has(c)) return null;
    seen.add(c);
  }
  return v.map(c => c.toLowerCase());
}

/* ---------- aplicar ---------- */
let lastCfg = null, lastOrder = null;

function applyOrder(order){
  if(typeof OUTER_ABC === "undefined") return false;
  OUTER_ABC.length = 0;
  Array.prototype.push.apply(OUTER_ABC, order);
  return true;
}

function applyResult(res){
  const patch = {}, names = [];
  for(const k in SCHEMA){
    if(!(k in res)) continue;
    const v = SCHEMA[k](res[k]);
    if(v === null || v === undefined) continue;
    if(k === "abcOrder"){
      lastOrder = OUTER_ABC.slice();
      if(applyOrder(v)){ patch.abcOrder = v; names.push(T.layout); }
      continue;
    }
    patch[k] = v; names.push(k);
  }
  if(!names.length) return false;
  lastCfg = Object.assign({}, cfg);
  if("layout" in patch && typeof LAYOUT !== "undefined") LAYOUT = patch.layout;
  setCfg(patch);
  return true;
}

function undo(){
  if(lastOrder){ applyOrder(lastOrder); lastOrder = null; }
  if(lastCfg){
    if(typeof LAYOUT !== "undefined" && lastCfg.layout) LAYOUT = lastCfg.layout;
    setCfg(lastCfg); lastCfg = null;
  }
  out(T.undone);
}

function out(msg, withUndo){
  const e = document.getElementById("cmdOut");
  if(!e) return;
  e.textContent = msg;
  if(withUndo && (lastCfg || lastOrder)){
    const b = document.createElement("button");
    b.className = "mini tgt";
    b.style.marginLeft = "10px";
    b.innerHTML = '<span class="fill"></span>' + T.undo;
    if(typeof bind === "function") bind(b, undo); else b.onclick = undo;
    e.appendChild(b);
  }
}

/* ---------- conversa com o proxy ---------- */
async function ask(q){
  const body = {
    q: q.slice(0, 400),
    lang: PT ? "pt" : "en",
    cfg: {theme:cfg.theme, light:cfg.light, hc:cfg.hc, scale:cfg.scale, fs:cfg.fs,
          innerN:cfg.innerN, outer:cfg.outer, order:cfg.order, dwell:cfg.dwell,
          dwellMs:cfg.dwellMs, autoSpeak:cfg.autoSpeak, rate:cfg.rate,
          layout: (typeof LAYOUT !== "undefined") ? LAYOUT : cfg.layout}
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try{
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if(!r.ok) return null;
    return await r.json();
  }catch(e){
    return null;
  }finally{
    clearTimeout(timer);
  }
}

async function handle(raw){
  const q = (raw || "").trim();
  if(!q){ if(typeof applyCommand === "function") applyCommand(""); return; }

  if(!ENDPOINT){ applyCommand(q); return; }

  out(T.wait);
  const res = await ask(q);

  if(!res){                      /* servidor fora do ar: o local assume */
    applyCommand(q);
    const e = document.getElementById("cmdOut");
    if(e && e.textContent) e.textContent += " · " + T.off;
    return;
  }
  const changed = applyResult(res.settings || res);
  const reply = (typeof res.reply === "string" && res.reply.trim())
              ? res.reply.trim().slice(0, 200)
              : (changed ? "✓" : T.bad);
  out(reply, changed);
  if(changed && typeof say === "function") say(reply);
  else if(!changed && typeof applyCommand === "function") applyCommand(q);
}

/* ---------- ligar na caixa que já existe ---------- */
function wire(){
  const box = document.getElementById("cmdBox");
  const go  = document.getElementById("cmdGo");
  if(!box || !go) return;

  /* bind() guarda o que fazer em el.__fn — trocar isso mantém o clique
     e a seleção por pausa funcionando exatamente como antes. */
  if(go.__fn) go.__fn = () => handle(box.value);
  else go.addEventListener("click", () => handle(box.value));

  const fromText = document.getElementById("cmdFromText");
  if(fromText && fromText.__fn) fromText.__fn = () => { box.value = (text || "").trim(); handle(box.value); };

  box.addEventListener("keydown", e => {
    if(e.key === "Enter"){ e.preventDefault(); e.stopImmediatePropagation(); handle(box.value); }
  }, true);

  /* sugestões clicáveis: quem escreve com os olhos não deve precisar
     digitar a frase inteira só para descobrir o que dá para pedir. */
  const row = document.getElementById("cmdRow");
  if(row && !document.getElementById("cmdChips")){
    const wrap = document.createElement("div");
    wrap.id = "cmdChips";
    wrap.style.cssText = "display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;";
    T.chips.forEach(c => {
      const b = document.createElement("button");
      b.className = "mini tgt";
      b.innerHTML = '<span class="fill"></span>' + c;
      const run = () => { box.value = c; handle(c); };
      if(typeof bind === "function") bind(b, run); else b.onclick = run;
      wrap.appendChild(b);
    });
    row.parentNode.insertBefore(wrap, row.nextSibling);

    const note = document.createElement("div");
    note.style.cssText = "margin-top:10px; font-size:13px; opacity:.75; line-height:1.45;";
    note.textContent = ENDPOINT ? T.privacy : T.local;
    row.parentNode.insertBefore(note, wrap.nextSibling);
  }
}

/* arranjo salvo de uma sessão anterior volta ao abrir */
function restore(){
  const saved = perm(cfg && cfg.abcOrder);
  if(saved && applyOrder(saved) && typeof render === "function") render();
}

if(document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", () => { restore(); wire(); });
else { restore(); wire(); }

})();
