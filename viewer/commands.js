// Command layer: every action on the body is a small JSON object, so any AI (or a script, or a button) can drive it.
// run(cmd) accepts one command, an array of commands, a JSON string, or a short Russian/English phrase.
import { PRESETS, POSE_KEYS, LAYERS, GESTURES, FINGERS, EXPRESSIONS, EXERCISES } from "./body.js";
import { VERTEBRAE } from "./names-ru.js";
import { INFO, NOTE } from "./exercises-ru.js";

export const COMMANDS = {
  pose:      { desc: "Готовая поза. preset: " + Object.keys(PRESETS).join(", ") + "; amount 0..1 (насколько сильно).", args: { preset: "string", amount: "number?" } },
  set:       { desc: "Точная поза. Ключи: " + POSE_KEYS.filter(k => k !== "breath").join(", ") + ". Градусы, кроме пальцев рук. Плюс у spineFlex = наклон вперёд, у spineSide = вправо, у spineTwist = влево; ankleL/R плюс = носок вниз; forearmL/R — поворот предплечья: плюс = ладонью вниз/назад (пронация), минус = ладонью вверх/вперёд (супинация), 0 = исходное положение, -120 = ладони вперёд при опущенных руках; spreadL/R 0..1 — развести пальцы; toesL/R плюс = пальцы стопы поджаты, минус = подняты; wristLFlex/wristRFlex плюс = кисть к ладони. Пальцы рук (thumbL, indexL, middleL, ringL, littleL и то же с R) — степень сгибания 0..1 (1 = в кулак).", args: { "<key>": "number" } },
  exercise:  { desc: "Показать упражнение с повторами: " + Object.entries(EXERCISES).filter(([, v]) => !v.hidden).map(([k, v]) => k + " (" + v.ru + ")").join(", ") + ". reps — сколько раз, speed — скорость (1 = обычно).", args: { name: "string", reps: "number?", speed: "number?" } },
  animate:   { desc: "Своя последовательность: frames — список кадров { pose?, amount?, set?, face?, hand?: {gesture, side}, dur (секунды перехода), hold (секунды удержания) }; loop — повторы; speed. Кадр меняет только то, что в нём указано.", args: { frames: "object[]", loop: "number?", speed: "number?" } },
  exercise_info: { desc: "Справка по упражнению для объяснения пользователю: цель, работающие мышцы (имена частей модели и по-русски), подсказки по технике, осторожность.", args: { name: "string" } },
  show_muscles: { desc: "Подсветить мышцы, которые работают в упражнении (и показать слой мышц).", args: { name: "string" } },
  spine:     { desc: "Позвоночник: show true/false — раскрасить на модели (янтарный сгибание, бирюзовый разгибание, фиолетовый наклон вбок/скручивание, диск L4–L5 по давлению). Без show — только вернуть состояние.", args: { show: "boolean?" } },
  spine_state: { desc: "Что сейчас делает каждый отдел позвоночника (градусы сгибания, наклона, поворота) и оценка давления в диске L4–L5 по измерениям Wilke 1999 (МПа и % от стояния; помечено, измерено это или оценка).", args: {} },
  walk:      { desc: "Ходьба на месте (как на дорожке): on true/false, speed 0.2..2.5.", args: { on: "boolean?", speed: "number?" } },
  stop:      { desc: "Остановить упражнение, анимацию или ходьбу.", args: {} },
  face:      { desc: "Выражение лица. expression: " + Object.keys(EXPRESSIONS).join(", ") + "; amount 0..1. Точно через set: jawOpen (градусы), smile (-1..1), brows (-1..1), blinkL/blinkR (0..1), lookX/lookY (градусы взгляда: плюс = влево от модели / вверх).", args: { expression: "string", amount: "number?" } },
  hand:      { desc: "Жест кистью. gesture: " + Object.keys(GESTURES).join(", ") + "; side: left | right | both; amount 0..1.", args: { gesture: "string", side: "string?", amount: "number?" } },
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
  shape:     { desc: "Телосложение, каждый параметр от -1 до 1, 0 — как у модели: weight — полнота (-1 худее, 1 полнее), muscle — мышечная масса, breast — размер груди. Можно передать один или несколько. Одежда, волосы и мышцы под кожей подстраиваются; кости не меняются. Возвращает массу тела по объёму модели и сколько из неё несёт диск L4–L5; давление в диске (spine_state) пересчитывается на эту массу.", args: { weight: "number?", muscle: "number?", breast: "number?" } },
  life:      { desc: "Дыхание и микродвижения вкл/выкл.", args: { on: "boolean" } },
  reset:     { desc: "Стойка, все слои по умолчанию, камера спереди.", args: {} },
  list:      { desc: "Справка: what = parts | vertebrae | presets | layers | commands; layer — фильтр для parts.", args: { what: "string", layer: "string?" } },
  state:     { desc: "Текущая поза, слои и подсветка.", args: {} },
  muscles:   { desc: "Мышцы и кожа: drive — мышцы натянуты между костями и меняют толщину; skin — кожа ложится на мышцы; tension — окраска: оранжевые укорочены (работают), синие растянуты.", args: { drive: "boolean?", skin: "boolean?", tension: "boolean?" } },
  muscle_report: { desc: "Какие мышцы сильнее всего укоротились или растянулись в текущей позе (в %).", args: { limit: "number?" } },
  skinning:  { desc: "Как кожа гнётся в суставах: dqs (по умолчанию, сохраняет объём колена, локтя, бедра) или linear (классический способ, кожа проваливается — для сравнения).", args: { mode: "string" } },
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
            drive: { type: "boolean" }, gesture: { type: "string", enum: Object.keys(GESTURES) }, expression: { type: "string", enum: Object.keys(EXPRESSIONS) }, name: { type: "string", enum: [...Object.keys(EXERCISES).filter(k => !EXERCISES[k].hidden), "walk"] }, reps: { type: "number" }, speed: { type: "number" }, loop: { type: "number" },
            frames: { type: "array", items: { type: "object" } }, side: { type: "string", enum: ["left", "right", "both"] }, mode: { type: "string", enum: ["dqs", "linear"] }, skin: { type: "boolean" }, tension: { type: "boolean" }, limit: { type: "number" },
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
      case "exercise": return b.exercise(c.name, c.reps, c.speed || 1);
      case "animate": return b.animate(c.frames, { loop: c.loop || 1, speed: c.speed || 1 });
      case "exercise_info": { const I = INFO[c.name]; return I ? { ok: true, name: c.name, ...I, muscles: I.muscles.map(([n, ru]) => ({ name: n, ru })), note: NOTE } : { ok: false, error: "unknown exercise " + c.name }; }
      case "show_muscles": { const I = INFO[c.name]; if (!I) return { ok: false, error: "unknown exercise " + c.name }; if (!b.layerOn.muscles) b.peel("muscles"); return { ok: true, count: b.highlightMany(I.muscles.map(m => m[0])) }; }
      case "spine": { if (c.show != null) b.showSpine(c.show); return { ok: true, show: !!b.spineOn, ...b.spineState() }; }
      case "spine_state": return { ok: true, ...b.spineState() };
      case "walk": return b.walk(c.on !== false, c.speed || 1);
      case "stop": return b.stopMotion();
      case "face": return { ok: true, set: b.expression(c.expression, c.amount == null ? 1 : c.amount) };
      case "hand": return { ok: true, set: b.gesture(c.gesture, c.side || "both", c.amount == null ? 1 : c.amount) };
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
      case "shape": { const shape = b.setShape(c), M = b.massProps(); return { ok: true, shape, bodyKg: M && M.bodyKg, discCarriesKg: M && M.upperKg, discPressureFactor: M && Math.round(M.upperFactor * 100) / 100 }; }
      case "life": b.live = !!c.on; return { ok: true };
      case "reset": b.stopMotion(); b.setPose({}, true); b.regionBend = null; b.clearHighlight(); b.peel("dressed"); b.setScale(1); b.resetView(); return { ok: true };
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
      case "skinning": return b.skinning(c.mode);
      case "muscle_report": return { ok: true, items: b.muscleReport(c.limit || 12) };
      default: return { ok: false, error: "unknown op " + op };
    }
  }
  // tiny offline phrase parser for demos without an AI; a real assistant should send JSON via TOOL
  phrase(s) {
    const t = s.toLowerCase(), num = (t.match(/-?\d+(\.\d+)?/) || [])[0], n = num != null ? +num : null, out = [];
    const part = (t.match(/\b([ctl]\s?\d{1,2}(\s?[-–]\s?[ctls]\s?\d{1,2})?)\b/i) || [])[1];
    if (/сбро|reset|исходн/.test(t)) out.push({ op: "reset" });
    if (/стоп|хватит|останов|stop/.test(t)) return [Object.assign({ cmd: { op: "stop" } }, this.run({ op: "stop" }))];
    const reps = (t.match(/(\d+)\s*(раз|повтор|rep)/) || [])[1];
    const ex = /поясниц|спин[уае]|lower back/.test(t) && /упражн|комплекс|разминк|exercise/.test(t) ? (/сто[яй]/.test(t) ? "lower_back_standing" : "lower_back") : /приседа|squats/.test(t) ? "squats" : /наклон[\wа-яё]* в сторон/.test(t) ? "side_bends"
      : /поворот[\wа-яё]* корпус|скручиван/.test(t) ? "trunk_rotation" : /(упражн|разминк|мобильн)[\wа-яё]* (для )?ше[июя]/.test(t) ? "neck_mobility" : /кошк|cat.?cow/.test(t) ? (/сто[яй]/.test(t) ? "cat_cow" : "cat_cow_floor") : /мостик|bridge/.test(t) ? "bridge" : /колен[\wа-яё]* к груди/.test(t) ? "knees_to_chest" : /птиц|собак|bird.?dog/.test(t) ? "bird_dog"
      : /подъ[её]м[\wа-яё]* на носк|икр/.test(t) ? "calf_raises" : /подъ[её]м[\wа-яё]* рук|маши руками/.test(t) ? "arm_raises" : /марш|колен[\wа-яё]* вверх|high knees/.test(t) ? "march"
      : /(упражн|разминк)[\wа-яё]* (для )?кист/.test(t) ? "hand_exercise" : null;
    if (ex) return [Object.assign({ cmd: { op: "exercise", name: ex, reps: reps ? +reps : undefined } }, this.run({ op: "exercise", name: ex, reps: reps ? +reps : undefined }))];
    if (/ляг на спин|лёжа на спин|лежа на спин/.test(t)) out.push({ op: "pose", preset: "lie_back" });
    else if (/ляг на живот|на живот/.test(t)) out.push({ op: "pose", preset: "lie_front" });
    else if (/ляг на бок|на боку/.test(t)) out.push({ op: "pose", preset: "lie_side" });
    else if (/четвереньк/.test(t)) out.push({ op: "pose", preset: "all_fours" });
    else if (/встань(?! на (носк|цыпочк))|подними[\wа-яё]*сь|stand up/.test(t)) out.push({ op: "pose", preset: "stand" });
    if (/нагрузк[\wа-яё]* на (позвоночник|поясниц|диск)|давлени[\wа-яё]* в диск/.test(t)) out.push({ op: "spine", show: true });
    if (/(иди|идти|шагай|ходьб|пройдись|walk)/.test(t)) return [Object.assign({ cmd: { op: "walk", on: true } }, this.run({ op: "walk", on: true, speed: /быстр|fast/.test(t) ? 1.6 : /медлен|slow/.test(t) ? .6 : 1 }))];
    if (/груд[\wа-яё]* (больше|крупнее|побольше)|увелич[\wа-яё]* груд/.test(t)) out.push({ op: "shape", breast: Math.min(1, this.b.shape.breast + .5) });
    else if (/груд[\wа-яё]* (меньше|поменьше)|уменьш[\wа-яё]* груд/.test(t)) out.push({ op: "shape", breast: Math.max(-1, this.b.shape.breast - .5) });
    else if (/груд[\wа-яё]* (как было|обычн|средн)/.test(t)) out.push({ op: "shape", breast: 0 });
    if (/полнее|толще|потолст|набер[\wа-яё]* вес/.test(t)) out.push({ op: "shape", weight: Math.min(1, this.b.shape.weight + .5) });
    else if (/худее|похуд|стройнее/.test(t)) out.push({ op: "shape", weight: Math.max(-1, this.b.shape.weight - .5) });
    if (/(мускулист|накачан|подкачай|больше мышц)/.test(t)) out.push({ op: "shape", muscle: Math.min(1, this.b.shape.muscle + .5) });
    else if (/(меньше мышц|без мускулатур|слаб[\wа-яё]* мускулатур)/.test(t)) out.push({ op: "shape", muscle: Math.max(-1, this.b.shape.muscle - .5) });
    if (/(обычн[\wа-яё]* телосложен|телосложени[\wа-яё]* как было)/.test(t)) out.push({ op: "shape", weight: 0, muscle: 0, breast: 0 });
    if (/сним[\wа-яё]* одежд|раздень|без одежд|undress/.test(t)) out.push({ op: "peel", to: "skin" });
    if (/одень|в одежд|dress/.test(t)) out.push({ op: "peel", to: "dressed" });
    if (/рентген|x-?ray|насквозь/.test(t)) out.push({ op: "peel", to: "xray" });
    if (/мышц|muscle/.test(t) && /покаж|show|до/.test(t)) out.push({ op: "peel", to: "muscles" });
    if (/скелет|кост|skeleton|bones/.test(t) && /покаж|show|до|только/.test(t)) out.push({ op: "peel", to: "skeleton" });
    if (/орган|organ|сердц|лёгк|легк|печен|желуд|кишеч/.test(t)) out.push({ op: "peel", to: "organs" });
    const org = (t.match(/сердц[\wа-яё]*|лёгки[\wа-яё]*|легки[\wа-яё]*|печен[\wа-яё]*|желуд[\wа-яё]*|кишечн[\wа-яё]*|селезён[\wа-яё]*|селезен[\wа-яё]*|мочев[\wа-яё]* пузыр[\wа-яё]*|поджелудочн[\wа-яё]*/) || [])[0];
    if (org) { const map = { "сердц": "сердце", "лёгк": "лёгкие", "легк": "лёгкие", "печен": "Печень", "желуд": "Желудок", "кишечн": "кишечник", "селезён": "Селезёнка", "селезен": "Селезёнка", "мочев": "Мочевой пузырь", "поджелудочн": "Поджелудочная железа" };
      const key = Object.keys(map).find(k => org.startsWith(k)); if (key) { out.push({ op: "highlight", part: map[key] }); out.push({ op: "focus", part: map[key] }); } }
    if (/наклон[\wа-яё]* вперёд|наклон[\wа-яё]* вперед|forward bend|согни[\wа-яё]* вперёд/.test(t)) out.push({ op: "pose", preset: "forward_bend", amount: n ? Math.min(1, n / 90) : 1 });
    else if (/прогн|назад|back bend/.test(t)) out.push({ op: "pose", preset: "back_bend" });
    else if (/вбок|в сторону/.test(t)) out.push({ op: "pose", preset: /лев|left/.test(t) ? "side_bend_left" : "side_bend_right" });
    else if (/поверн|скрут|twist/.test(t)) out.push({ op: "pose", preset: /прав|right/.test(t) ? "twist_right" : "twist_left" });
    else if (/присед|squat/.test(t)) out.push({ op: "pose", preset: "squat" });
    else if (/руки вверх|arms up/.test(t)) out.push({ op: "pose", preset: "arms_up" });
    else if (/на носк|на цыпочк|tiptoe/.test(t)) out.push({ op: "pose", preset: "tiptoe" });
    else if (/сутул|slouch/.test(t)) out.push({ op: "pose", preset: "slouch" });
    else if (/выпрям|стой|stand/.test(t)) out.push({ op: "pose", preset: "stand" });
    const side = /лев[\wа-яё]* рук|левой|left hand/.test(t) ? "left" : /прав[\wа-яё]* рук|правой|right hand/.test(t) ? "right" : "both";
    if (/кулак|fist/.test(t)) out.push({ op: "hand", gesture: "fist", side });
    else if (/класс|большой палец|thumbs? up|лайк/.test(t)) out.push({ op: "hand", gesture: "thumbs_up", side });
    else if (/(^|[\s,.!])(ок|окей|ok)([\s,.!]|$)/.test(t)) out.push({ op: "hand", gesture: "ok", side });
    else if (/указ|point/.test(t)) out.push({ op: "hand", gesture: "point", side });
    else if (/(^|\s)мир|виктори|peace|(^|\s)v([\s,.!]|$)/.test(t)) out.push({ op: "hand", gesture: "peace", side });
    else if (/разожми|раскрой|открой ладон|open hand/.test(t)) out.push({ op: "hand", gesture: "open", side });
    else if (/разведи пальц|растопыр|spread/.test(t)) out.push({ op: "hand", gesture: "spread", side });
    const fs = side === "left" ? ["L"] : side === "right" ? ["R"] : ["L", "R"];
    if (/ладон[\wа-яё]* (вверх|вперёд|вперед)|супинац|palms? (up|forward)/.test(t)) out.push({ op: "set", ...Object.fromEntries(fs.map(S => ["forearm" + S, -110])) });
    else if (/ладон[\wа-яё]* (вниз|назад)|пронац|palms? (down|back)/.test(t)) out.push({ op: "set", ...Object.fromEntries(fs.map(S => ["forearm" + S, 60])) });
    if (/улыб|smile/.test(t)) out.push({ op: "face", expression: "smile" });
    else if (/смей|смех|laugh/.test(t)) out.push({ op: "face", expression: "laugh" });
    else if (/удив|surpris/.test(t)) out.push({ op: "face", expression: "surprise" });
    else if (/грус|печал|sad/.test(t)) out.push({ op: "face", expression: "sad" });
    else if (/зл[иоа]|сердит|angry/.test(t)) out.push({ op: "face", expression: "angry" });
    else if (/подмигн|wink/.test(t)) out.push({ op: "face", expression: /прав|right/.test(t) ? "wink_right" : "wink_left" });
    else if (/закрой глаза|моргн|blink/.test(t)) out.push({ op: "face", expression: "blink" });
    else if (/открой рот|рот открыт|open (the )?mouth/.test(t)) out.push({ op: "face", expression: "mouth_open" });
    else if (/нейтральн|спокойн|neutral/.test(t)) out.push({ op: "face", expression: "neutral" });
    const look = t.match(/посмотри[\wа-яё]* (влево|вправо|вверх|вниз|прямо)|look (left|right|up|down)/);
    if (look) { const d = look[1] || look[2]; out.push({ op: "set", lookX: /влево|left/.test(d) ? 25 : /вправо|right/.test(d) ? -25 : 0, lookY: /вверх|up/.test(d) ? 20 : /вниз|down/.test(d) ? -20 : 0 }); }
    if (part) { out.push({ op: "highlight", part: part.replace(/\s/g, "") }); out.push({ op: "focus", part: part.replace(/\s/g, "") }); }
    else if (/позвоночник|spine/.test(t)) { out.push({ op: "highlight", part: "позвоночник" }); }
    else if (/поясни|lumbar/.test(t)) out.push({ op: "highlight", part: "поясничный" }, { op: "focus", part: "поясничный" });
    else if (/грудн[\wа-яё]* отдел|thoracic/.test(t)) out.push({ op: "highlight", part: "грудной" }, { op: "focus", part: "грудной" });
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
