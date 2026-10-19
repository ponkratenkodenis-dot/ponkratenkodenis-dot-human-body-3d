// Command layer: every action on the body is a small JSON object, so any AI (or a script, or a button) can drive it.
// run(cmd) accepts one command, an array of commands, a JSON string, or a short Russian/English phrase.
import { PRESETS, POSE_KEYS, LAYERS } from "./body.js";
import { VERTEBRAE } from "./names-ru.js";

export const COMMANDS = {
  pose:      { desc: "Готовая поза. preset: " + Object.keys(PRESETS).join(", ") + "; amount 0..1 (насколько сильно).", args: { preset: "string", amount: "number?" } },
  set:       { desc: "Точная поза в градусах. Ключи: " + POSE_KEYS.filter(k => k !== "breath").join(", ") + ". Плюс у spineFlex = наклон вперёд, у spineSide = вправо, у spineTwist = влево.", args: { "<key>": "number" } },
  bend:      { desc: "Согнуть один отдел позвоночника. region: lumbar | thoracic | cervical; flex/side/twist в градусах.", args: { region: "string", flex: "number?", side: "number?", twist: "number?" } },
  layers:    { desc: "Показать/скрыть слои: " + LAYERS.join(", ") + ". show/hide — списки.", args: { show: "string[]?", hide: "string[]?" } },
  peel:      { desc: "Снять слои до глубины: dressed | skin | muscles | skeleton | muscles_bones | xray | organs (органы в прозрачной коже со скелетом) | organs_only.", args: { to: "string" } },
  opacity:   { desc: "Прозрачность слоя 0..1.", args: { layer: "string", value: "number" } },
  highlight: { desc: "Подсветить часть: имя (Vertebra L4, Femur.l), русское имя, «L4», «L4-L5» (диск) или группа: позвоночник, поясничный, грудной, шейный, рёбра, диски, таз, череп, органы, лёгкие, сердце, кишечник.", args: { part: "string", color: "string?" } },
  clear:     { desc: "Снять подсветку.", args: {} },
  focus:     { desc: "Навести камеру на часть тела.", args: { part: "string" } },
  hide:      { desc: "Скрыть отдельную часть (или show:true — вернуть).", args: { part: "string", show: "boolean?" } },
  view:      { desc: "Ракурс: front | back | left | right | top | three_quarter.", args: { angle: "string" } },
  zoom:      { desc: "Приблизить (>1) или отдалить (<1).", args: { factor: "number" } },
  scale:     { desc: "Масштаб модели (1 = 1,75 м).", args: { value: "number" } },
  life:      { desc: "Дыхание и микродвижения вкл/выкл.", args: { on: "boolean" } },
  reset:     { desc: "Стойка, все слои по умолчанию, камера спереди.", args: {} },
  list:      { desc: "Справка: what = parts | vertebrae | presets | layers | commands; layer — фильтр для parts.", args: { what: "string", layer: "string?" } },
  state:     { desc: "Текущая поза, слои и подсветка.", args: {} },
  muscles:   { desc: "Мышцы и кожа: drive — мышцы натянуты между костями и меняют толщину; skin — кожа ложится на мышцы; tension — окраска: оранжевые укорочены (работают), синие растянуты.", args: { drive: "boolean?", skin: "boolean?", tension: "boolean?" } },
  muscle_report: { desc: "Какие мышцы сильнее всего укоротились или растянулись в текущей позе (в %).", args: { limit: "number?" } },
  snap:      { desc: "Мгновенно завершить текущие плавные переходы (позы и камеры).", args: {} }
};

// One tool definition for LLM tool-calling (Anthropic / OpenAI style input_schema).
export const TOOL = {
  name: "body_command",
  description: "Управляет 3D-моделью человека: позы, сгибание позвоночника по отделам, слои (одежда/кожа/мышцы/скелет), подсветка и фокус на частях, камера. Передавай массив commands, они выполняются по порядку.",
  input_schema: {
    type: "object",
    properties: {
      commands: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: Object.keys(COMMANDS) },
            preset: { type: "string", enum: Object.keys(PRESETS) }, amount: { type: "number" },
            region: { type: "string", enum: ["lumbar", "thoracic", "cervical"] }, flex: { type: "number" }, side: { type: "number" }, twist: { type: "number" },
            show: {}, hide: { type: "array", items: { type: "string" } }, to: { type: "string" },
            layer: { type: "string" }, value: { type: "number" }, part: { type: "string" }, color: { type: "string" },
            angle: { type: "string" }, factor: { type: "number" }, on: { type: "boolean" }, what: { type: "string" },
            drive: { type: "boolean" }, skin: { type: "boolean" }, tension: { type: "boolean" }, limit: { type: "number" },
            ...Object.fromEntries(POSE_KEYS.filter(k => k !== "breath").map(k => [k, { type: "number" }]))
          },
          required: ["op"]
        }
      }
    },
    required: ["commands"]
  }
};

export class Commander {
  constructor(body) { this.b = body; }
  run(c) {
    if (typeof c === "string") { const s = c.trim(); if (/^[\[{]/.test(s)) c = JSON.parse(s); else return this.phrase(s); }
    if (Array.isArray(c)) return c.map(x => this.run(x));
    if (c && c.commands) return this.run(c.commands);
    const b = this.b, op = c.op;
    switch (op) {
      case "pose": b.preset(c.preset, c.amount == null ? 1 : c.amount); return { ok: true, pose: c.preset };
      case "set": { const p = {}; for (const k of POSE_KEYS) if (k in c) p[k] = c[k]; b.setPose(p); return { ok: true, set: p }; }
      case "bend": b.bendRegion(c.region, c); return { ok: true };
      case "layers": (c.show || []).forEach(l => b.setLayer(l, true)); (c.hide || []).forEach(l => b.setLayer(l, false)); return { ok: true, layers: b.layerOn };
      case "peel": b.peel(c.to); return { ok: true, layers: b.layerOn };
      case "opacity": b.setOpacity(c.layer, c.value); return { ok: true };
      case "highlight": { const r = b.highlight(c.part, c.color); return { ok: r.length > 0, found: r.slice(0, 30), count: r.length }; }
      case "clear": b.clearHighlight(); return { ok: true };
      case "focus": { const r = b.focus(c.part); return { ok: !!r }; }
      case "hide": return { ok: true, count: b.hide(c.part, !c.show) };
      case "view": b.view(c.angle); return { ok: true };
      case "zoom": b.zoom(c.factor || 1.5); return { ok: true };
      case "scale": b.setScale(c.value || 1); return { ok: true };
      case "life": b.live = !!c.on; return { ok: true };
      case "reset": b.setPose({}, true); b.regionBend = null; b.clearHighlight(); b.peel("dressed"); b.setScale(1); b.resetView(); return { ok: true };
      case "list": {
        const w = c.what;
        if (w === "vertebrae") return { ok: true, items: VERTEBRAE };
        if (w === "presets") return { ok: true, items: Object.keys(PRESETS) };
        if (w === "layers") return { ok: true, items: LAYERS };
        if (w === "commands") return { ok: true, items: COMMANDS };
        return { ok: true, items: b.listParts(c.layer) };
      }
      case "state": return { ok: true, state: b.state() };
      case "snap": b.snap(); return { ok: true };
      case "muscles": return b.muscles(c);
      case "muscle_report": return { ok: true, items: b.muscleReport(c.limit || 12) };
      default: return { ok: false, error: "unknown op " + op };
    }
  }
  // tiny offline phrase parser for demos without an AI; a real assistant should send JSON via TOOL
  phrase(s) {
    const t = s.toLowerCase(), num = (t.match(/-?\d+(\.\d+)?/) || [])[0], n = num != null ? +num : null, out = [];
    const part = (t.match(/\b([ctl]\s?\d{1,2}(\s?[-–]\s?[ctls]\s?\d{1,2})?)\b/i) || [])[1];
    if (/сбро|reset|исходн/.test(t)) out.push({ op: "reset" });
    if (/сним\w* одежд|раздень|без одежд|undress/.test(t)) out.push({ op: "peel", to: "skin" });
    if (/одень|в одежд|dress/.test(t)) out.push({ op: "peel", to: "dressed" });
    if (/рентген|x-?ray|насквозь/.test(t)) out.push({ op: "peel", to: "xray" });
    if (/мышц|muscle/.test(t) && /покаж|show|до/.test(t)) out.push({ op: "peel", to: "muscles" });
    if (/скелет|кост|skeleton|bones/.test(t) && /покаж|show|до|только/.test(t)) out.push({ op: "peel", to: "skeleton" });
    if (/орган|organ|сердц|лёгк|легк|печен|желуд|кишеч/.test(t)) out.push({ op: "peel", to: "organs" });
    const org = (t.match(/сердц\w*|лёгки\w*|легки\w*|печен\w*|желуд\w*|кишечн\w*|селезён\w*|селезен\w*|мочев\w* пузыр\w*|поджелудочн\w*/) || [])[0];
    if (org) { const map = { "сердц": "сердце", "лёгк": "лёгкие", "легк": "лёгкие", "печен": "Печень", "желуд": "Желудок", "кишечн": "кишечник", "селезён": "Селезёнка", "селезен": "Селезёнка", "мочев": "Мочевой пузырь", "поджелудочн": "Поджелудочная железа" };
      const key = Object.keys(map).find(k => org.startsWith(k)); if (key) { out.push({ op: "highlight", part: map[key] }); out.push({ op: "focus", part: map[key] }); } }
    if (/наклон\w* вперёд|наклон\w* вперед|forward bend|согни\w* вперёд/.test(t)) out.push({ op: "pose", preset: "forward_bend", amount: n ? Math.min(1, n / 90) : 1 });
    else if (/прогн|назад|back bend/.test(t)) out.push({ op: "pose", preset: "back_bend" });
    else if (/вбок|в сторону/.test(t)) out.push({ op: "pose", preset: /лев|left/.test(t) ? "side_bend_left" : "side_bend_right" });
    else if (/поверн|скрут|twist/.test(t)) out.push({ op: "pose", preset: /прав|right/.test(t) ? "twist_right" : "twist_left" });
    else if (/присед|squat/.test(t)) out.push({ op: "pose", preset: "squat" });
    else if (/руки вверх|arms up/.test(t)) out.push({ op: "pose", preset: "arms_up" });
    else if (/сутул|slouch/.test(t)) out.push({ op: "pose", preset: "slouch" });
    else if (/выпрям|стой|stand/.test(t)) out.push({ op: "pose", preset: "stand" });
    if (part) { out.push({ op: "highlight", part: part.replace(/\s/g, "") }); out.push({ op: "focus", part: part.replace(/\s/g, "") }); }
    else if (/позвоночник|spine/.test(t)) { out.push({ op: "highlight", part: "позвоночник" }); }
    else if (/поясни|lumbar/.test(t)) out.push({ op: "highlight", part: "поясничный" }, { op: "focus", part: "поясничный" });
    else if (/грудн\w* отдел|thoracic/.test(t)) out.push({ op: "highlight", part: "грудной" }, { op: "focus", part: "грудной" });
    else if (/шейн|cervical/.test(t)) out.push({ op: "highlight", part: "шейный" }, { op: "focus", part: "шейный" });
    if (/сзади|со спины|back view/.test(t)) out.push({ op: "view", angle: "back" });
    else if (/сбоку|side view|профиль/.test(t)) out.push({ op: "view", angle: "left" });
    else if (/спереди|front/.test(t)) out.push({ op: "view", angle: "front" });
    if (/приблиз|ближе|zoom in/.test(t)) out.push({ op: "zoom", factor: 1.6 });
    if (/отдал|дальше|zoom out/.test(t)) out.push({ op: "zoom", factor: .6 });
    if (!out.length) return [{ ok: false, error: "не понял фразу; используйте JSON-команды (см. list commands)" }];
    return out.map(x => Object.assign({ cmd: x }, this.run(x)));
  }
}
