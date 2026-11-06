// Responde por direct quem comenta a palavra-chave nos reels do @simonetti.cortes (API oficial, resposta privada).
// Regras da Meta: 1 mensagem por comentário, até 7 dias depois dele. Nunca manda direct pra quem não comentou.
//
//   node responder.mjs dry   mostra quem receberia, sem enviar
//   node responder.mjs run   envia (o cron chama este)
//
// Travas: arquivo PAUSAR na raiz para tudo. Arquivo DIRECT_LIGADO precisa existir pra enviar de verdade.
// Credenciais: variáveis de ambiente ou C:/Users/Mathe/.claude/secrets/ig-simonetti-cortes.env
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const FEITOS = join(RAIZ, "respondidos.json");
const LOG = join(RAIZ, "log.txt");
const API = "https://graph.facebook.com/v25.0";
const PALAVRA = /comunicador/i;
const DIAS = 7;
const MAX_POR_RODADA = 10;
const LINK = "https://comunicadoresportivo.com.br/?src=ig-cortes-dm&utm_source=instagram&utm_medium=dm&utm_campaign=simonetti-cortes";
const TEXTO = `Aqui está o link da Formação Comunicador Esportivo, do Felipe Simonetti: ${LINK}`;

const arquivoLocal = "C:/Users/Mathe/.claude/secrets/ig-simonetti-cortes.env";
const local = existsSync(arquivoLocal) ? Object.fromEntries(readFileSync(arquivoLocal, "utf8").split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};
const env = (k) => process.env[k] || local[k] || "";
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + "\n"); };

async function g(path, params = {}, method = "GET") {
  const body = new URLSearchParams({ ...params, access_token: env("PAGE_TOKEN") });
  const r = method === "GET" ? await fetch(`${API}${path}?${body}`) : await fetch(API + path, { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message} (code ${j.error.code})`);
  return j;
}

const cmd = process.argv[2];
if (existsSync(join(RAIZ, "PAUSAR"))) { console.log("pausado"); process.exit(0); }
const feitos = existsSync(FEITOS) ? JSON.parse(readFileSync(FEITOS, "utf8")) : {};
const limite = Date.now() - DIAS * 86400000;
const IG = env("IG_USER_ID");
const media = (await g(`/${IG}/media`, { fields: "id,timestamp", limit: "60" })).data || [];
const alvo = [];
for (const m of media) {
  if (Date.parse(m.timestamp) < limite) continue;
  const cs = (await g(`/${m.id}/comments`, { fields: "id,text,timestamp,username", limit: "100" })).data || [];
  for (const c of cs) {
    if (PALAVRA.test(c.text || "") && !feitos[c.id] && Date.parse(c.timestamp) > limite && c.username !== "simonetti.cortes") alvo.push(c);
  }
}
if (cmd === "dry") { console.log("comentarios com a palavra sem resposta:", alvo.length); process.exit(0); }
if (cmd !== "run") { console.log("Uso: dry | run"); process.exit(0); }
if (!existsSync(join(RAIZ, "DIRECT_LIGADO"))) { console.log("direct desligado, pendentes:", alvo.length); process.exit(0); }
for (const c of alvo.slice(0, MAX_POR_RODADA)) {
  try {
    feitos[c.id] = { em: new Date().toISOString(), status: "enviando" };
    writeFileSync(FEITOS, JSON.stringify(feitos, null, 2));
    await g(`/${IG}/messages`, { recipient: JSON.stringify({ comment_id: c.id }), message: JSON.stringify({ text: TEXTO }) }, "POST");
    feitos[c.id].status = "ok";
    log(`DIRECT ok comentario ${c.id}`);
  } catch (e) {
    feitos[c.id].status = "erro";
    log(`DIRECT erro comentario ${c.id} ${e.message}`);
  }
  writeFileSync(FEITOS, JSON.stringify(feitos, null, 2));
}
