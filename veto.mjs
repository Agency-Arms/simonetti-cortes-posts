// Veto pelo Telegram: quem aperta "Tirar da fila" na prévia tira o corte antes de ele sair (aprovado vira false).
// Roda a cada rodada do publicar, antes de publicar. Sem TELEGRAM_TOKEN, não faz nada.
import { readFileSync, writeFileSync } from "node:fs";

const T = process.env.TELEGRAM_TOKEN, CHAT = String(process.env.TELEGRAM_CHAT || "");
if (!T) { console.log("veto: sem Telegram configurado"); process.exit(0); }
const api = async (m, p = {}) => (await fetch(`https://api.telegram.org/bot${T}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) })).json();

const up = (await api("getUpdates", { allowed_updates: ["callback_query"], timeout: 0 })).result || [];
const fila = JSON.parse(readFileSync("fila.json", "utf8"));
const lista = Array.isArray(fila) ? fila : Object.values(fila).find(Array.isArray);
const publicados = JSON.parse(readFileSync("publicados.json", "utf8"));
let mudou = false, ultimo = 0;
for (const u of up) {
  ultimo = Math.max(ultimo, u.update_id);
  const q = u.callback_query;
  if (!q || String(q.message?.chat?.id) !== CHAT || !q.data?.startsWith("tirar:")) continue; // só o dono da conversa veta
  const cid = q.data.slice(6), item = lista.find((x) => x.id === cid);
  let resposta;
  if (!item) resposta = "Não achei esse corte na fila.";
  else if (publicados[cid]) resposta = "Esse já saiu no Instagram.";
  else { item.aprovado = false; item.vetado = new Date().toISOString(); mudou = true; resposta = "Tirado da fila. Não vai sair."; }
  await api("answerCallbackQuery", { callback_query_id: q.id, text: resposta });
  await api("editMessageCaption", { chat_id: q.message.chat.id, message_id: q.message.message_id, caption: `${resposta}\n\n${q.message.caption || ""}`.slice(0, 1000) });
  console.log("veto:", cid, resposta);
}
if (ultimo) await api("getUpdates", { offset: ultimo + 1, timeout: 0 }); // confirma o que já foi lido
if (mudou) writeFileSync("fila.json", JSON.stringify(fila, null, 1) + "\n");
console.log("veto: lido", up.length, mudou ? "· fila alterada" : "");
