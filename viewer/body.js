// HumanBody: a layered, rigged human (MakeHuman CC0 body + Z-Anatomy CC BY-SA skeleton and muscles) in three.js.
// Layers can be peeled (clothes -> skin -> muscles -> skeleton), the spine bends segment by segment,
// every part can be picked, highlighted and focused, and everything is driven by plain JSON commands (see commands.js).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ruName, VERTEBRAE } from "./names-ru.js";
import { MuscleDrive } from "./muscle-drive.js";
import { setLinearSkinning } from "./dq-skinning.js";

const D2R = Math.PI / 180;
export const LAYERS = ["clothes", "hair", "skin", "muscles", "organs", "skeleton"];
// how each spine/neck movement is shared between the rig's segments (≈ real ranges of motion per region)
const SPINE = ["spine05", "spine04", "spine03", "spine02", "spine01"], NECK = ["neck01", "neck02", "neck03", "head"];
const SHARE = {
  flex:  { spine05: .22, spine04: .22, spine03: .2, spine02: .18, spine01: .18 },
  side:  { spine05: .15, spine04: .18, spine03: .2, spine02: .24, spine01: .23 },
  twist: { spine05: .05, spine04: .08, spine03: .17, spine02: .32, spine01: .38 },
  nflex: { neck01: .3, neck02: .3, neck03: .25, head: .15 }, nside: { neck01: .35, neck02: .35, neck03: .3 }, ntwist: { neck01: .25, neck02: .3, neck03: .3, head: .15 }
};
// region -> spine segments, for "bend only the lumbar spine"
const REGION = { lumbar: ["spine05", "spine04", "spine03"], thoracic: ["spine02", "spine01"], cervical: ["neck01", "neck02", "neck03"] };
export const POSE_KEYS = ["spineFlex", "spineSide", "spineTwist", "neckFlex", "neckSide", "neckTwist", "hipFlex",
  "armLRaise", "armRRaise", "armLForward", "armRForward", "elbowL", "elbowR", "kneeL", "kneeR", "hipLRaise", "hipRRaise",
  "wristLFlex", "wristRFlex", "ankleL", "ankleR", "toesL", "toesR", "forearmL", "forearmR", "spreadL", "spreadR",
  "thumbL", "indexL", "middleL", "ringL", "littleL", "thumbR", "indexR", "middleR", "ringR", "littleR",
  "jawOpen", "smile", "brows", "blinkL", "blinkR", "lookX", "lookY", "legLForward", "legRForward", "bodyPitch", "bodyRoll", "breath"];
// face keys are kept too when a whole-body preset is chosen
export const FACE_KEYS = ["jawOpen", "smile", "brows", "blinkL", "blinkR", "lookX", "lookY"];
// expressions: jaw opening (deg), smile (+ corners up and out, - down), brows (+ up, - down and together), blinks 0..1
export const EXPRESSIONS = {
  neutral: {}, smile: { smile: .7 }, laugh: { smile: 1, jawOpen: 12, blinkL: .25, blinkR: .25 }, surprise: { brows: 1, jawOpen: 16, blinkL: -.4, blinkR: -.4 },
  sad: { smile: -.8, brows: .35, blinkL: .2, blinkR: .2 }, angry: { brows: -1, smile: -.3, blinkL: .15, blinkR: .15 },
  blink: { blinkL: 1, blinkR: 1 }, wink_left: { blinkL: 1, smile: .3 }, wink_right: { blinkR: 1, smile: .3 }, mouth_open: { jawOpen: 20 }
};
// hand keys are kept when a whole-body preset is chosen (a fist stays a fist while the body squats)
export const HAND_KEYS0 = ["thumbL", "indexL", "middleL", "ringL", "littleL", "thumbR", "indexR", "middleR", "ringR", "littleR", "wristLFlex", "wristRFlex", "spreadL", "spreadR"];
export const HAND_KEYS = [...HAND_KEYS0, ...FACE_KEYS];
export const FINGERS = ["thumb", "index", "middle", "ring", "little"];
// gestures: curl of thumb, index, middle, ring, little; then how far the fingers are spread (0..1)
export const GESTURES = {
  open: [0, 0, 0, 0, 0, .25], spread: [-.1, 0, 0, 0, 0, 1], relaxed: [.15, .2, .25, .3, .35, .15], fist: [.9, 1, 1, 1, 1, 0], point: [.9, 0, 1, 1, 1, 0],
  thumbs_up: [-.1, 1, 1, 1, 1, 0], ok: [.5, .4, .05, .1, .15, .3], peace: [.9, 0, 0, 1, 1, .6], pinch: [.5, .4, .25, .3, .35, 0], grip: [.5, .6, .6, .6, .6, 0]
};
export const PRESETS = {
  stand: {},
  anatomical: { armLRaise: -38, armRRaise: -38, elbowL: -50, elbowR: -50, forearmL: -120, forearmR: -120 },   // palms forward (dev/palm.js)
  forward_bend: { spineFlex: 55, hipFlex: 65, neckFlex: 15 },
  back_bend: { spineFlex: -25, neckFlex: -20, hipFlex: -8 },
  side_bend_left: { spineSide: -30, neckSide: -10 },
  side_bend_right: { spineSide: 30, neckSide: 10 },
  twist_left: { spineTwist: 35, neckTwist: 20 },
  twist_right: { spineTwist: -35, neckTwist: -20 },
  arms_up: { armLRaise: 125, armRRaise: 125 },
  t_pose: { armLRaise: 45, armRRaise: 45 },
  squat: { hipFlex: 40, kneeL: 115, kneeR: 115, spineFlex: 12, armLForward: 75, armRForward: 75, armLRaise: -30, armRRaise: -30 },
  slouch: { spineFlex: 22, neckFlex: -18 },
  look_down: { neckFlex: 35 }, look_up: { neckFlex: -30 },
  cat: { spineFlex: 30, neckFlex: 25 }, cow: { spineFlex: -20, neckFlex: -25 },
  tiptoe: { ankleL: 40, ankleR: 40, toesL: -40, toesR: -40 },
  // on the floor: the whole body turns (bodyPitch -90 = on the back, +90 = face down; bodyRoll = on the side)
  lie_back: { bodyPitch: -90, armLRaise: -30, armRRaise: -30, elbowL: -50, elbowR: -50, ankleL: 25, ankleR: 25 },
  lie_front: { bodyPitch: 90, armLRaise: -30, armRRaise: -30, elbowL: -50, elbowR: -50, ankleL: 55, ankleR: 55 },
  lie_side: { bodyRoll: -90, legLForward: 25, legRForward: 15, kneeL: 30, kneeR: 25, armLForward: 40, armRForward: 60, elbowL: 20, elbowR: 10 },
  // floor exercises; angles found so the right parts touch the floor together (dev/floorfit.js)
  hook_lying: { bodyPitch: -90, kneeL: 120, kneeR: 120, legLForward: -40, legRForward: -40, ankleL: 90, ankleR: 90, armLRaise: -30, armRRaise: -30, elbowL: -50, elbowR: -50 },
  bridge: { bodyPitch: -112, kneeL: 95, kneeR: 95, legLForward: -70, legRForward: -70, ankleL: 112, ankleR: 112, armLRaise: -30, armRRaise: -30, elbowL: -50, elbowR: -50 },
  knees_to_chest: { bodyPitch: -90, kneeL: 130, kneeR: 130, legLForward: 52, legRForward: 52, ankleL: 30, ankleR: 30, armLForward: 5, armRForward: 5, armLRaise: -75, armRRaise: -75, elbowL: 60, elbowR: 60, neckFlex: 20,   // hands on the shins (dev/floorfit.js hug: 19 mm)
    thumbL: .6, indexL: .7, middleL: .7, ringL: .7, littleL: .7, thumbR: .6, indexR: .7, middleR: .7, ringR: .7, littleR: .7 },
  all_fours: { bodyPitch: 76, kneeL: 90, kneeR: 90, legLForward: 30, legRForward: 30, armLForward: 76, armRForward: 76, elbowL: -50, elbowR: -50, wristLFlex: -75, wristRFlex: -75, ankleL: 60, ankleR: 60 },
  cat_floor: { bodyPitch: 76, kneeL: 90, kneeR: 90, legLForward: 30, legRForward: 30, armLForward: 76, armRForward: 76, elbowL: -50, elbowR: -50, wristLFlex: -75, wristRFlex: -75, ankleL: 60, ankleR: 60, spineFlex: 28, neckFlex: 30 },
  cow_floor: { bodyPitch: 76, kneeL: 90, kneeR: 90, legLForward: 30, legRForward: 30, armLForward: 76, armRForward: 76, elbowL: -50, elbowR: -50, wristLFlex: -75, wristRFlex: -75, ankleL: 60, ankleR: 60, spineFlex: -22, neckFlex: -30 },
  // getting up and down: sitting on the floor with straight legs, kneeling upright
  sit_floor: { legLForward: 90, legRForward: 90, armLForward: -25, armRForward: -25, armLRaise: -25, armRRaise: -25, elbowL: -50, elbowR: -50, wristLFlex: -70, wristRFlex: -70, spineFlex: 10 },
  kneel: { kneeL: 92, kneeR: 92, legLForward: -69, legRForward: -69, ankleL: 95, ankleR: 95, armLRaise: -38, armRRaise: -38, elbowL: -30, elbowR: -30 },
  // bird-dog: one arm forward and the OPPOSITE leg back
  bird_dog_left: { bodyPitch: 76, kneeL: 90, kneeR: 0, legLForward: 30, legRForward: 0, armLForward: 166, armRForward: 76, elbowL: -50, elbowR: -50, wristRFlex: -75, ankleL: 60, ankleR: 20 },
  bird_dog_right: { bodyPitch: 76, kneeL: 0, kneeR: 90, legLForward: 0, legRForward: 30, armLForward: 76, armRForward: 166, elbowL: -50, elbowR: -50, wristLFlex: -75, ankleL: 20, ankleR: 60 }
};

// exercises: frames of { pose, amount, set, face, hand: {gesture, side}, dur (s, transition), hold (s) }; loop = repetitions;
// program = several exercises one after another
const ARMS_DOWN = { armLRaise: -38, armRRaise: -38, elbowL: -20, elbowR: -20 };
export const EXERCISES = {
  squats: { ru: "Приседания", loop: 5, frames: [{ pose: "stand", dur: 1.2, say: "Вверх — выдох" }, { pose: "squat", amount: .85, dur: 1.6, hold: .4, say: "Вниз, таз назад — вдох" }], end: { pose: "stand", dur: 1.4 } },
  forward_bend: { ru: "Наклон вперёд с растяжкой", loop: 2, frames: [{ pose: "stand", dur: 1.2, hold: .3, say: "Выпрямитесь" }, { pose: "forward_bend", dur: 2.6, hold: 2, say: "Наклон от тазобедренных, держите растяжку" }], end: { pose: "stand", dur: 2 } },
  side_bends: { ru: "Наклоны в стороны", loop: 3, frames: [{ pose: "side_bend_left", dur: 1.8, hold: .6, say: "Наклон влево" }, { pose: "side_bend_right", dur: 2.4, hold: .6, say: "Наклон вправо" }], end: { pose: "stand", dur: 1.5 } },
  trunk_rotation: { ru: "Повороты корпуса", loop: 3, frames: [{ pose: "twist_left", dur: 1.8, hold: .5, say: "Поворот влево" }, { pose: "twist_right", dur: 2.4, hold: .5, say: "Поворот вправо" }], end: { pose: "stand", dur: 1.5 } },
  neck_mobility: { ru: "Мобильность шеи", loop: 2, frames: [{ set: { neckFlex: 35 }, dur: 1.6, hold: .6, say: "Подбородок к груди" }, { set: { neckFlex: -25 }, dur: 2, hold: .6, say: "Голову назад, без рывка" }, { set: { neckFlex: 0, neckTwist: 60 }, dur: 2, hold: .6, say: "Поворот влево" },
    { set: { neckTwist: -60 }, dur: 2.6, hold: .6, say: "Поворот вправо" }, { set: { neckTwist: 0, neckSide: 30 }, dur: 2, hold: .6, say: "Ухо к правому плечу" }, { set: { neckSide: -30 }, dur: 2.4, hold: .6, say: "Ухо к левому плечу" }], end: { pose: "stand", dur: 1.5 } },
  cat_cow: { ru: "Кошка — корова (стоя)", loop: 4, frames: [{ pose: "cat", dur: 2, hold: .6, say: "Выдох — спина круглая" }, { pose: "cow", dur: 2.4, hold: .6, say: "Вдох — мягкий прогиб" }], end: { pose: "stand", dur: 1.5 } },
  calf_raises: { ru: "Подъёмы на носки", loop: 6, frames: [{ pose: "stand", dur: 1, say: "Медленно опуститесь" }, { pose: "tiptoe", dur: 1, hold: .5, say: "Вверх на носки" }], end: { pose: "stand", dur: 1 } },
  arm_raises: { ru: "Подъём рук", loop: 4, frames: [{ pose: "anatomical", dur: 1.6, hold: .3, say: "Руки вниз — выдох" }, { pose: "arms_up", dur: 2, hold: .6, say: "Руки вверх — вдох" }], end: { pose: "stand", dur: 1.6 } },
  march: { ru: "Марш с высоким подниманием колен", loop: 6, frames: [{ set: { ...ARMS_DOWN, legLForward: 25, kneeL: 90, legRForward: 0, kneeR: 0, armRForward: 35, armLForward: -20 }, dur: .7, say: "Левое колено вверх" },
    { set: { ...ARMS_DOWN, legRForward: 25, kneeR: 90, legLForward: 0, kneeL: 0, armLForward: 35, armRForward: -20 }, dur: .7, say: "Правое колено вверх" }], end: { pose: "stand", dur: 1.2 } },
  hand_exercise: { ru: "Кулак — разведённые пальцы", loop: 5, frames: [{ hand: { gesture: "fist" }, dur: .8, hold: .3, say: "Кулак" }, { hand: { gesture: "spread" }, dur: .8, hold: .3, say: "Пальцы врозь" }], end: { hand: { gesture: "relaxed" }, dur: .8 } },
  lower_back_standing: { ru: "Разминка для поясницы стоя", program: ["cat_cow", "side_bends", "trunk_rotation", "forward_bend"] },
  // on the floor
  knees_to_chest: { ru: "Колени к груди (лёжа)", loop: 3, start: "_lie_down", frames: [{ pose: "hook_lying", dur: 2, say: "Отпустите колени" }, { pose: "knees_to_chest", dur: 2, hold: 2, say: "Колени к груди, мягко держите" }], end: { pose: "hook_lying", dur: 1.5 } },
  bridge: { ru: "Ягодичный мостик", loop: 5, start: "_lie_down", frames: [{ pose: "hook_lying", dur: 1.6, hold: .4, say: "Опустите таз" }, { pose: "bridge", dur: 1.6, hold: 1.5, say: "Таз вверх, давите пятками" }], end: { pose: "hook_lying", dur: 1.5 } },
  cat_cow_floor: { ru: "Кошка — корова (на четвереньках)", loop: 4, start: "_kneel_down", frames: [{ pose: "cat_floor", dur: 2, hold: .6, say: "Выдох — спина круглая" }, { pose: "cow_floor", dur: 2.4, hold: .6, say: "Вдох — мягкий прогиб" }], end: { pose: "all_fours", dur: 1.5 } },
  bird_dog: { ru: "Птица-собака", loop: 3, start: "_kneel_down", frames: [{ pose: "all_fours", dur: 1.4, say: "Исходное положение" }, { pose: "bird_dog_right", dur: 1.6, hold: 1.5, say: "Правая рука и левая нога в длину" }, { pose: "all_fours", dur: 1.4, say: "Вернитесь" }, { pose: "bird_dog_left", dur: 1.6, hold: 1.5, say: "Левая рука и правая нога в длину" }], end: { pose: "all_fours", dur: 1.4 } },
  lower_back: { ru: "Комплекс для поясницы (на полу)", program: ["knees_to_chest", "bridge", "_to_all_fours", "cat_cow_floor", "bird_dog", "_stand_up"] },
  // transitions inside programs: roll to the side and come up on all fours; stand up
  _kneel_down: { hidden: true, loop: 1, frames: [{ pose: "kneel", dur: 2, say: "Опуститесь на колени" }, { pose: "all_fours", dur: 2, say: "Руки на пол" }] },
  _lie_down: { hidden: true, loop: 1, frames: [{ pose: "kneel", dur: 2, say: "Опуститесь на колени" }, { pose: "sit_floor", dur: 2.2, say: "Сядьте" }, { pose: "hook_lying", dur: 2.2, say: "Лягте на спину, колени согнуты" }] },
  _to_all_fours: { hidden: true, loop: 1, frames: [{ pose: "sit_floor", dur: 2.2, hold: .3, say: "Сядьте" }, { pose: "kneel", dur: 2.2, hold: .3, say: "Встаньте на колени" }, { pose: "all_fours", dur: 2, say: "На четвереньки" }] },
  _stand_up: { hidden: true, loop: 1, frames: [{ pose: "kneel", dur: 2, say: "На колени" }, { pose: "stand", dur: 2.5, say: "Встаньте" }] }
};
const bump = (p, c, w) => { let d = Math.abs(p - c); d = Math.min(d, 1 - d); return Math.exp(-((d / w) ** 2)); };
// one leg over a gait cycle (phase 0 = heel strike), degrees; from typical sagittal gait curves
export const GAIT = { hipMid: 1, hipAmp: 18 };   // thigh +19° / -17°: heel touches at heel strike while the other foot is on its ball (in place)
export function gaitLeg(p) {
  const hip = GAIT.hipMid + GAIT.hipAmp * Math.cos(2 * Math.PI * p);                // thigh: forward at heel strike, back at push-off
  const knee = 4 + 14 * bump(p, .13, .07) + 56 * bump(p, .72, .11);                   // loading response, then swing
  const ankle = -14 * bump(p, 0, .06) + 28 * bump(p, .6, .07) - 6 * bump(p, .85, .08); // toes up at heel strike, push-off
  return { hip, knee, ankle };
}

export class HumanBody extends EventTarget {
  PALM = -1;     // which side of the hand is the palm: checked numerically (fingertips of a fist move toward the anatomical palm, dev/palm.js)
  THUMB_OPP = .8;  // (with CMC 30°: OK tips 7 mm apart, dev/handfit.js)
  PRON = 1;       // sign of pronation about the radius axis (checked on renders) // how much the thumb metacarpal swings across the palm toward the index finger
  CURL = { finger: [85, 100, 65], thumb: [30, 50, 45] };
  constructor(el, opt = {}) {
    super();
    this.el = el; this.opt = Object.assign({ url: "human.glb", draco: "draco/" }, opt);
    const R = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!opt.preserve });
    R.setPixelRatio(Math.min(2, devicePixelRatio)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    el.appendChild(R.domElement);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(R); this.scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(1.5, 3, 2.5); this.scene.add(key);
    // a soft floor, shown when the body is on the floor
    const fl = this.floor = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: .95, transparent: true, opacity: 0, depthWrite: false }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = -.002; fl.renderOrder = -1; this.scene.add(fl);
    this.camera = new THREE.PerspectiveCamera(32, 1, .01, 50); this.camera.position.set(0, 1.1, 4.2);
    this.controls = new OrbitControls(this.camera, R.domElement); this.controls.target.set(0, .95, 0); this.controls.enableDamping = true;
    this.controls.minDistance = .15; this.controls.maxDistance = 12;
    this.pose = Object.fromEntries(POSE_KEYS.map(k => [k, 0])); this.target = { ...this.pose }; this.target.breath = 1;
    this.live = true; this.parts = new Map(); this.layerMeshes = Object.fromEntries(LAYERS.map(l => [l, []]));
    this.layerOn = { clothes: true, hair: true, skin: true, muscles: false, organs: false, skeleton: false }; this.depth = "dressed";
    this.opacity = { skin: 1, muscles: 1, organs: 1, skeleton: 1, clothes: 1, hair: 1 };
    this.hl = new Map(); this.camTween = null; this.clock = new THREE.Clock(); this.t = 0;
    new ResizeObserver(() => this.resize()).observe(el); this.resize();
    R.domElement.addEventListener("pointerdown", e => (this._down = [e.clientX, e.clientY]));
    R.domElement.addEventListener("pointerup", e => { if (this._down && Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) < 5) this.pickAt(e.clientX, e.clientY); });
    R.setAnimationLoop(() => this.frame());
  }
  resize() { const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1; this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = "100%"; this.renderer.domElement.style.height = "100%"; this.camera.aspect = w / h;
    if (this.shiftY) this.camera.setViewOffset(w, h, 0, h * this.shiftY, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix(); }
  // move the picture up (+) or down (-) by a share of the height, e.g. to keep the body clear of a caption
  setShift(f) { this.shiftY = f || 0; this.resize(); }

  async load(onProgress) {
    const L = new GLTFLoader(), dr = new DRACOLoader(); dr.setDecoderPath(this.opt.draco); if (this.opt.dracoType) dr.setDecoderConfig({ type: this.opt.dracoType }); L.setDRACOLoader(dr);
    let g;
    if (/\.json$/.test(this.opt.url)) {                    // the model split into base64 text parts (for hosts that only serve text)
      const base = this.opt.url.replace(/[^/]*$/, ""), man = await (await fetch(this.opt.url)).json(), out = new Uint8Array(man.bytes); let off = 0, done = 0;
      await Promise.all(man.parts.map(async (p, i) => { const t = await (await fetch(base + p)).text(); man.parts[i] = t; onProgress && onProgress(++done / man.parts.length * .9); }));
      for (const t of man.parts) { const bin = atob(t); for (let i = 0; i < bin.length; i++) out[off++] = bin.charCodeAt(i); }
      g = await L.parseAsync(out.buffer, base);
    } else g = await L.loadAsync(this.opt.url, e => onProgress && e.total && onProgress(e.loaded / e.total));
    this.root = g.scene; this.scene.add(this.root);
    this.root.traverse(o => {
      if (o.isBone) { o.userData.rest = o.quaternion.clone(); }
      if (!o.isMesh) return;
      const ex = o.userData || {}, name = ex.name_orig || o.name, layer = o.name === "Body" ? "skin" : ex.layer === "clothes" || /^Clothes/.test(o.name) ? "clothes"
        : o.name === "Hair" ? "hair" : ex.layer === "skeleton" ? "skeleton" : ex.layer === "muscles" ? "muscles" : ex.layer === "organs" ? "organs" : "skin";
      o.userData.part = name; o.userData.layerName = layer; o.frustumCulled = false;
      this.layerMeshes[layer].push(o); this.parts.set(name, o);
      if (layer === "skin" && o.name === "Body") this._skinMaterial(o);
      else if (layer === "skeleton") { o.material = this._mat(o.material, { roughness: .62 }); if (/ligament/i.test(name)) o.userData.alphaK = .45; }   /* ligaments: see the vertebrae through them */
      else if (layer === "muscles") o.material = this._mat(o.material, { roughness: .42, color: 0x9c2b22 });
      else if (layer === "organs") o.material = this._mat(o.material, { roughness: .38 });
      o.userData.baseMat = o.material;
    });
    this.bones = {}; this.root.traverse(o => { if (o.isBone) this.bones[o.name] = o; });
    this._feet = [this.bones.footL, this.bones.footR].filter(Boolean);
    this.root.updateMatrixWorld(true); this._footRest = this._footPos();
    // anatomical axes: each bone rotates about the body's own axes as they were in the rest pose
    // (X = left-right: flexion/extension, Y = vertical: rotation, Z = front-back: side bend / abduction)
    for (const k in this.bones) { const B = this.bones[k], q = new THREE.Quaternion(); if (B.parent) B.parent.getWorldQuaternion(q); const rq = this.root.getWorldQuaternion(new THREE.Quaternion()).invert(); q.premultiply(rq); B.userData.pr = q.clone(); B.userData.pri = q.clone().invert();
      B.userData.restPos = B.position.clone(); B.userData.ps = B.parent ? B.parent.getWorldScale(new THREE.Vector3()).x / this.root.getWorldScale(new THREE.Vector3()).x : 1; }
    this._setupExtremities();
    // bones -> muscles -> skin
    this.drive = new MuscleDrive(this); this.root.updateMatrixWorld(true);
    try { this.driveStats = this.drive.setup(); } catch (e) { console.warn("muscle drive off:", e); this.drive = null; }
    this._tuckShoes();
    this.applyLayers(); this.dispatchEvent(new Event("ready"));
    return this;
  }
  // flexion axes of the fingers, thumb and wrist from the palm of the rest pose (the hands are turned their own way,
  // so body axes do not fit them): a finger bends toward the palm, the thumb toward the index finger and the palm
  _setupExtremities() {
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert(), V = THREE.Vector3;
    const P = n => this.bones[n] ? this.bones[n].getWorldPosition(new V()).applyMatrix4(inv) : null;
    const dir = (n, next, prev) => { const a = P(n), b = next && P(next); return (b ? b.sub(a) : a.clone().sub(P(prev))).normalize(); };
    this.hand = {};
    for (const S of ["L", "R"]) {
      if (!this.bones["wrist" + S] || !this.bones["finger5-1" + S]) continue;
      const h = P("finger3-1" + S).sub(P("wrist" + S)).normalize(), across = P("finger5-1" + S).sub(P("finger2-1" + S));
      const n = new V().crossVectors(h, across).normalize().multiplyScalar(S === "L" ? this.PALM : -this.PALM), ax = {};
      for (let f = 2; f <= 5; f++) for (let j = 1; j <= 3; j++) {
        const nm = `finger${f}-${j}${S}`; if (!this.bones[nm]) continue;
        ax[nm] = new V().crossVectors(dir(nm, j < 3 ? `finger${f}-${j + 1}${S}` : null, `finger${f}-${j - 1}${S}`), n).normalize();
      }
      const toIndex = P("finger2-1" + S).sub(P("finger1-2" + S));
      for (let j = 1; j <= 3; j++) {
        const nm = `finger1-${j}${S}`; if (!this.bones[nm]) continue;
        const d = dir(nm, j < 3 ? `finger1-${j + 1}${S}` : null, `finger1-${j - 1}${S}`);
        const u = toIndex.clone().sub(d.clone().multiplyScalar(toIndex.dot(d))).normalize();
        const p = j === 1 ? n.clone().add(u.multiplyScalar(this.THUMB_OPP)) : u.add(n);     // CMC: toward the palm and across it (opposition)
        p.sub(d.clone().multiplyScalar(p.dot(d))).normalize(); ax[nm] = new V().crossVectors(d, p).normalize();
      }
      ax["wrist" + S] = new V().crossVectors(h, n).normalize();
      // spreading: index, ring and little finger turn away from the middle finger about the palm normal
      const mid = P("finger3-1" + S), spread = {};
      for (const [f, deg] of [[2, 12], [4, 9], [5, 18]]) {
        const nm = `finger${f}-1${S}`; if (!this.bones[nm]) continue;
        const d = dir(nm, `finger${f}-2${S}`), away = P(nm).sub(mid), k = new V().crossVectors(n, d);
        spread[nm] = { axis: n.clone().multiplyScalar(k.dot(away) > 0 ? 1 : -1), deg };
      }
      this.hand[S] = { n, ax, spread };
    }
    // forearm rotation (+ pronation: palm turns down / back, - supination: palm up / forward). The radius turns about the
    // line from its own head at the elbow to the head of the ulna at the wrist; the ulna stays still; the hand goes with
    // the radius. The rig's lower forearm bone carries the radius and the hand, so it is turned about that line.
    this.forearm = {};
    const cap = (name, near, far, prox) => {
      const m = this.parts.get(name); if (!m) return null;
      const p = m.geometry.attributes.position, v = new V(), u = far.clone().sub(near).normalize(), T = [], Q = [];
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.bindMatrix).applyMatrix4(inv); Q.push(v.clone()); T.push(v.clone().sub(near).dot(u)); }
      const lo = Math.min(...T), hi = Math.max(...T), L = hi - lo, c = new V(); let n = 0;
      Q.forEach((q, i) => { if (prox ? T[i] < lo + .06 * L : T[i] > hi - .06 * L) { c.add(q); n++; } });
      return n ? c.multiplyScalar(1 / n) : null;
    };
    for (const [S, s] of [["L", "l"], ["R", "r"]]) {
      const B = this.bones["lowerarm02" + S], E = P("lowerarm01" + S), W = P("wrist" + S); if (!B || !E || !W) continue;
      const C0 = cap(`Radius.${s}`, E, W, true) || E, C1 = cap(`Ulna.${s}`, E, W, false) || W;
      B.parent.updateMatrixWorld(true); const Mi = new THREE.Matrix4().copy(inv).multiply(B.parent.matrixWorld).invert();
      const c = C0.clone().applyMatrix4(Mi), a = C1.clone().applyMatrix4(Mi).sub(c).normalize();
      this.forearm[S] = { bone: B, c, a, pos0: B.position.clone(), sign: (S === "L" ? 1 : -1) * this.PRON, cRoot: C0.clone(), aRoot: C1.clone().sub(C0).normalize() };
      const ul = this.parts.get(`Ulna.${s}`), k = ul && ul.isSkinnedMesh ? ul.skeleton.bones.indexOf(this.bones["lowerarm01" + S]) : -1;
      if (k >= 0) { const si = ul.geometry.attributes.skinIndex, sw = ul.geometry.attributes.skinWeight; for (let i = 0; i < si.count; i++) { si.setXYZW(i, k, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); } si.needsUpdate = sw.needsUpdate = true; }
    }
    this._balls = ["toe2-1L", "toe2-1R"].map(n => this.bones[n]).filter(Boolean);
    const C = { root: .1, spine04: .1, spine03: .1, spine02: .1, spine01: .1, neck02: .055, head: .1, upperarm01L: .055, upperarm01R: .055, lowerarm01L: .035, lowerarm01R: .035,
      wristL: .025, wristR: .025, "finger3-1L": .012, "finger3-1R": .012, lowerleg01L: .05, lowerleg01R: .05, upperleg02L: .075, upperleg02R: .075, footL: .055, footR: .055, "toe2-1L": .015, "toe2-1R": .015, "toe2-3L": .01, "toe2-3R": .01 };
    this._contacts = Object.entries(C).filter(([n]) => this.bones[n]).map(([n, r]) => [this.bones[n], r]);
    this._feetRest = ["footL", "footR", "toe2-1L", "toe2-1R"].map(n => this.bones[n]).filter(Boolean).map(b => [b, b.getWorldPosition(new THREE.Vector3()).y]);
    this._ballRest = this._ballPos();
  }
  _ballPos() { const v = new THREE.Vector3(), s = new THREE.Vector3(); (this._balls || []).forEach(f => s.add(f.getWorldPosition(v))); return s.multiplyScalar(1 / ((this._balls || []).length || 1)); }
  // rotate a bone about an axis given in the root frame of the rest pose (degrees)
  _rotAx(b, axis, deg) {
    const B = this.bones[b]; if (!B || !axis || !deg) return;
    this._q.setFromAxisAngle(axis, deg * D2R); this._q2.copy(B.userData.pri).multiply(this._q).multiply(B.userData.pr); B.quaternion.premultiply(this._q2);
  }
  /* ---------------- motion: sequences, exercises, walking ---------------- */
  // the pose a frame describes, starting from the state before it
  _frameState(prev, f) {
    const save = this.target; this.target = { ...prev };
    if (f.pose) this.preset(f.pose, f.amount == null ? 1 : f.amount);
    if (f.set) this.setPose(f.set);
    if (f.face) this.expression(f.face, f.faceAmount == null ? 1 : f.faceAmount);
    if (f.hand) this.gesture(f.hand.gesture, f.hand.side || "both", f.hand.amount == null ? 1 : f.hand.amount);
    const out = this.target; this.target = save; return out;
  }
  // play frames (see EXERCISES for the format); loop = how many times; speed > 1 faster
  animate(frames, { loop = 1, speed = 1, end = null, name = "custom" } = {}) {
    if (!Array.isArray(frames) || !frames.length) throw new Error("frames: a non-empty list");
    this.walking = null; const segs = []; let st = { ...this.target };
    const L = Math.max(1, Math.min(50, loop));
    const push = (f, r) => { const nx = this._frameState(st, f); segs.push({ a: st, b: nx, dur: Math.max(.05, f.dur == null ? 1 : +f.dur), hold: Math.max(0, +f.hold || 0),
      say: f.say || "", ex: f._ex || name, rep: f._rep != null ? f._rep : r + 1, reps: f._reps != null ? f._reps : L }); st = nx; };
    for (let r = 0; r < L; r++) frames.forEach(f => push(f, r));
    if (end) push({ _rep: 0, ...end }, 0);
    this.anim = { segs, t: 0, speed: Math.max(.1, +speed || 1), total: segs.reduce((s, g) => s + g.dur + g.hold, 0), name, i: -1 };
    return { ok: true, name, seconds: +(this.anim.total / this.anim.speed).toFixed(1) };
  }
  exercise(name, reps, speed = 1) {
    const E = EXERCISES[name]; if (!E) throw new Error("unknown exercise " + name);
    // every frame is tagged with its exercise and repetition, for the caption and the "motion" events
    const onFloor = (this.lying || 0) > .5, tag = (fs, ex, rep, n) => fs.map(f => ({ ...f, _ex: ex, _rep: rep, _reps: n }));
    const startFrames = n => { const X = EXERCISES[n]; return X.start && !onFloor ? tag(EXERCISES[X.start].frames, n, 0, 0) : []; };
    const one = (n, k) => { const X = EXERCISES[n], out = []; for (let r = 0; r < k; r++) out.push(...tag(X.frames, X.hidden ? name : n, X.hidden ? 0 : r + 1, X.hidden ? 0 : k)); if (X.end) out.push(...tag([X.end], X.hidden ? name : n, 0, 0)); return out; };
    const frames = [];
    if (E.program) { for (let r = 0; r < (reps || 1); r++) { frames.push(...startFrames(E.program[0])); for (const n of E.program) frames.push(...one(n, EXERCISES[n].loop)); } }
    else frames.push(...startFrames(name), ...one(name, reps || E.loop));
    return this.animate(frames, { loop: 1, speed, end: E.program ? { pose: "stand", dur: 1.5, say: "Встаньте", _ex: name, _rep: 0, _reps: 0 } : null, name });
  }
  // walking in place (as on a treadmill): legs follow typical gait angles, arms swing against the legs
  walk(on = true, speed = 1) {
    this.anim = null; this.walking = on ? { phase: 0, speed: Math.max(.2, Math.min(2.5, +speed || 1)) } : null; if (!on) this.preset("stand");
    this.dispatchEvent(new CustomEvent(on ? "motion" : "motion-end", { detail: { name: "walk", exercise: "walk", rep: 0, reps: 0, say: on ? "Ходьба на месте" : "" } })); return { ok: true, walking: !!on };
  }
  pauseMotion(on = true) { this.paused = !!on; return { ok: true, paused: this.paused }; }
  stopMotion() { this.paused = false; const was = !!(this.anim || this.walking), name = this.anim ? this.anim.name : this.walking ? "walk" : null; this.anim = null; this.walking = null; if (was) this.dispatchEvent(new CustomEvent("motion-end", { detail: { name, stopped: true } })); return { ok: true, stopped: was }; }
  // highlight several parts by exact name (both sides when the name has no .l/.r)
  highlightMany(names, color = "#ffb000") {
    this.clearHighlight(); let n = 0;
    for (const base of names) for (const nm of [base, base + ".l", base + ".r"]) if (this.parts.has(nm)) { this.highlight(nm, color, false); n++; }
    return n;
  }
  _motion(dt) {
    if (this.anim) {
      const A = this.anim; if (!this.paused) A.t += dt * A.speed; let t = A.t, i = 0;
      while (i < A.segs.length && t > A.segs[i].dur + A.segs[i].hold) { t -= A.segs[i].dur + A.segs[i].hold; i++; }
      const g = A.segs[Math.min(i, A.segs.length - 1)], u = i >= A.segs.length ? 1 : Math.min(1, t / g.dur), e = u * u * (3 - 2 * u);
      if (i !== A.i && i < A.segs.length) { A.i = i; this.dispatchEvent(new CustomEvent("motion", { detail: { name: A.name, exercise: g.ex, rep: g.rep, reps: g.reps, say: g.say, step: i + 1, steps: A.segs.length, seconds: +(A.total / A.speed).toFixed(1) } })); }
      for (const k of POSE_KEYS) if (k !== "breath") { const v = g.a[k] + (g.b[k] - g.a[k]) * e; this.pose[k] = this.target[k] = v; }
      if (A.t >= A.total) { this.anim = null; this.dispatchEvent(new CustomEvent("motion-end", { detail: { name: A.name } })); }
    }
    if (this.walking) {
      const W = this.walking; if (!this.paused) W.phase = (W.phase + dt * .95 * W.speed) % 1; const o = { ...ARMS_DOWN, hipFlex: 0, spineFlex: 3 };
      for (const [S, p] of [["L", W.phase], ["R", (W.phase + .5) % 1]]) {
        const g = gaitLeg(p); o["knee" + S] = g.knee; o["leg" + S + "Forward"] = g.hip - .75 * g.knee; o["ankle" + S] = g.ankle;
        o["arm" + S + "Forward"] = -9 * Math.min(1.6, W.speed) * Math.cos(2 * Math.PI * p); o["elbow" + S] = -32 + 12 * Math.max(0, -Math.cos(2 * Math.PI * p));
      }
      o.spineTwist = 5 * Math.cos(2 * Math.PI * W.phase); o.neckTwist = -o.spineTwist * .8;
      for (const S of ["L", "R"]) { o["thumb" + S] = .1; o["index" + S] = .15; o["middle" + S] = .2; o["ring" + S] = .25; o["little" + S] = .3; }   // relaxed hands
      for (const k in o) this.pose[k] = this.target[k] = o[k];
    }
  }
  // move a bone by a vector given in the body's frame of the rest pose (metres)
  _move(b, x, y, z) {
    const B = this.bones[b]; if (!B || !(x || y || z)) return;
    B.position.add(new THREE.Vector3(x, y, z).applyQuaternion(B.userData.pri).multiplyScalar(1 / (B.userData.ps || 1)));
  }
  // facial expression: neutral, smile, laugh, surprise, sad, angry, blink, wink_left, wink_right, mouth_open
  expression(name, amount = 1) {
    const E = EXPRESSIONS[name]; if (!E) throw new Error("unknown expression " + name);
    const o = {}; for (const k of FACE_KEYS) o[k] = (E[k] || 0) * amount; this.setPose(o); return o;
  }
  // gesture for one or both hands: open, relaxed, fist, point, thumbs_up, ok, peace, pinch, grip
  gesture(name, side = "both", amount = 1) {
    const g = GESTURES[name]; if (!g) throw new Error("unknown gesture " + name);
    const o = {}; for (const S of side === "left" ? ["L"] : side === "right" ? ["R"] : ["L", "R"]) { FINGERS.forEach((f, i) => (o[f + S] = g[i] * amount)); o["spread" + S] = (g[5] || 0) * amount; }
    this.setPose(o); return o;
  }
  // the shoe model reaches 22 cm up the shin (a white sock top) while the trouser legs end at ~7.5 cm; tight trousers
  // let the sock top poke through them. Above the hem the shoe is always under the trousers, so it is not drawn.
  _tuckShoes(cut = .1) {
    const m = this.parts.get("Body.shoes01") || [...this.layerMeshes.clothes].find(x => /shoe/i.test(x.name + (x.userData.part || ""))); if (!m) return;
    const mat = m.material, prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
    mat.onBeforeCompile = (sh, r) => {
      prev && prev.call(mat, sh, r); sh.uniforms.uShoeCut = { value: cut };
      sh.vertexShader = "varying float vRestY;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_SKINNING\n vRestY = (bindMatrix * vec4(position, 1.0)).y;\n#else\n vRestY = position.y;\n#endif");
      sh.fragmentShader = "varying float vRestY; uniform float uShoeCut;\n" + sh.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n if (vRestY > uShoeCut) discard;");
    };
    mat.customProgramCacheKey = () => "shoe-tuck|" + prevKey(); mat.needsUpdate = true;
  }
  _mat(m, o) { const n = new THREE.MeshStandardMaterial({ color: o.color != null ? o.color : m.color, roughness: o.roughness, metalness: 0 }); return n; }
  _skinMaterial(mesh) {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xc8987f, roughness: .55, sheen: .4, sheenColor: new THREE.Color(0xffd8c8), sheenRoughness: .6, vertexColors: true });
    m.userData.u = { uHideCloth: { value: 1 }, uHideShoes: { value: 1 } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, m.userData.u);
      sh.fragmentShader = "uniform float uHideCloth; uniform float uHideShoes;\n" + sh.fragmentShader.replace("#include <color_fragment>",
        "#ifdef USE_COLOR\n if (uHideCloth > .5 && vColor.r > .5) discard; if (uHideShoes > .5 && vColor.g > .5) discard;\n#endif");
    };
    mesh.material = m; this.skinMat = m;
  }

  /* ---------------- layers ---------------- */
  applyLayers() {
    for (const l of LAYERS) for (const m of this.layerMeshes[l]) {
      m.visible = this.layerOn[l] && !m.userData.hidden;
      if (this.hl && this.hl.has(m)) { m.renderOrder = 20; continue; }
      const a = (this.opacity[l] == null ? 1 : this.opacity[l]) * (m.userData.alphaK || 1), mat = m.material;
      const tr = a < .999; if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true; } mat.opacity = a; mat.depthWrite = a > .6; m.renderOrder = { skeleton: 1, organs: 1, muscles: 2, skin: 3, clothes: 4, hair: 4 }[l];
    }
    for (const n of ["Eyes", "Eyebrows", "Eyelashes", "Teeth", "Tongue"]) { const m = this.parts.get(n); if (m) m.visible = this.layerOn.skin && this.opacity.skin > .5; }
    if (this.skinMat) { const u = this.skinMat.userData.u; u.uHideCloth.value = this.layerOn.clothes ? 1 : 0; u.uHideShoes.value = this.layerOn.clothes ? 1 : 0; }
    this.dispatchEvent(new CustomEvent("layers", { detail: { on: { ...this.layerOn }, opacity: { ...this.opacity } } }));
  }
  setLayer(l, on) { this.depth = null; if (l === "all") LAYERS.forEach(x => (this.layerOn[x] = on)); else if (l in this.layerOn) this.layerOn[l] = !!on; this.applyLayers(); }
  setOpacity(l, a) { if (l in this.opacity) this.opacity[l] = Math.max(0, Math.min(1, a)); this.applyLayers(); }
  // peel down to one depth: dressed | skin | muscles | skeleton | xray (skin ghosted over muscles over bones)
  peel(depth) {
    // order: clothes, hair, skin, muscles, organs, skeleton
    const P = { dressed: [1, 1, 1, 0, 0, 0], skin: [0, 1, 1, 0, 0, 0], muscles: [0, 0, 0, 1, 0, 0], skeleton: [0, 0, 0, 0, 0, 1], xray: [0, 0, 1, 1, 0, 1],
      muscles_bones: [0, 0, 0, 1, 0, 1], organs: [0, 0, 1, 0, 1, 1], organs_only: [0, 0, 0, 0, 1, 0] }[depth];
    if (!P) throw new Error("unknown depth " + depth);
    LAYERS.forEach((l, i) => (this.layerOn[l] = !!P[i])); this.depth = depth;
    this.opacity.skin = depth === "xray" ? .18 : depth === "organs" ? .14 : 1; this.opacity.muscles = depth === "xray" ? .45 : depth === "muscles_bones" ? .55 : 1;
    this.applyLayers();
  }

  /* ---------------- parts ---------------- */
  find(q) {
    if (!q) return [];
    if (this.parts.has(q)) return [this.parts.get(q)];
    const s = String(q).toLowerCase().trim(), out = [];
    const vm = s.match(/^([ctl])\s*-?\s*(\d{1,2})$/i);                     // "L4", "c 7"
    if (vm) { const k = vm[1].toUpperCase() + vm[2]; const n = k === "C1" ? "Atlas (C1)" : k === "C2" ? "Axis (C2)" : "Vertebra " + k; return this.parts.has(n) ? [this.parts.get(n)] : []; }
    const dm = s.match(/^([ctl]\d{1,2})\s*[-–]\s*([ctls]\d{1,2})$/i);        // "L4-L5" disc
    if (dm) { const n = `Intervertebral disc ${dm[1].toUpperCase()}-${dm[2].toUpperCase()}`; return this.parts.has(n) ? [this.parts.get(n)] : []; }
    const groups = { "позвоночник": /^(Vertebra|Atlas|Axis|Sacrum|Coccyx|Intervertebral disc)/, spine: /^(Vertebra|Atlas|Axis|Sacrum|Coccyx|Intervertebral disc)/,
      "поясничный": /^Vertebra L|disc (L|T12-L)/, lumbar: /^Vertebra L|disc (L|T12-L)/, "грудной": /^Vertebra T|disc T/, thoracic: /^Vertebra T|disc T/,
      "шейный": /^(Vertebra C|Atlas|Axis)|disc C/, cervical: /^(Vertebra C|Atlas|Axis)|disc C/, "рёбра": / rib\.[lr]$/, ribs: / rib\.[lr]$/, "диски": /disc/, discs: /disc/,
      "таз": /^(Hip bone|Sacrum|Coccyx)/, pelvis: /^(Hip bone|Sacrum|Coccyx)/,
      "органы": /lung|Trachea|atrium|ventricle|Pulmonary trunk|Oesophagus|Stomach|Duodenum|Jejunum|colon|appendix|Liver|Gallbladder|Pancreas|Spleen|bladder|Suprarenal/, organs: /lung|Trachea|atrium|ventricle|Pulmonary trunk|Oesophagus|Stomach|Duodenum|Jejunum|colon|appendix|Liver|Gallbladder|Pancreas|Spleen|bladder|Suprarenal/,
      "лёгкие": /lobe of (left|right) lung/, "легкие": /lobe of (left|right) lung/, lungs: /lobe of (left|right) lung/,
      "сердце": /^(Right|Left) (atrium|ventricle)$|Pulmonary trunk/, heart: /^(Right|Left) (atrium|ventricle)$|Pulmonary trunk/,
      "кишечник": /Duodenum|Jejunum|colon|appendix/, intestines: /Duodenum|Jejunum|colon|appendix/, "череп": /(Frontal|Parietal|Occipital|Temporal|Sphenoid|Ethmoid) bone|Mandible|Maxilla|Zygomatic/, skull: /(Frontal|Parietal|Occipital|Temporal|Sphenoid|Ethmoid) bone|Mandible|Maxilla|Zygomatic/ };
    if (groups[s]) { for (const [n, m] of this.parts) if (groups[s].test(n)) out.push(m); return out; }
    for (const [n, m] of this.parts) if (n.toLowerCase() === s || ruName(n).toLowerCase() === s) return [m];
    for (const [n, m] of this.parts) if (n.toLowerCase().includes(s) || ruName(n).toLowerCase().includes(s)) out.push(m);
    return out;
  }
  info(mesh) { const n = mesh.userData.part; return { name: n, ru: ruName(n), layer: mesh.userData.layerName }; }
  highlight(q, color = "#ffb000", exclusive = true) {
    if (exclusive) this.clearHighlight();
    const ms = this.find(q);
    for (const m of ms) {
      if (!this.layerOn[m.userData.layerName]) { this.layerOn[m.userData.layerName] = true; this.applyLayers(); }
      const mm = m.userData.baseMat.clone(); mm.emissive = new THREE.Color(color); mm.emissiveIntensity = .55; mm.color = new THREE.Color(color).lerp(mm.color, .4);
      mm.defines = { ...(m.userData.baseMat.defines || {}) };
      mm.depthTest = false; mm.transparent = true; mm.opacity = 1; m.material = mm; this.hl.set(m, mm);   /* seen through the layers above it */
      if (this.drive && m.userData.layerName === "muscles") this.drive.hookClone(m, mm);
    }
    // a bone under muscles and skin: thin the layers above so its surroundings stay readable
    if (ms.some(m => m.userData.layerName === "skeleton")) { if (this.layerOn.muscles) this.opacity.muscles = Math.min(this.opacity.muscles, .3); if (this.layerOn.skin) this.opacity.skin = Math.min(this.opacity.skin, .15); }
    this.applyLayers(); for (const m of ms) m.renderOrder = 20;
    return ms.map(m => this.info(m));
  }
  clearHighlight() { for (const [m] of this.hl) m.material = m.userData.baseMat; this.hl.clear(); this.applyLayers(); }
  hide(q, on = true) { const ms = this.find(q); ms.forEach(m => (m.userData.hidden = on)); this.applyLayers(); return ms.length; }
  partBox(ms) { const b = new THREE.Box3(); for (const m of ms) { m.updateMatrixWorld(true); const bb = new THREE.Box3(); m.geometry.computeBoundingBox(); const g = m.geometry.boundingBox.clone(); bb.copy(g).applyMatrix4(m.matrixWorld); b.union(this._skinnedBox(m) || bb); } return b; }
  _skinnedBox(m) {
    if (!m.isSkinnedMesh) return null; const p = m.geometry.attributes.position, v = new THREE.Vector3(), b = new THREE.Box3(), step = Math.max(1, Math.floor(p.count / 300));
    for (let i = 0; i < p.count; i += step) { m.getVertexPosition(i, v); b.expandByPoint(v.applyMatrix4(m.matrixWorld)); } return b;
  }
  focus(q, pad = 1.6) {
    const ms = Array.isArray(q) ? q : this.find(q); if (!ms.length) return null;
    const b = this.partBox(ms), c = b.getCenter(new THREE.Vector3()), r = Math.max(.16, b.getSize(new THREE.Vector3()).length() / 2);   /* never closer than the region around the part */
    const T = this.camTween, dir = (T ? T.b.p.clone().sub(T.b.t) : this.camera.position.clone().sub(this.controls.target)).normalize(), dist = r * pad / Math.tan(this.camera.fov * D2R / 2);
    this.tweenCam(c, c.clone().add(dir.multiplyScalar(dist))); return { center: c.toArray() };
  }
  view(angle = "front", dist) {
    const c = this.camTween ? this.camTween.b.t.clone() : this.controls.target.clone(), d = dist || this.camera.position.distanceTo(c);
    const dirs = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0], top: [0, 1, .001], bottom: [0, -1, .001], three_quarter: [.7, .15, .7] };
    const v = new THREE.Vector3(...(dirs[angle] || dirs.front)).normalize().multiplyScalar(d);
    this.tweenCam(c, c.clone().add(v));
  }
  // frame the whole body from one side (used when it lies down or stands up)
  fitView(angle = "front") {
    this.root.updateMatrixWorld(true); const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const n of ["head", "root", "footL", "footR", "wristL", "wristR", "lowerleg01L", "upperarm01L", "upperarm01R"]) if (this.bones[n]) b.expandByPoint(this.bones[n].getWorldPosition(v));
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(.5, b.getSize(new THREE.Vector3()).length() / 2 + .15);
    const dirs = { front: [0, .12, 1], left: [1, .35, .12], back: [0, .12, -1] }; let d = new THREE.Vector3(...(dirs[angle] || dirs.front));
    if (angle === "side") {            // lying: look across the body (perpendicular to head-pelvis), from a little above, on the side the face is
      const ax = this.bones.head.getWorldPosition(new THREE.Vector3()).sub(this.bones.root.getWorldPosition(new THREE.Vector3())); ax.y = 0;
      d = new THREE.Vector3(-ax.z, 0, ax.x).normalize(); const face = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion); if (d.dot(face) < 0) d.negate(); d.y = .45;
    }
    const half = Math.min(this.camera.fov * D2R / 2, Math.atan(Math.tan(this.camera.fov * D2R / 2) * this.camera.aspect));   // narrow screens: the width decides
    d.normalize(); this.tweenCam(c, c.clone().add(d.multiplyScalar(r / Math.tan(half) * 1.2)), 1.2);
  }
  zoom(f) { const c = this.controls.target, p = this.camera.position.clone().sub(c).multiplyScalar(1 / f).add(c); this.tweenCam(c.clone(), p); }
  resetView() { this.tweenCam(new THREE.Vector3(0, .95, 0), new THREE.Vector3(0, 1.1, 4.2)); }
  tweenCam(target, pos, dur = .9) { this.camTween = { t0: this.t, dur, a: { t: this.controls.target.clone(), p: this.camera.position.clone() }, b: { t: target, p: pos } }; }
  setScale(s) { this.root.scale.setScalar(s); }
  pickAt(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect(), nd = new THREE.Vector2((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(nd, this.camera);
    const vis = []; this.root.traverse(o => { if (o.isMesh && o.visible && o.material.opacity > .3 && o.userData.part) vis.push(o); });
    const hit = rc.intersectObjects(vis, false)[0];
    const info = hit ? this.info(hit.object) : null;
    this.dispatchEvent(new CustomEvent("pick", { detail: info })); return info;
  }

  /* ---------------- pose ---------------- */
  setPose(p, replace = false) { if (replace) for (const k of POSE_KEYS) if (k !== "breath") this.target[k] = 0; for (const k in p) if (k in this.target) this.target[k] = +p[k]; }
  preset(name, amount = 1) { const P = PRESETS[name]; if (!P) throw new Error("unknown preset " + name); const o = {}; for (const k of POSE_KEYS) if (k !== "breath" && (!HAND_KEYS.includes(k) || k in P)) o[k] = (P[k] || 0) * amount; this.setPose(o); }
  bendRegion(region, { flex = 0, side = 0, twist = 0 } = {}) { this.regionBend = this.regionBend || {}; this.regionBend[region] = { flex, side, twist }; }
  _footPos() { const v = new THREE.Vector3(), s = new THREE.Vector3(); this._feet.forEach(f => s.add(f.getWorldPosition(v))); return s.multiplyScalar(1 / (this._feet.length || 1)); }
  // rotate bone b about the body's anatomical axes, degrees: x = flexion (+ tips an upward bone forward), y = turn to the body's left, z = tip to the body's right
  _rot(b, x, y, z) {
    const B = this.bones[b]; if (!B || !(x || y || z)) return;
    this._e.set(x * D2R, y * D2R, z * D2R, "XYZ"); this._q.setFromEuler(this._e);
    this._q2.copy(B.userData.pri).multiply(this._q).multiply(B.userData.pr);       // body-axis rotation expressed in the bone's parent frame
    B.quaternion.premultiply(this._q2);
  }
  _applyPose() {
    const P = this.pose; this._e = this._e || new THREE.Euler(); this._q = this._q || new THREE.Quaternion(); this._q2 = this._q2 || new THREE.Quaternion();
    for (const k in this.bones) { const B = this.bones[k]; if (B.userData.rest) B.quaternion.copy(B.userData.rest); if (B.userData.restPos && k !== "root") B.position.copy(B.userData.restPos); }
    this._e.set(P.bodyPitch * D2R, 0, P.bodyRoll * D2R, "XYZ"); this.root.quaternion.setFromEuler(this._e);
    const br = P.breath * (this.live ? Math.sin(this.t * 1.6) : 0);
    // trunk: hip hinge at the pelvis, then the spine segment by segment, then the neck
    this._rot("root", P.hipFlex, 0, 0);
    for (const s of SPINE) this._rot(s, P.spineFlex * SHARE.flex[s] - (s === "spine01" ? br * .9 : 0), P.spineTwist * SHARE.twist[s], P.spineSide * SHARE.side[s]);
    if (this.regionBend) for (const r in this.regionBend) { const rb = this.regionBend[r], segs = REGION[r] || []; for (const s of segs) this._rot(s, rb.flex / segs.length, rb.twist / segs.length, rb.side / segs.length); }
    for (const s of NECK) this._rot(s, P.neckFlex * (SHARE.nflex[s] || 0) + (s === "neck01" ? br * .6 : 0), P.neckTwist * (SHARE.ntwist[s] || 0), P.neckSide * (SHARE.nside[s] || 0));
    this._rot("clavicleL", 0, 0, -br * .5); this._rot("clavicleR", 0, 0, br * .5);
    this._face(P);
    // legs: undo the hip hinge so they stay upright, then hip flexion/abduction, knee, and a foot that stays flat
    for (const [S, K, A] of [["L", P.kneeL, P.hipLRaise], ["R", P.kneeR, P.hipRRaise]]) {
      const th = K * .75, LF = P["leg" + S + "Forward"];                 // LF: the thigh forward (hip flexion of one leg), as in a step
      this._rot("upperleg01" + S, -P.hipFlex - th - LF, 0, S === "L" ? -A : A);
      this._rot("lowerleg01" + S, K, 0, 0);
      this._rot("foot" + S, -(K - th) + LF + P["ankle" + S], 0, 0);      // + ankle: plantar flexion (point the foot), relative to a level foot
      const t = P["toes" + S];                                            // + curl the toes down, - lift them (as on tiptoe)
      if (t) for (let k = 1; k <= 5; k++) { this._rot(`toe${k}-1${S}`, t, 0, 0); if (t > 0) { this._rot(`toe${k}-2${S}`, t * .8, 0, 0); this._rot(`toe${k}-3${S}`, t * .5, 0, 0); } }
    }
    // arms: abduction (raise to the side), flexion (raise forward), elbow flexion
    // shoulder girdle joins the arm: past ~30° the clavicle lifts a little and, reaching forward, the scapula slides forward,
    // so the arm keeps the asked angle and the shoulder does not tear (the rig moves clavicle and scapula as one piece,
    // so the lift is kept small: a full 2:1 scapulohumeral rhythm would swing the scapula out of the back)
    for (const [S, R, F, sg] of [["L", P.armLRaise, P.armLForward, 1], ["R", P.armRRaise, P.armRForward, -1]]) {
      const on = this.rhythm !== false, elev = on ? Math.min(15, .15 * Math.max(0, R - 30) + .1 * Math.max(0, F - 40)) : 0, prot = on ? Math.min(18, .18 * Math.max(0, F - 20)) : 0;
      this._rot("clavicle" + S, 0, -sg * prot, sg * elev);
      this._rot("upperarm01" + S, -F, sg * prot, sg * (R - elev));
    }
    this._rot("lowerarm01L", -P.elbowL, 0, 0); this._rot("lowerarm01R", -P.elbowR, 0, 0);
    // forearm: the radius (and the hand) turns about the radioulnar axis
    if (this.forearm) for (const S of ["L", "R"]) {
      const F = this.forearm[S]; if (!F) continue; F.bone.position.copy(F.pos0); const th = P["forearm" + S] * F.sign; if (!th) continue;
      this._q.setFromAxisAngle(F.a, th * D2R); F.bone.quaternion.premultiply(this._q); F.bone.position.sub(F.c).applyQuaternion(this._q).add(F.c);
    }
    // wrists and fingers about the hand's own axes
    if (this.hand) for (const S of ["L", "R"]) {
      const H = this.hand[S]; if (!H) continue;
      for (const nm in H.spread) this._rotAx(nm, H.spread[nm].axis, P["spread" + S] * H.spread[nm].deg);
      this._rotAx("wrist" + S, H.ax["wrist" + S], P["wrist" + S + "Flex"]);
      FINGERS.forEach((f, i) => {
        const c = P[f + S]; if (!c) return; const T = i === 0 ? this.CURL.thumb : this.CURL.finger;
        for (let j = 1; j <= 3; j++) this._rotAx(`finger${i + 1}-${j}${S}`, H.ax[`finger${i + 1}-${j}${S}`], c * T[j - 1]);
      });
    }
    // keep the feet planted: move the whole body so the feet stay where they stood
    this.root.position.set(0, 0, 0); this.root.updateMatrixWorld(true);
    // feet on the floor: across the floor the feet stay where they stood (the balls of the feet when pointing them, as on
    // tiptoe); up and down, the lowest point of either foot (heel or ball) touches the floor, so a lifted leg in a step
    // or a march does not pull the body up
    const w = Math.min(1, Math.max(0, Math.max(P.ankleL, P.ankleR) / 15)), f = this._footPos(), rest = this._footRest.clone();
    if (w > 0 && this._ballRest) { f.lerp(this._ballPos(), w); rest.lerp(this._ballRest, w); }
    let dy = rest.y - f.y;
    if (this._feetRest) {
      const v = new THREE.Vector3(); let lo = Infinity;
      this._feetRest.forEach(([b, r]) => { lo = Math.min(lo, b.getWorldPosition(v).y - r); });
      if (isFinite(lo)) dy = -lo;
    }
    // on the floor: whatever is lowest (back, pelvis, head, knees, hands, feet: bone centres less the body's thickness
    // there) lies on the floor, and the pelvis stays over the middle of the floor
    const lying = Math.min(1, Math.max(0, (Math.abs(P.bodyPitch) + Math.abs(P.bodyRoll) - 8) / 30));
    if (lying > 0 && this._contacts) {
      const v = new THREE.Vector3(); let lo = Infinity;
      for (const [b, r] of this._contacts) lo = Math.min(lo, b.getWorldPosition(v).y - r);
      const pel = this.bones.root.getWorldPosition(new THREE.Vector3());
      this.root.position.set((rest.x - f.x) * (1 - lying) - pel.x * lying, dy * (1 - lying) - lo * lying, (rest.z - f.z) * (1 - lying) - pel.z * lying);
    } else this.root.position.set(rest.x - f.x, dy, rest.z - f.z);
    this.lying = lying;
  }
  // face: the jaw turns about the jaw joint; eyelids turn about the eye centre; mouth corners and brows are moved
  // (millimetres, in the body frame: x to the body's left, y up, z forward); the eyes turn for the gaze
  _face(P) {
    const sm = P.smile, up = Math.max(0, sm), dn = Math.max(0, -sm), bw = P.brows, bu = Math.max(0, bw), bd = Math.max(0, -bw);
    const t = this.t, auto = this.live ? Math.max(0, 1 - Math.abs(((t % 4.3) - 4.15) / .09)) : 0;      // a natural blink every ~4 s
    this._rot("jaw", P.jawOpen, 0, 0);
    for (const [S, sg] of [["L", 1], ["R", -1]]) {
      const bl = Math.min(1, P["blink" + S] + auto);
      this._rot("orbicularis03" + S, bl * 34, 0, 0); this._rot("orbicularis04" + S, -bl * 6 - up * 7, 0, 0);   // upper lid down; lower lid up (also in a real smile)
      for (const c of ["oris03" + S, "oris07" + S]) this._move(c, sg * (.009 * up + .002 * dn), .008 * up - .007 * dn, -.004 * up);
      this._move("risorius03" + S, sg * .006 * up, .006 * up - .003 * dn, -.002 * up);
      this._move("levator05" + S, sg * .002 * up, .004 * up, 0);
      this._move("oculi01" + S, -sg * .003 * bd, .005 * bu - .003 * bd, .001 * bu);                           // brows: up, or down and together
      this._move("oculi02" + S, 0, .004 * bu - .002 * bd, 0);
      this._rot("eye" + S, -P.lookY, P.lookX, 0);
    }
  }
  frame() {
    const raw = Math.min(.25, this.clock.getDelta()), dt = Math.min(.05, raw); this.t += raw;   // motion keeps real time on slow devices
    if (this.root) {
      this._motion(raw);
      const k = 1 - Math.exp(-dt * 5); for (const key of POSE_KEYS) this.pose[key] += (this.target[key] - this.pose[key]) * k;
      this._applyPose();
      if (this.drive) { this.root.updateMatrixWorld(true); this.drive.update(dt); }
      this.floor.material.opacity = .8 * (this.lying || 0); this.floor.visible = this.lying > .01;
      const down = (this.lying || 0) > .5; if (down !== !!this._wasDown) { this._wasDown = down; this.fitView(down ? "side" : "front"); }
    }
    if (this.camTween) {
      const T = this.camTween, u = Math.min(1, (this.t - T.t0) / T.dur), e = u * u * (3 - 2 * u);
      this.controls.target.lerpVectors(T.a.t, T.b.t, e); this.camera.position.lerpVectors(T.a.p, T.b.p, e); if (u >= 1) this.camTween = null;
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
  // jump to the end of every running transition (pose and camera) — for scripts, tests and screenshots
  muscles({ drive, skin, tension } = {}) {
    if (!this.drive) return { ok: false, error: "muscle drive unavailable" };
    if (drive != null) this.drive.enabled = !!drive; if (skin != null) this.drive.skinOn = !!skin; if (tension != null) this.drive.tension = !!tension;
    return { ok: true, drive: this.drive.enabled, skin: this.drive.skinOn, tension: this.drive.tension };
  }
  // "dqs" (default: limbs keep their volume at bent joints) or "linear" (the classic blend, for comparison)
  skinning(mode) {
    const lin = mode === "linear"; this.skinMode = lin ? "linear" : "dqs";
    this.root.traverse(o => { if (o.isSkinnedMesh) for (const mt of [o.material, o.userData.baseMat]) if (mt) setLinearSkinning(mt, lin); });
    return { ok: true, skinning: this.skinMode };
  }
  muscleReport(n) { return this.drive ? this.drive.report(n).map(r => ({ ...r, ru: ruName(r.name) })) : []; }
  snap() { for (const k of POSE_KEYS) this.pose[k] = this.target[k]; if (this.camTween) { const T = this.camTween; this.controls.target.copy(T.b.t); this.camera.position.copy(T.b.p); this.camTween = null; } if (this.root) { this._applyPose(); if (this.drive) { this.root.updateMatrixWorld(true); for (let i = 0; i < 40; i++) this.drive.update(.1); } } }
  state() { return { pose: Object.fromEntries(POSE_KEYS.map(k => [k, Math.round(this.target[k] * 10) / 10])), layers: { ...this.layerOn }, opacity: { ...this.opacity }, highlighted: [...this.hl.keys()].map(m => m.userData.part) }; }
  listParts(filter) { const out = []; for (const [n, m] of this.parts) if (!filter || m.userData.layerName === filter) out.push({ name: n, ru: ruName(n), layer: m.userData.layerName }); return out; }
}
export { VERTEBRAE, ruName };
