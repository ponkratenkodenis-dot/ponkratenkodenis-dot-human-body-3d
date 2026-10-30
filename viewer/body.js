// HumanBody: a layered, rigged human (MakeHuman CC0 body + Z-Anatomy CC BY-SA skeleton and muscles) in three.js.
// Layers can be peeled (clothes -> skin -> muscles -> skeleton), the spine bends segment by segment,
// every part can be picked, highlighted and focused, and everything is driven by plain JSON commands (see commands.js).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { poreNormalMap, sssLights } from "./skin-detail.js";
import { ruName, VERTEBRAE } from "./names-ru.js";
import { MuscleDrive } from "./muscle-drive.js";
import { setLinearSkinning } from "./dq-skinning.js";
import { Jiggle } from "./jiggle.js";
import { hairSpring, dangleSpring } from "./hair-spring.js";
import { SkinWrap } from "./skin-wrap.js";
import { retarget } from "./retarget.js";

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
  "jawOpen", "smile", "brows", "blinkL", "blinkR", "lookX", "lookY", "legLForward", "legRForward", "bodyPitch", "bodyRoll", "seated", "chair", "box", "load",
  "lumbarFlex", "lumbarSide", "lumbarTwist", "thoracicFlex", "thoracicSide", "thoracicTwist", "breath"];
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
  // posture types (after Kendall): curvature of each region, pelvic tilt as hipFlex (+ forward = anterior tilt)
  posture_ideal: { armLRaise: -38, armRRaise: -38, elbowL: -45, elbowR: -45 },
  posture_kyphosis: { thoracicFlex: 26, neckFlex: -14, lumbarFlex: -4, armLRaise: -38, armRRaise: -38, armLForward: 8, armRForward: 8, elbowL: -40, elbowR: -40 },
  posture_lordosis: { hipFlex: 14, lumbarFlex: -20, thoracicFlex: 10, neckFlex: -4, armLRaise: -38, armRRaise: -38, elbowL: -45, elbowR: -45 },
  posture_flat_back: { hipFlex: -8, lumbarFlex: 9, thoracicFlex: -6, neckFlex: 6, armLRaise: -38, armRRaise: -38, elbowL: -45, elbowR: -45 },
  posture_sway_back: { hipFlex: -10, lumbarFlex: 2, thoracicFlex: 22, neckFlex: -14, kneeL: -4, kneeR: -4, armLRaise: -38, armRRaise: -38, elbowL: -45, elbowR: -45 },
  // right thoracic, left lumbar curve (the most common idiopathic pattern): side bends in opposite directions with vertebral rotation
  // vertebrae of the thoracic curve turned 20° toward the convexity: the right ribs go back (rib hump ~27 mm in the Adams test, dev/floorfit.js hump)
  scoliosis: { thoracicSide: -16, thoracicTwist: -20, lumbarSide: 11, lumbarTwist: 0, neckSide: 5, armLRaise: -38, armRRaise: -38, elbowL: -45, elbowR: -45 },
  adams_test: { thoracicSide: -16, thoracicTwist: -20, lumbarSide: 11, lumbarTwist: 0, spineFlex: 45, hipFlex: 55, neckFlex: 25, armLForward: 75, armRForward: 75, elbowL: -45, elbowR: -45 },
  adams_normal: { spineFlex: 45, hipFlex: 55, neckFlex: 25, armLForward: 75, armRForward: 75, elbowL: -45, elbowR: -45 },
  // on a chair (thighs level, knees 90°) and lifting a box; seated/chair/box/load drive the props and the disc estimate
  sit_chair: { seated: 1, chair: 1, kneeL: 90, kneeR: 90, legLForward: 22.5, legRForward: 22.5, armLForward: -10, armRForward: -10, armLRaise: -85, armRRaise: -85, elbowL: 50, elbowR: 50 },
  sit_upright: { seated: 1, chair: 1, kneeL: 90, kneeR: 90, legLForward: 22.5, legRForward: 22.5, armLForward: -10, armRForward: -10, armLRaise: -85, armRRaise: -85, elbowL: 50, elbowR: 50, spineFlex: -6, neckFlex: -4 },
  sit_flexed: { seated: 1, chair: 1, kneeL: 90, kneeR: 90, legLForward: 22.5, legRForward: 22.5, armLForward: -10, armRForward: -10, armLRaise: -85, armRRaise: -85, elbowL: 50, elbowR: 50, spineFlex: 28, neckFlex: 18 },
  sit_lean: { seated: 1, chair: 1, kneeL: 90, kneeR: 90, legLForward: 22.5, legRForward: 22.5, hipFlex: 38, armLForward: 30, armRForward: 30, armLRaise: -30, armRRaise: -30, elbowL: 20, elbowR: 20 },
  // fitted (dev/floorfit.js liftFit): wrists on the sides of the 40 cm box at the floor; round back = lumbar flexion 45°, knees nearly straight;
  // squat lift = neutral back, trunk ~48°, knees apart 52 cm so the box is between them; holding = box at the belly
  stoop_lift: { box: 1, load: 20, hipFlex: 82, spineFlex: 45, kneeL: 10, kneeR: 10, armLForward: 117, armRForward: 117, armLRaise: -10, armRRaise: -10, elbowL: -29, elbowR: -29 },
  squat_lift: { box: 1, load: 20, hipFlex: 40, kneeL: 141, kneeR: 141, hipLRaise: -17, hipRRaise: -17, armLForward: 36, armRForward: 36, armLRaise: -31, armRRaise: -31, elbowL: -55, elbowR: -55 },
  hold_close: { box: 1, load: 20, armLForward: -15, armRForward: -15, armLRaise: -53, armRRaise: -53, elbowL: 33, elbowR: 33 },
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
  // sitting and lifting (lessons with the disc estimate)
  sitting_postures: { ru: "Как сидеть: три посадки", loop: 1, frames: [{ pose: "sit_chair", dur: 2.5, hold: 3, say: "Сидя свободно — около 0,46 МПа" }, { pose: "sit_upright", dur: 2, hold: 3, say: "Спина активно выпрямлена — около 0,55 МПа" },
    { pose: "sit_flexed", dur: 2, hold: 3, say: "Спина согнута — около 0,9 МПа" }, { pose: "sit_chair", dur: 2, hold: 1, say: "Меняйте позу и вставайте каждые 30–40 минут" }], end: { pose: "stand", dur: 2.5, say: "Встаньте" } },
  sit_to_stand: { ru: "Встать со стула", loop: 3, frames: [{ pose: "sit_chair", dur: 1.6, hold: .6, say: "Стопы под коленями" }, { pose: "sit_lean", dur: 1.2, say: "Корпус вперёд, нос над носками" },
    { pose: "stand", set: { chair: 1 }, dur: 1.6, hold: .6, say: "Встаньте, толкаясь ногами" }, { pose: "sit_lean", set: { seated: 1 }, dur: 1.8, say: "Садитесь, отводя таз назад" }], end: { pose: "stand", dur: 1.8 } },
  lift_wrong: { ru: "Подъём груза: неправильно", loop: 2, frames: [{ pose: "stand", set: { box: 1 }, dur: 1.5, hold: .5, say: "Коробка 20 кг на полу" }, { pose: "stoop_lift", dur: 2.2, hold: 1, say: "Круглая спина, прямые ноги — около 2,3 МПа" },
    { pose: "hold_close", dur: 2, hold: 1, say: "Подъём за счёт спины" }, { pose: "stoop_lift", dur: 2.2, hold: .5, say: "Опускание тоже с круглой спиной" }], end: { pose: "stand", set: { box: 1 }, dur: 1.8, say: "Коробка на полу" } },
  lift_right: { ru: "Подъём груза: правильно", loop: 2, frames: [{ pose: "stand", set: { box: 1 }, dur: 1.5, hold: .5, say: "Коробка 20 кг на полу" }, { pose: "squat_lift", dur: 2.4, hold: 1, say: "Колени согнуты, спина ровная, груз между ног — около 1,7 МПа" },
    { pose: "hold_close", dur: 2.2, hold: 1.5, say: "Груз у тела — около 1,1 МПа" }, { pose: "squat_lift", dur: 2.4, hold: .5, say: "Опускайте так же: присед, спина ровная" }], end: { pose: "stand", set: { box: 1 }, dur: 1.8, say: "Коробка на полу" } },
  lift_compare: { ru: "Подъём груза: сравнить", program: ["lift_wrong", "lift_right"] },
  // body weight and the disc: the same model gets heavier and lighter (frames may carry "shape"); numbers from massProps
  weight_spine: { ru: "Вес и спина", loop: 1, frames: [
    { pose: "stand", peel: "skin", view: "left", shape: { breast: 0, weight: 0, muscle: 0 }, dur: 1.5, hold: 3, say: "Модель весит около 65 кг. Стоя давление в поясничном диске около 0,5 МПа" },
    { shape: { weight: 1 }, dur: 3, hold: 3, say: "Полнее на 8 кг: давление стоя выросло примерно на 15 %" },
    { shape: { weight: -1 }, dur: 3.5, hold: 3, say: "Стройнее на 6 кг: давление ниже примерно на 7 %" },
    { pose: "forward_bend", shape: { weight: 0 }, dur: 2.5, hold: 2.5, say: "В наклоне вперёд вес туловища действует как груз на рычаге: около 1,1 МПа" },
    { shape: { weight: 1 }, dur: 3, hold: 3.5, say: "Полнее в том же наклоне: давление выросло на 0,16 МПа — вдвое больше, чем стоя" },
    { pose: "stand", shape: { weight: 0 }, dur: 2.5, hold: 3, say: "Меньше лишнего веса на туловище — меньше нагрузка на диски весь день" }] },
  // a tour of the spine: regions, discs, the most loaded levels (frames highlight parts)
  spine_tour: { ru: "Как устроен позвоночник", loop: 1, frames: [
    { pose: "posture_ideal", peel: "xray", view: "left", hl: "позвоночник", dur: 2, hold: 3.5, say: "Позвоночник: 24 подвижных позвонка, крестец и копчик. Сбоку видны четыре изгиба" },
    { hl: "шейный", dur: .6, hold: 3.5, say: "Шейный отдел: 7 позвонков, самый подвижный" },
    { hl: "грудной", dur: .6, hold: 3.5, say: "Грудной: 12 позвонков, к ним крепятся рёбра, поэтому он менее подвижен" },
    { hl: "поясничный", dur: .6, hold: 3.5, say: "Поясничный: 5 самых крупных позвонков, на них приходится наибольшая нагрузка" },
    { hl: "таз", dur: .6, hold: 3, say: "Крестец и копчик соединяют позвоночник с тазом" },
    { hl: "диски", dur: .6, hold: 3.5, say: "Между позвонками 23 диска: они амортизируют и дают подвижность" },
    { hl: "L4-L5", view: { at: "spine04", dir: [1, .25, .35], dist: .7 }, dur: 1, hold: 4, say: "Чаще всего страдают нижние поясничные диски: L4–L5 и L5–S1" },
    { hl: "", pose: "forward_bend", amount: .7, view: "left", dur: 2.5, hold: 2.5, say: "При наклоне поясница сгибается, давление в диске растёт" },
    { pose: "posture_ideal", dur: 2, hold: 1, say: "Дальше — как осанка, посадка и движения меняют эту нагрузку" }], end: { pose: "stand", dur: 1.5 } },
  // posture and scoliosis (the spine coloured, the view chosen per frame)
  posture_types: { ru: "Типы осанки", loop: 1, spine: true, frames: [{ pose: "posture_ideal", view: "left", dur: 2, hold: 3, say: "Нормальная осанка: ухо, плечо, таз и лодыжка на одной линии" },
    { pose: "posture_kyphosis", dur: 2.5, hold: 3.5, say: "Сутулость: грудной кифоз усилен, голова впереди" }, { pose: "posture_lordosis", dur: 2.5, hold: 3.5, say: "Гиперлордоз: таз наклонён вперёд, поясница прогнута" },
    { pose: "posture_flat_back", dur: 2.5, hold: 3.5, say: "Плоская спина: изгибы сглажены, таз наклонён назад" }, { pose: "posture_sway_back", dur: 2.5, hold: 3.5, say: "Сутулость с провисанием: таз впереди, корпус отклонён назад" },
    { pose: "posture_ideal", dur: 2.5, hold: 2, say: "Снова нормальная осанка" }], end: { pose: "stand", dur: 2 } },
  scoliosis_adams: { ru: "Сколиоз и тест Адамса", loop: 1, spine: true, frames: [{ pose: "posture_ideal", view: "back", dur: 2, hold: 2.5, say: "Норма: позвоночник прямой, если смотреть сзади" },
    { pose: "scoliosis", dur: 3, hold: 4, say: "Сколиоз: боковой изгиб с поворотом позвонков, одно плечо выше" },
    { pose: "adams_test", peel: "skin", view: { at: "spine02", dir: [0, .35, -1], dist: 1.2 }, dur: 3, hold: 5, say: "Тест Адамса: наклон вперёд, со стороны выпуклости видно рёберное выбухание" },
    { pose: "adams_normal", dur: 2.5, hold: 3, say: "Без сколиоза спина в наклоне симметрична" }], end: { pose: "stand", dur: 2.2 } },
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

// mouth shapes from text: per letter [open 0..1, rounded 0..1] (Russian and Latin letters); lips meet on m, b, p
function visemes(text) {
  const V = { а: [.95, 0], я: [.85, 0], о: [.7, .8], ё: [.7, .7], у: [.35, 1], ю: [.4, .9], э: [.7, 0], е: [.6, 0], ы: [.45, 0], и: [.4, 0],
    a: [.95, 0], o: [.7, .8], u: [.35, 1], e: [.6, 0], i: [.4, 0], y: [.4, 0] };
  const out = [];
  for (const ch of String(text).toLowerCase()) {
    if (V[ch]) out.push(V[ch]); else if (/[мбпmbp]/.test(ch)) out.push([0, 0]); else if (/[вфvfw]/.test(ch)) out.push([.12, .1]);
    else if (/[шщжчsh]/.test(ch)) out.push([.2, .5]); else if (/[а-яёa-z]/.test(ch)) out.push([.25, 0]); else if (/[\s,.!?—-]/.test(ch)) out.push([.03, 0]);
  }
  return out.length ? out : null;
}

// pose keys an idle clip may play over (the face, the gaze, breathing)
const IDLE_FREE = new Set(["breath", "jawOpen", "smile", "brows", "blinkL", "blinkR", "lookX", "lookY"]);
const wkey = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
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
    // props: a plain chair (seat height set to this body's sitting pose at load) and a 20 kg box
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b5c, roughness: .7 }), ch = this.chairMesh = new THREE.Group();
    const bx = (w, h, d, x, y, z, m = wood) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); ch.add(o); return o; };
    this._seat = bx(.44, .035, .42, 0, 0, 0); for (const [x, z] of [[-.19, -.18], [.19, -.18], [-.19, .18], [.19, .18]]) bx(.03, 1, .03, x, 0, z).userData.leg = true;
    bx(.44, .3, .025, 0, 0, -.2).userData.back = true; ch.visible = false; this.scene.add(ch);
    const card = new THREE.MeshStandardMaterial({ color: 0xc49a62, roughness: .85 }), tape = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: .6 });
    const bo = this.boxMesh = new THREE.Group(); const b1 = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .3), card); bo.add(b1);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(.402, .302, .06), tape); bo.add(t1); bo.visible = false; this.scene.add(bo);
    this.camera = new THREE.PerspectiveCamera(32, 1, .01, 50); this.camera.position.set(0, 1.1, 4.2);
    this.controls = new OrbitControls(this.camera, R.domElement); this.controls.target.set(0, .95, 0); this.controls.enableDamping = true;
    this.controls.minDistance = .15; this.controls.maxDistance = 12;
    this.pose = Object.fromEntries(POSE_KEYS.map(k => [k, 0])); this.target = { ...this.pose }; this.target.breath = 1; this.shape = { breast: 0, weight: 0, muscle: 0 }; this.shapeMeshes = []; this.shapeMacros = []; if (this.opt.shape) this.setShape(this.opt.shape);
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
    this.camera.updateProjectionMatrix(); if (this.composer) this.composer.setSize(w, h); }
  // move the picture up (+) or down (-) by a share of the height, e.g. to keep the body clear of a caption
  setShift(f) { this.shiftY = f || 0; this.resize(); }

  async load(onProgress) {
    const L = new GLTFLoader(), dr = new DRACOLoader(); dr.setDecoderPath(this.opt.draco); if (this.opt.dracoType) dr.setDecoderConfig({ type: this.opt.dracoType }); L.setDRACOLoader(dr); L.setMeshoptDecoder(MeshoptDecoder);   // Draco (our older builds) or meshopt (the master character)
    this._L = L; let g;
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
        : o.name === "Hair" || ex.layer === "hair" || /^Hair/.test(o.name) ? "hair" : ex.layer === "skeleton" ? "skeleton" : ex.layer === "muscles" ? "muscles" : ex.layer === "organs" ? "organs" : "skin";
      o.userData.part = name; o.userData.layerName = layer; o.frustumCulled = false;
      // hair cards, brows, lashes: textures with alpha (glTF BLEND). Layers set transparency for fading, so cut by alpha instead
      // (with the canvas antialiased, alpha to coverage gives soft edges to brows, lashes and hair strands)
      if (o.material && o.material.map && o.material.transparent && !o.material.alphaTest) { o.material.alphaTest = .15; o.material.alphaToCoverage = true; o.material.side = THREE.DoubleSide; }
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
    try { this._calibrateProps(); } catch (e) { console.warn("props:", e); }
    this._tuckShoes();
    if (this.opt.jiggle) { this.jiggle = new Jiggle(this, Array.isArray(this.opt.jiggle) ? this.opt.jiggle : undefined); if (!this.jiggle.count) this.jiggle = null; }
    try { await this._loadShape(); } catch (e) { console.warn("body shape off:", e); }
    this._initWardrobe(); this._browTint();
    if (this.opt.softTissue !== false && this.jiggle) try { this.addSoftTissueDefaults(); } catch (e) { console.warn("soft tissue off:", e); }   // thighs and belly on springs
    if (this.opt.eyeColor !== false) await this.setEyeColor(this.opt.eyeColor || "brownlight");
    if (this.opt.eyeLook !== false) try { this.eyeLook(this.opt.eyeLook || {}); } catch (e) { console.warn("eye look off:", e); }   // wet eyes, iris under the cornea, lid shadows
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
    this._trunkRest = this.bones.neck01.getWorldPosition(new THREE.Vector3()).sub(this.bones.root.getWorldPosition(new THREE.Vector3())).normalize();
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
  /* ---------------- spine: what each region does now, and the load on the L4-L5 disc ---------------- */
  // angles per region from the pose (the share of each movement that the rig's segments carry)
  spineState() {
    const P = this.pose, sum = (o, ks) => ks.reduce((a, k) => a + (o[k] || 0), 0), rb = this.regionBend || {};
    const R = {
      lumbar: { flex: P.spineFlex * sum(SHARE.flex, REGION.lumbar) + ((rb.lumbar || {}).flex || 0) + P.lumbarFlex, side: P.spineSide * sum(SHARE.side, REGION.lumbar) + ((rb.lumbar || {}).side || 0) + P.lumbarSide, twist: P.spineTwist * sum(SHARE.twist, REGION.lumbar) + ((rb.lumbar || {}).twist || 0) + P.lumbarTwist },
      thoracic: { flex: P.spineFlex * sum(SHARE.flex, REGION.thoracic) + ((rb.thoracic || {}).flex || 0) + P.thoracicFlex, side: P.spineSide * sum(SHARE.side, REGION.thoracic) + ((rb.thoracic || {}).side || 0) + P.thoracicSide, twist: P.spineTwist * sum(SHARE.twist, REGION.thoracic) + ((rb.thoracic || {}).twist || 0) + P.thoracicTwist },
      cervical: { flex: P.neckFlex + ((rb.cervical || {}).flex || 0), side: P.neckSide + ((rb.cervical || {}).side || 0), twist: P.neckTwist + ((rb.cervical || {}).twist || 0) }
    };
    for (const k in R) for (const a in R[k]) R[k][a] = Math.round(R[k][a]);
    return { regions: R, disc: this.discLoad(R.lumbar) };
  }
  // L4-L5 intradiscal pressure for the current posture without a load in the hands, from in vivo measurements
  // (Wilke et al. 1999, Spine 24(8):755-762; one 45-year-old man): lying 0.10 (side 0.12), relaxed standing 0.50,
  // standing flexed forward 1.10, extended 0.60, lateral bending up to 0.60, axial rotation up to 0.70 MPa.
  // Between those postures the value is interpolated: an estimate, not a measurement.
  discLoad(L) {
    this.root.updateMatrixWorld(true);
    const pel = this.bones.root.getWorldPosition(new THREE.Vector3()), nk = this.bones.neck01.getWorldPosition(new THREE.Vector3()), cur = nk.sub(pel).normalize();
    // tilt of the trunk away from this model's own upright standing line (its rest pose leans ~7° forward)
    const rest = this._trunkRest || new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion().setFromUnitVectors(rest, new THREE.Vector3(0, 1, 0)), up = cur.clone().applyQuaternion(tilt);
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion); front.y = 0; front.normalize(); const right = new THREE.Vector3(-front.z, 0, front.x);
    const incl = Math.acos(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI;
    const sag = Math.atan2(up.dot(front), Math.max(1e-6, up.y)) * 180 / Math.PI, lat = Math.abs(Math.atan2(up.dot(right), Math.max(1e-6, up.y)) * 180 / Math.PI);  // forward(+)/back, sideways
    const lying = this.lying || 0, side = Math.abs(this.pose.bodyRoll) > 45;
    const flexDeg = Math.max(0, sag), extDeg = Math.max(Math.max(0, -sag), Math.max(0, -L.flex));
    const P = this.pose, seat = Math.min(1, Math.max(0, P.seated)), kg = P.load >= 19 ? P.load : 0;      // weight counts only once the box is in the hands
    let stand = .5 + .6 * Math.sin(Math.min(90, flexDeg) * D2R) + .1 * Math.min(1, extDeg / 25) + .1 * Math.min(1, Math.max(Math.abs(L.side), lat) / 25) + .2 * Math.min(1, Math.abs(L.twist) / 15);
    // sitting (Wilke 2001): unsupported 0.46, actively straightened 0.55, flexed 0.9 MPa; leaning the trunk forward from the hips adds as when standing
    const sit = (L.flex >= 0 ? .46 + .44 * Math.min(1, L.flex / 15) : .46 + .09 * Math.min(1, -L.flex / 3)) + .6 * Math.sin(Math.min(90, Math.max(0, flexDeg - Math.max(0, L.flex))) * D2R) * .6;
    stand = stand * (1 - seat) + sit * seat;
    // a load in the hands (Wilke 2001, 20 kg): close to the body 1.1, flexed knees 1.7, round flexed back 2.3 MPa; scaled by mass
    // body build: the measured values are for the model's own build. With another build on the same skeleton the
    // compression of the disc follows the mass carried above it (trunk, arms, head: its weight and the moment of it
    // when bent), so the body part scales with that mass; the hand load and lying (disc swelling, muscle tone) do not
    const M = this.massProps(), mf = M ? M.upperFactor : 1;
    stand *= mf;
    stand += kg / 20 * (.6 + .6 * Math.sin(Math.min(90, flexDeg) * D2R) ** 2);
    const lie = side ? .12 : .10, mpa = stand * (1 - lying) + lie * lying;
    const near20 = Math.abs(kg - 20) < 1, sitM = seat > .95 && lying < .05 && flexDeg - Math.max(0, L.flex) < 8;
    const measured = near20 && lying < .05 && seat < .05 ? (P.kneeL < 30 && flexDeg > 65 ? "подъём 20 кг с круглой спиной" : P.kneeL > 70 && flexDeg > 25 && flexDeg < 60 && L.flex < 10 ? "подъём 20 кг с согнутыми коленями" : flexDeg < 10 ? "20 кг у тела" : null)
      : kg > 1 ? null : sitM ? (Math.abs(L.flex) < 4 ? "сидя" : L.flex < -3 ? "сидя, спина активно выпрямлена" : L.flex > 14 ? "сидя, спина согнута" : null)
      : seat > .05 ? null : (lying > .95 && Math.abs(this.pose.spineFlex) < 5 && Math.abs(this.pose.legLForward) < 5 && this.pose.kneeL < 10) ? (side ? "лёжа на боку" : "лёжа")
      : (lying < .05 && incl < 6 && Math.abs(L.side) < 4 && Math.abs(L.twist) < 4) ? "стоя" : (lying < .05 && flexDeg > 60 && lat < 10) ? "наклон вперёд стоя" : null;
    const massNote = Math.abs(mf - 1) > .015 ? `; пересчитано на массу над диском ×${mf.toFixed(2).replace(".", ",")} (оценка)` : "";
    return { mpa: Math.round(mpa * 100) / 100, pctOfStanding: Math.round(mpa / .5 * 100), trunkIncline: Math.round(incl), basis: (measured ? "измерено: " + measured : "оценка между измеренными позами") + massNote,
      massFactor: Math.round(mf * 100) / 100, bodyKg: M ? M.bodyKg : null, upperKg: M ? M.upperKg : null,
      source: "Wilke et al. 1999, Spine 24(8):755–762; Wilke et al. 2001, Clin Biomech 16 Suppl 1:111–126 (один испытуемый, диск L4–L5)", load: kg, seated: seat > .5 };
  }
  // mass from the volume of the skin in the rest pose with the current build (density 1 kg/l): the whole body, and the
  // part the L4-L5 disc carries (trunk above the disc, arms and head). Signed tetrahedra from a point on the horizontal
  // plane through the disc: the caps a cut would add lie in that plane and add no volume, so the part above the plane is
  // exact; the arms are counted whole wherever they hang
  massProps() {
    const sk = this.layerMeshes.skin.find(m => m.name === "Body"), disc = this.parts.get("Intervertebral disc L4-L5"); if (!sk || !disc) return null;
    const key = JSON.stringify(this.shape); if (this._mass && this._mass.key === key) return this._mass;
    const g = sk.geometry, p = g.attributes.position, n = p.count, idx = g.index ? g.index.array : null, nt = idx ? idx.length / 3 : n / 3, B = sk.bindMatrix.elements;
    if (!this._massPre) {
      disc.geometry.computeBoundingBox(); const c = disc.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(disc.isSkinnedMesh ? disc.bindMatrix : disc.matrixWorld);
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = sk.skeleton.bones, arm = new Uint8Array(n);
      for (let i = 0; i < n; i++) { let bj = 0, bw = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(i, j) > bw) { bw = sw.getComponent(i, j); bj = si.getComponent(i, j); }
        arm[i] = /^(clavicle|shoulder|upperarm|lowerarm|wrist|metacarpal|finger)/i.test(bones[bj].name) ? 1 : 0; }
      this._massPre = { y0: c.y, arm };
    }
    const { y0, arm } = this._massPre, MP = g.morphAttributes.position || [], W = new Float32Array(n * 3);
    const vol = inf => {
    for (let i = 0; i < n; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      for (let q = 0; q < MP.length; q++) if (inf[q]) { x += MP[q].getX(i) * inf[q]; y += MP[q].getY(i) * inf[q]; z += MP[q].getZ(i) * inf[q]; }
      W[i * 3] = B[0] * x + B[4] * y + B[8] * z + B[12]; W[i * 3 + 1] = B[1] * x + B[5] * y + B[9] * z + B[13] - y0; W[i * 3 + 2] = B[2] * x + B[6] * y + B[10] * z + B[14];
    }
    let all = 0, up = 0;
    for (let t = 0; t < nt; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const ax = W[a * 3], ay = W[a * 3 + 1], az = W[a * 3 + 2], bx = W[b * 3], by = W[b * 3 + 1], bz = W[b * 3 + 2], cx = W[c * 3], cy = W[c * 3 + 1], cz = W[c * 3 + 2];
      const v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      all += v; if (ay + by + cy > 0 || arm[a] + arm[b] + arm[c] >= 2) up += v;
    }
    return { bodyKg: Math.round(Math.abs(all) * 1000 * 10) / 10, upperKg: Math.round(Math.abs(up) * 1000 * 10) / 10 }; };
    if (!this._massModel) this._massModel = vol([]);
    const r = { key, ...vol(sk.morphTargetInfluences || []) };
    r.upperFactor = r.upperKg / this._massModel.upperKg; r.model = this._massModel;
    return (this._mass = r);
  }
  // colour the spine on the model: amber = flexion, teal = extension, violet = bending to the side or twisting; the L4-L5 disc by its load
  showSpine(on = true) {
    this.spineOn = !!on;
    if (!on) { for (const m of this._spineMeshes || []) if (!this.hl.has(m)) { m.material.emissive && m.material.emissive.setRGB(0, 0, 0); if (m.userData.baseColor) m.material.color.copy(m.userData.baseColor); } return { ok: true, spine: false }; }
    if (!this._spineMeshes) {
      this._spineMeshes = [];
      for (const [n, m] of this.parts) {
        const v = n.match(/^Vertebra ([CTL])\d+$|^(Atlas|Axis)/), d = n.match(/^Intervertebral disc ([CTL])\d+-/);
        const r = v ? (v[2] ? "C" : v[1]) : d ? d[1] : null; if (!r) continue;
        m.userData.spineRegion = { C: "cervical", T: "thoracic", L: "lumbar" }[r]; m.userData.baseColor = m.material.color.clone(); if (n === "Intervertebral disc L4-L5") m.userData.isL45 = true; this._spineMeshes.push(m);
      }
    }
    // the spine is seen through a faint skin, without the muscles in front of it
    this.peel("skeleton"); this.layerOn.skin = true; this.opacity.skin = .12; this.depth = null; this.applyLayers();
    return { ok: true, spine: true };
  }
  _paintSpine() {
    if (!this.spineOn || !this._spineMeshes) return;
    const S = this.spineState(), amber = new THREE.Color(0xd98e04), teal = new THREE.Color(0x13a3b4), violet = new THREE.Color(0x8a5cd6), c = new THREE.Color();
    for (const m of this._spineMeshes) {
      if (this.hl.has(m) || !m.material.emissive) continue;
      const base = m.userData.baseColor;
      if (m.userData.isL45) { const t = Math.min(1, Math.max(0, (S.disc.mpa - .1) / 1.0)); c.setRGB(.2 + .8 * t, .7 - .45 * t, .25 - .2 * t); m.material.color.copy(c); m.material.emissive.copy(c).multiplyScalar(.6); continue; }
      const R = S.regions[m.userData.spineRegion], f = Math.abs(R.flex) / 30, o = Math.max(Math.abs(R.side) / 20, Math.abs(R.twist) / 25), k = Math.min(1, Math.max(f, o));
      if (k < .08) { m.material.emissive.setRGB(0, 0, 0); m.material.color.copy(base); continue; }
      c.copy(o > f ? violet : R.flex > 0 ? amber : teal); m.material.color.copy(base).lerp(c, .35 + .55 * k); m.material.emissive.copy(c).multiplyScalar(.45 * k);
    }
  }
  /* ---------------- props: chair and box ---------------- */
  // where the chair stands and where the box lies, from this body's own sitting and lifting poses
  _calibrateProps() {
    const save = { ...this.pose }, at = name => { Object.assign(this.pose, this._frameState(Object.fromEntries(POSE_KEYS.map(k => [k, 0])), { pose: name })); this._applyPose(); this.root.updateMatrixWorld(true); };
    const W = () => this.bones.wristL.getWorldPosition(new THREE.Vector3()).add(this.bones.wristR.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
    at("sit_chair"); const pel = this.bones.root.getWorldPosition(new THREE.Vector3()), th = Math.min(this.bones.upperleg02L.getWorldPosition(new THREE.Vector3()).y, this.bones.upperleg02R.getWorldPosition(new THREE.Vector3()).y) - .07;
    const top = Math.min(pel.y - .085, th), ch = this.chairMesh; ch.position.set(pel.x, 0, pel.z + .02);
    for (const o of ch.children) { if (o.userData.leg) { o.scale.y = top - .035; o.position.y = (top - .035) / 2; } else if (o.userData.back) o.position.y = top + .17; else o.position.y = top - .0175; }
    at("squat_lift"); const w = W(); this._boxFloor = new THREE.Vector3(w.x, .15, w.z);
    Object.assign(this.pose, save); this._applyPose();
  }
  _props() {
    const P = this.pose, ch = this.chairMesh, B = this.boxMesh;
    ch.visible = P.chair > .5 || P.seated > .05;
    if (!(P.box > .5 || P.load > .5)) { B.visible = false; this._boxSpot = null; return; }
    B.visible = true;
    if (P.load >= 19) {         // in the hands: between the wrists
      const w = this.bones.wristL.getWorldPosition(new THREE.Vector3()).add(this.bones.wristR.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
      B.position.set(w.x, Math.max(.15, w.y - .02), w.z); this._boxSpot = B.position.clone();
    } else {                    // put down or not yet taken: on the floor
      if (!this._boxSpot) this._boxSpot = (this._boxFloor || new THREE.Vector3(0, .15, .35)).clone();
      this._boxSpot.y = Math.max(.15, this._boxSpot.y > .3 ? .15 : this._boxSpot.y); B.position.copy(this._boxSpot);
    }
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
    this.walking = null; const segs = []; let st = { ...this.target }, sh = { ...this.shape };
    const L = Math.max(1, Math.min(50, loop));
    const push = (f, r) => { const nx = this._frameState(st, f), ns = f.shape ? { ...sh, ...f.shape } : sh; segs.push({ a: st, b: nx, sa: sh, sb: ns, dur: Math.max(.05, f.dur == null ? 1 : +f.dur), hold: Math.max(0, +f.hold || 0),
      say: f.say || "", fx: f.fx || null, view: f.view || null, peel: f.peel || null, hl: f.hl, ex: f._ex || name, rep: f._rep != null ? f._rep : r + 1, reps: f._reps != null ? f._reps : L }); st = nx; sh = ns; };
    for (let r = 0; r < L; r++) frames.forEach(f => push(f, r));
    if (end) push({ _rep: 0, ...end }, 0);
    if (segs.some(g => g.sa !== g.sb)) this._ensureInner();      // build the layers under the skin now, not halfway through
    this.anim = { segs, t: 0, speed: Math.max(.1, +speed || 1), total: segs.reduce((s, g) => s + g.dur + g.hold, 0), name, i: -1 };
    return { ok: true, name, seconds: +(this.anim.total / this.anim.speed).toFixed(1) };
  }
  exercise(name, reps, speed = 1) {
    const E = EXERCISES[name]; if (!E) throw new Error("unknown exercise " + name);
    // every frame is tagged with its exercise and repetition, for the caption and the "motion" events
    const onFloor = (this.lying || 0) > .5, tag = (fs, ex, rep, n) => fs.map(f => ({ ...f, _ex: ex, _rep: rep, _reps: n }));
    const startFrames = n => { const X = EXERCISES[n]; return X.start && !onFloor ? tag(EXERCISES[X.start].frames, n, 0, 0) : []; };
    const one = (n, k) => { const X = EXERCISES[n], out = []; for (let r = 0; r < k; r++) out.push(...tag(X.frames, X.hidden ? name : n, X.hidden ? 0 : r + 1, X.hidden ? 0 : k)); if (X.end) out.push(...tag([X.end], X.hidden ? name : n, 0, 0)); return out; };
    if (E.spine) this.showSpine(true);                   // posture lessons: the spine is the subject
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
      if (i !== A.i && i < A.segs.length) { A.i = i; if (g.peel) this.peel(g.peel); if (g.hl !== undefined) { if (g.hl) this.highlight(g.hl); else this.clearHighlight(); } if (g.view) (typeof g.view === "string" ? this.view(g.view) : this.lookFrom(g.view)); this.dispatchEvent(new CustomEvent("motion", { detail: { name: A.name, exercise: g.ex, rep: g.rep, reps: g.reps, say: g.say, fx: g.fx, step: i + 1, steps: A.segs.length, seconds: +(A.total / A.speed).toFixed(1) } })); }
      for (const k of POSE_KEYS) if (k !== "breath") { const v = g.a[k] + (g.b[k] - g.a[k]) * e; this.pose[k] = this.target[k] = v; }
      if (g.sa !== g.sb) this.setShape(Object.fromEntries(Object.keys(g.sb).map(k => [k, (g.sa[k] || 0) + ((g.sb[k] || 0) - (g.sa[k] || 0)) * e])));
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
  // clothes stand a hair off the skin (cloth thickness), so the two never fight for the same pixels
  _inflate(mat, d) {
    if (mat.userData.inflated) return; mat.userData.inflated = true; const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
    mat.onBeforeCompile = (sh, r) => { prev && prev.call(mat, sh, r); sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n transformed += normal * ${d.toFixed(4)};`); };
    mat.customProgramCacheKey = () => "inflate" + d + "|" + prevKey(); mat.needsUpdate = true;
    // and it wins the depth test against skin a few millimetres in front of it (a stretched spot under the arm)
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -12;
  }
  // MakeHuman's shoes carry a sock up the shin. The shoe's shader can cut it at the shoe line (rest height by heel-to-toe
  // position, from the item) and dye what is left inside the shoe; which of the two is on is set by _updateSocks
  // (no socks asked for: cut + dye; trousers or leggings over the shin: cut only, so the sock cannot poke through)
  _sockShader(mat, sock, tint = "#17171b") {
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
    const c = sock.rgb.map(x => x.toFixed(3)).join(","), K = sock.collar.length, tab = sock.collar.map(x => x.toFixed(4)).join(",");
    const U = mat.userData.sockU = { uCut: { value: 0 }, uDye: { value: 0 }, uSockTint: { value: new THREE.Color(tint) } };
    mat.onBeforeCompile = (sh, r) => {
      prev && prev.call(mat, sh, r); Object.assign(sh.uniforms, U);
      sh.vertexShader = "varying vec2 vSock;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_SKINNING\n vSock = (bindMatrix * vec4(position, 1.0)).yz;\n#else\n vSock = position.yz;\n#endif");
      sh.fragmentShader = "varying vec2 vSock; uniform vec3 uSockTint; uniform float uCut; uniform float uDye;\n" + sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
 if (uCut > .5) { const float C[${K}] = float[${K}](${tab}); float t = clamp((vSock.y - ${sock.z[0].toFixed(4)}) / ${(sock.z[1] - sock.z[0]).toFixed(4)}, 0., 1.) * ${K - 1}.;
   int i = int(min(t, ${K - 2}.)); float line = mix(C[i], C[i + 1], t - float(i));
   if (vSock.x > line) discard;
#ifdef USE_MAP
   vec3 sc = pow(max(sampledDiffuseColor.rgb, vec3(0.)), vec3(1. / 2.2)); float sat = max(sc.r, max(sc.g, sc.b)) - min(sc.r, min(sc.g, sc.b));
   if (uDye > .5 && (distance(sc, vec3(${c})) < .25 || (sat < .1 && sc.g > .45))) diffuseColor.rgb = uSockTint * (.6 + .4 * sc.g);
#endif
 }`);
    };
    mat.customProgramCacheKey = () => "sock|" + prevKey(); mat.needsUpdate = true;
  }
  _updateSocks() {
    const S = this.worn && this.worn.shoes, O = this.worn && this.worn.outfit; if (!S || !S.sockMasks) return;
    // the outfit covers the shin (leggings, trousers): skin at rest heights 15-28 cm is under it
    let shin = 0; const P = this._skinPos;
    if (O && O.mask) for (let i = 0; i < O.mask.length; i++) if (O.mask[i] && P[i * 3 + 1] > .15 && P[i * 3 + 1] < .28) shin++;
    const cut = !S.socks || shin > 40, dye = !S.socks;
    for (const m of S.meshes) { const U = m.material && m.material.userData.sockU; if (U) { U.uCut.value = cut ? 1 : 0; U.uDye.value = dye ? 1 : 0; } }
    S.mask = cut ? S.sockMasks.cut : S.sockMasks.full; this._updateSkinMask();
  }
  _mat(m, o) { const n = new THREE.MeshStandardMaterial({ color: o.color != null ? o.color : m.color, roughness: o.roughness, metalness: 0 }); return n; }
  _skinMaterial(mesh) {
    // skin, not plastic: a soft specular (IOR 1.4) instead of a strong sheen, pores in the normals, and the direct light
    // wrapping a little round the forms, redder at the shadow's edge (skin-detail.js: light under the skin)
    const m = new THREE.MeshPhysicalMaterial({ color: 0xc8987f, roughness: .5, ior: 1.4, specularIntensity: .5, sheen: .12, sheenColor: new THREE.Color(0xffd8c8), sheenRoughness: .55, vertexColors: true });
    m.normalMap = poreNormalMap(); m.normalScale.set(.07, .07);
    const sss = sssLights();
    // skin under clothes (R) is not cut out but tucked a few millimetres in, so a hem that rides up shows skin, not a
    // hole, and a skin triangle half under the cloth cannot poke through it; skin in shoes (G) is cut out (feet are
    // wider than some shoes)
    m.userData.u = { uHideCloth: { value: 1 }, uHideShoes: { value: 1 }, uTuck: { value: .012 }, uSat: { value: .8 } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, m.userData.u);
      sh.vertexShader = "uniform float uHideCloth; uniform float uTuck;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n#ifdef USE_COLOR\n transformed -= normal * (uTuck * uHideCloth * color.r);\n#endif");
      if (sss) sh.fragmentShader = sh.fragmentShader.replace("#include <lights_physical_pars_fragment>", sss);
      // the skin texture's own blush (knees, elbows, knuckles) reads as sunburn once the light wraps red round the
      // forms: its colour is taken down a little toward its brightness
      sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n { float sl = dot(diffuseColor.rgb, vec3(.3, .59, .11)); diffuseColor.rgb = mix(vec3(sl), diffuseColor.rgb, uSat); }");
      sh.fragmentShader = "uniform float uHideShoes; uniform float uSat;\n" + sh.fragmentShader.replace("#include <color_fragment>",
        "#ifdef USE_COLOR\n if (uHideShoes > .5 && vColor.g > .5) discard; if (uHideShoes > .5 && vColor.b > .999) discard;\n#endif");
    };
    if (mesh.material && mesh.material.map) { m.map = mesh.material.map; m.color.set(0xf4ece8); }   // a model with a skin texture keeps it
    mesh.material = m; this.skinMat = m;
  }

  /* ---------------- layers ---------------- */
  applyLayers() {
    for (const l of LAYERS) for (const m of this.layerMeshes[l]) {
      m.visible = this.layerOn[l] && !m.userData.hidden;
      if (m.userData.wrapProxy) { m.userData.wrapShown = m.visible; m.visible = false; }   // (a wrapped garment shows its proxy instead)
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
  // hairstyle on models that carry several (the dealer: "ponytail" = Hair, "long" = Hair_Long)
  setHair(style) { const map = { ponytail: "Hair", long: "Hair_Long" }, want = map[style] || style, hs = this.layerMeshes.hair; if (!hs.some(m => m.name === want)) return { ok: false, error: "no hairstyle " + style, styles: Object.keys(map).filter(k => hs.some(m => m.name === map[k])) };
    for (const m of hs) m.userData.hidden = m.name !== want; this.applyLayers(); return { ok: true, hair: style }; }
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
  // camera from a direction toward a bone, e.g. { at: "spine02", dir: [0, .55, -1], dist: 1.1 } (behind and above the back)
  lookFrom({ at = "spine02", dir = [0, 0, 1], dist = 1.5 } = {}) {
    this.root.updateMatrixWorld(true); const c = (this.bones[at] || this.bones.root).getWorldPosition(new THREE.Vector3());
    this.tweenCam(c, c.clone().add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist)), 1.2);
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
  _applyPose(plant = true) {
    const P = this.pose; this._e = this._e || new THREE.Euler(); this._q = this._q || new THREE.Quaternion(); this._q2 = this._q2 || new THREE.Quaternion();
    for (const k in this.bones) { const B = this.bones[k]; if (B.userData.rest) B.quaternion.copy(B.userData.rest); if (B.userData.restPos && k !== "root") B.position.copy(B.userData.restPos); }
    this._e.set(P.bodyPitch * D2R, 0, P.bodyRoll * D2R, "XYZ"); this.root.quaternion.setFromEuler(this._e);
    const br = P.breath * (this.live ? Math.sin(this.t * 1.6) : 0);
    // trunk: hip hinge at the pelvis, then the spine segment by segment, then the neck
    this._rot("root", P.hipFlex, 0, 0);
    for (const s of SPINE) this._rot(s, P.spineFlex * SHARE.flex[s] - (s === "spine01" ? br * .9 : 0), P.spineTwist * SHARE.twist[s], P.spineSide * SHARE.side[s]);
    // per-region curvature (posture types, scoliosis): spread evenly over the region's segments
    for (const r of ["lumbar", "thoracic"]) { const segs = REGION[r], f = P[r + "Flex"], sd = P[r + "Side"], tw = P[r + "Twist"]; if (f || sd || tw) for (const sg of segs) this._rot(sg, f / segs.length, tw / segs.length, sd / segs.length); }
    if (this.regionBend) for (const r in this.regionBend) { const rb = this.regionBend[r], segs = REGION[r] || []; for (const s of segs) this._rot(s, rb.flex / segs.length, rb.twist / segs.length, rb.side / segs.length); }
    for (const s of NECK) this._rot(s, P.neckFlex * (SHARE.nflex[s] || 0) + (s === "neck01" ? br * .6 : 0), P.neckTwist * (SHARE.ntwist[s] || 0), P.neckSide * (SHARE.nside[s] || 0));
    this._rot("clavicleL", 0, 0, -br * .5); this._rot("clavicleR", 0, 0, br * .5);
    // a living head never holds still: slow small drift (incommensurate sines), a little more while speaking
    if (this.live && this.micro) { const t = this.t, sp = this._talk && t < this._talk.until ? 1.8 : 1;
      this._rot("head", (.9 * Math.sin(t * .53) + .5 * Math.sin(t * 1.31 + 1)) * sp, (1.1 * Math.sin(t * .37 + 2) + .4 * Math.sin(t * 1.07)) * sp, .6 * Math.sin(t * .29 + .5) * sp); }
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
    if (plant) this._plant(P);
  }
  // keep the feet planted: move the whole body so the feet stay where they stood
  _plant(P) {
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
    } else if (this.walking) this.root.position.set(0, dy, 0);   // walking in place is on a treadmill: the stance foot slides back, the body stays
    else this.root.position.set(rest.x - f.x, dy, rest.z - f.z);
    // a clip that leaves the floor (a jump, a run's flight; marked air): its root bone's rise is not planted away
    const C = this._clip, R = this.bones.root;
    if (C && C.air && R && R.parent) {
      const M = R.parent.matrixWorld, r0 = (R.userData.restPos || R.position).clone().applyMatrix4(M), r1 = R.position.clone().applyMatrix4(M);
      this.root.position.y += Math.max(0, r1.y - r0.y);
    }
    this.lying = lying;
  }
  // face: the jaw turns about the jaw joint; eyelids turn about the eye centre; mouth corners and brows are moved
  // (millimetres, in the body frame: x to the body's left, y up, z forward); the eyes turn for the gaze
  _face(P) {
    const sm = P.smile, up = Math.max(0, sm), dn = Math.max(0, -sm), bw = P.brows, bu = Math.max(0, bw), bd = Math.max(0, -bw);
    const t = this.t;
    // blinks: at random 2-6 s apart, sometimes twice in a row (micro: a page asks for the living details); otherwise every ~4 s
    let auto = 0;
    if (this.live && this.micro) { const B = this._blink || (this._blink = { next: t + 2, at: -9 });
      if (t > B.next) { B.at = t; B.next = t + (Math.random() < .15 ? .35 : 2 + Math.random() * 4); }
      auto = Math.max(0, 1 - Math.abs((t - B.at - .07) / .07)); }
    else if (this.live) auto = Math.max(0, 1 - Math.abs(((t % 4.3) - 4.15) / .09));
    // saccades: the eyes jump to a new point near the viewer's face every 0.6-2.5 s
    let sx = 0, sy = 0;
    if (this.live && this.micro) { const C = this._sacc || (this._sacc = { next: 0, x: 0, y: 0 }); if (t > C.next) { C.next = t + .6 + Math.random() * 1.9; C.x = (Math.random() - .5) * 5; C.y = (Math.random() - .5) * 3; } sx = C.x; sy = C.y; }
    // speaking: the jaw opens and closes at syllable rate while talk() runs (a page calls it with the speech)
    let tk = 0, round = 0;
    if (this._talk && t < this._talk.until) {
      const T = this._talk;
      if (T.vis) { const u = (t - T.t0) / (T.until - T.t0) * T.vis.length, i = Math.min(T.vis.length - 1, Math.floor(u)), f = u - i, a = T.vis[i], b = T.vis[Math.min(T.vis.length - 1, i + 1)];
        const e = f * f * (3 - 2 * f); tk = a[0] + (b[0] - a[0]) * e; round = a[1] + (b[1] - a[1]) * e; }      // visemes from the text
      else tk = (.5 + .5 * Math.sin(t * 15.7)) * (.6 + .4 * Math.sin(t * 4.1 + 1));
      tk *= Math.min(1, (T.until - t) * 4);
    }
    const AK = this._arkitMap();
    if (!AK) this._rot("jaw", P.jawOpen + tk * 11, 0, 0);
    // eye contact: the eyes turn toward the camera (the viewer), within what eyes can turn without the head
    let gx = 0, gy = 0;
    if (this.gaze && this.bones.head) {
      const h = this.bones.head.getWorldPosition(new THREE.Vector3()), v = (this.gazeTarget || this.camera.position).clone().sub(h).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()).invert());
      gx = THREE.MathUtils.clamp(Math.atan2(v.x, v.z) * 180 / Math.PI - P.neckTwist - P.spineTwist, -28, 28) * this.gaze;
      gy = THREE.MathUtils.clamp(Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180 / Math.PI + P.neckFlex + .5 * P.spineFlex, -18, 18) * this.gaze;
    }
    if (AK) {                                                                         // a character with an ARKit face: its own shapes
      const set = (n, w) => { for (const [m, i] of AK[n] || []) m.morphTargetInfluences[i] = THREE.MathUtils.clamp(w, 0, 1); };
      const W = { jawOpen: (P.jawOpen + tk * 11) / 17, mouthFunnel: round * .55, mouthPucker: round * .45, browInnerUp: bu, browOuterUpLeft: bu * .8, browOuterUpRight: bu * .8,
        browDownLeft: bd, browDownRight: bd, mouthFrownLeft: dn, mouthFrownRight: dn, mouthSmileLeft: up * .9, mouthSmileRight: up * .85, cheekSquintLeft: up * .5, cheekSquintRight: up * .45,
        eyeSquintLeft: up * .2, eyeSquintRight: up * .2 };
      for (const [S, side] of [["L", "Left"], ["R", "Right"]]) W["eyeBlink" + side] = Math.max(0, Math.min(1, P["blink" + S] + auto - (this.eyeOpen || 0)));
      const FC = this._faceClip;                                                      // a performance from video (ARKit curves) overrides
      if (FC) { const u = (t - FC.t0) / FC.dur; if (u >= 1 && !FC.loop) this._faceClip = null; else {
        const x = (u % 1) * FC.d.frames.length, i = Math.floor(x), f = x - i, A0 = FC.d.frames[i], A1 = FC.d.frames[Math.min(i + 1, FC.d.frames.length - 1)];
        FC.d.names.forEach((n, k) => { W[n] = (A0[k] * (1 - f) + A1[k] * f) * FC.gain; }); } }
      for (const n in W) set(n, W[n]);
      for (const [S] of [["L"], ["R"]]) this._rot("eye" + S, -(P.lookY + gy + sy), P.lookX + gx + sx, 0);
      return;
    }
    for (const [S, sg] of [["L", 1], ["R", -1]]) {
      const bl = Math.min(1, P["blink" + S] + auto - (this.eyeOpen || 0));            // eyeOpen: a more awake look (a character page sets it)
      this._rot("orbicularis03" + S, bl * 34, 0, 0); this._rot("orbicularis04" + S, -bl * 6 - up * 7, 0, 0);   // upper lid down; lower lid up (also in a real smile)
      for (const c of ["oris03" + S, "oris07" + S]) this._move(c, sg * (.009 * up + .002 * dn - .006 * round), .008 * up - .007 * dn, -.004 * up + .004 * round);
      this._move("risorius03" + S, sg * .006 * up, .006 * up - .003 * dn, -.002 * up);
      this._move("levator05" + S, sg * .002 * up, .004 * up, 0);
      this._move("oculi01" + S, -sg * .003 * bd, .005 * bu - .003 * bd, .001 * bu);                           // brows: up, or down and together
      this._move("oculi02" + S, 0, .004 * bu - .002 * bd, 0);
      this._rot("eye" + S, -(P.lookY + gy + sy), P.lookX + gx + sx, 0);
    }
  }
  frame() {
    const raw = Math.min(.25, this.clock.getDelta()), dt = Math.min(.05, raw); this.t += raw;   // motion keeps real time on slow devices
    if (this.root) {
      this._motion(raw);
      const k = 1 - Math.exp(-dt * 5); for (const key of POSE_KEYS) this.pose[key] += (this.target[key] - this.pose[key]) * k;
      // between moves the body stands as a person does (an idle mocap loop), not in the model's rest pose; an exercise,
      // walking or any posed animation takes over from it
      let busy = !!(this.anim || this.walking || this.lying > .2);
      if (!busy) for (const k of POSE_KEYS) if (!IDLE_FREE.has(k) && Math.abs(this.target[k]) > .5) { busy = true; break; }   // a pose was asked for
      if (this.idleClip && this.clips && this.clips[this.idleClip]) {
        if (!this._clip && !busy) this.playClip(this.idleClip, { loop: true, fade: .8, idle: true });
        else if (this._clip && this._clip.idle && busy && this._clip.target > 0) this.stopClip(.4);
      }
      const clip = !!this._clip; this._applyPose(!clip);
      if (clip) { if (this._clip) this._clipLayer(raw); this._plant(this.pose); }
      if (this.onPose) { this.root.updateMatrixWorld(true); this.onPose(raw); }   // a procedural layer over the pose (avatar-ik.js: hands on the table)
      if (this.drive) { this.root.updateMatrixWorld(true); this.drive.update(dt); }
      if (this.jiggle) { if (!this.drive) this.root.updateMatrixWorld(true); this.jiggle.update(raw); }
      if (this.springs && this.springs.length) { if (!this.jiggle && !this.drive) this.root.updateMatrixWorld(true); for (const s of this.springs) s.update(raw); }   // hair on spring chains
      if (this.wraps && this.wraps.length) { this.root.updateMatrixWorld(true); for (const w of this.wraps) w.update(); }   // clothes laid on the deformed skin (skin-wrap.js)
      this._paintSpine(); this._props();
      this.floor.material.opacity = .8 * (this.lying || 0); this.floor.visible = this.lying > .01;
      const down = (this.lying || 0) > .5; if (down !== !!this._wasDown) { this._wasDown = down; this.fitView(down ? "side" : "front"); this._refitAt = this.t + 2.2; }
      if (this._refitAt && this.t > this._refitAt) { this._refitAt = 0; if (!this.camTween) this.fitView(this._wasDown ? "side" : "front"); }   // again once the move has settled
    }
    if (this.camTween) {
      const T = this.camTween, u = Math.min(1, (this.t - T.t0) / T.dur), e = u * u * (3 - 2 * u);
      this.controls.target.lerpVectors(T.a.t, T.b.t, e); this.camera.position.lerpVectors(T.a.p, T.b.p, e); if (u >= 1) this.camTween = null;
    }
    this.controls.update(); if (this.onBeforeRender) this.onBeforeRender(raw);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
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
  // body shape, each from -1 … 0 (the model) … +1: breast (size), weight, muscle. MakeHuman's own macros ('cupsize', 'weight',
  // 'muscle'; CC0 targets) sampled at 0 / the model / 1 by tools/build_shape_morphs.py, with every proxy (clothes, shoes,
  // hair) refitted by MakeHuman. The offsets become morph targets (two per macro), applied before skinning, so poses,
  // muscles under the skin and clothes keep working
  async _loadShape() {
    if (this.opt.shapeUrl === false) return;                 // a model built with another shape (the dealer): no slider data for it
    const D = await (await fetch(this.opt.shapeUrl || new URL("./shape-morph.json", import.meta.url).href)).json(), U = D.unit;
    this._builtinHides = D.builtin_hides || null;              // measured skin under the model's own outfit / shoes
    const i16 = b => { const s = atob(b), a = new Int16Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = (s.charCodeAt(2 * i) | s.charCodeAt(2 * i + 1) << 8) << 16 >> 16; return a; };
    this.shapeMacros = D.macros; for (const k of D.macros) if (this.shape[k] == null) this.shape[k] = 0;   // every slider the file has (breast, waist, hips ...)
    for (const m of [...this.layerMeshes.skin, ...this.layerMeshes.clothes, ...this.layerMeshes.hair]) {
      const S = D.meshes[m.name]; if (!S || !S.n || !m.isSkinnedMesh) continue;
      const base = i16(S.base), g = m.geometry, p = g.attributes.position, n = p.count, C = .005, H = new Map(), key = (x, y, z) => `${x},${y},${z}`;
      for (let j = 0; j < S.n; j++) { const k = key(Math.floor(base[j * 3] * U / C), Math.floor(base[j * 3 + 1] * U / C), Math.floor(base[j * 3 + 2] * U / C)); (H.get(k) || H.set(k, []).get(k)).push(j); }
      const map = new Int32Array(n).fill(-1), v = new THREE.Vector3(); let hit = 0;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.bindMatrix); const cx = Math.floor(v.x / C), cy = Math.floor(v.y / C), cz = Math.floor(v.z / C);
        let bd = .002;                                              // the same vertex: within Draco quantisation
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of H.get(key(cx + a, cy + b, cz + c)) || []) {
          const e = Math.hypot(base[j * 3] * U - v.x, base[j * 3 + 1] * U - v.y, base[j * 3 + 2] * U - v.z); if (e < bd) { bd = e; map[i] = j; } }
        if (map[i] >= 0) hit++;
      }
      const toLocal = new THREE.Matrix3().setFromMatrix4(m.bindMatrixInverse), d = new THREE.Vector3(), T = [];
      for (const mac of D.macros) for (const b64 of S.d[mac]) {
        const o = i16(b64), t = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const j = map[i]; if (j < 0) continue; d.set(o[j * 3] * U, o[j * 3 + 1] * U, o[j * 3 + 2] * U).applyMatrix3(toLocal); t[i * 3] = d.x; t[i * 3 + 1] = d.y; t[i * 3 + 2] = d.z; }
        T.push(t);
      }
      // normals follow the new shape: the change of the computed normals (zero wherever the surface does not move)
      const G = new THREE.BufferGeometry(), P = new Float32Array(n * 3); if (g.index) G.setIndex(g.index);
      const nrm = off => { for (let i = 0; i < n; i++) { P[i * 3] = p.getX(i) + (off ? off[i * 3] : 0); P[i * 3 + 1] = p.getY(i) + (off ? off[i * 3 + 1] : 0); P[i * 3 + 2] = p.getZ(i) + (off ? off[i * 3 + 2] : 0); }
        G.setAttribute("position", new THREE.BufferAttribute(P, 3)); G.computeVertexNormals(); return G.attributes.normal.array.slice(); };
      const N0 = nrm(null), DN = T.map(t => { const N1 = nrm(t); for (let i = 0; i < n * 3; i++) N1[i] -= N0[i]; return N1; });
      // after the model's own morph targets (a character's ARKit face, say), which keep their names and indices
      const pre = g.morphAttributes.position || [], nPre = pre.length, dict = { ...(m.morphTargetDictionary || {}) };
      const preN = nPre ? (g.morphAttributes.normal && g.morphAttributes.normal.length === nPre ? g.morphAttributes.normal : pre.map(a => new THREE.BufferAttribute(new Float32Array(a.array.length), 3))) : [];
      g.morphAttributes.position = [...pre, ...T.map(t => new THREE.BufferAttribute(t, 3))]; g.morphAttributes.normal = [...preN, ...DN.map(t => new THREE.BufferAttribute(t, 3))];
      g.morphTargetsRelative = true; m.updateMorphTargets(); m.morphTargetDictionary = dict; m.morphTargetInfluences.fill(0); m.userData.shapeBase = nPre; m.userData.shapeHits = hit; this.shapeMeshes.push(m);
      m.material.needsUpdate = true;
    }
    this._shapeReady = true; this.setShape(this.shape);
  }
  // the layers under the skin follow it: with more muscle mass the muscles near the surface move out with the skin (fading
  // to nothing 4 cm deep, so they thicken); for any shape, muscles, fasciae and ligaments the skin would cut are pushed in
  // to stay 2 mm under it (less fat: the skin comes down onto the muscles). Built as morph targets the first time the
  // shape leaves the model's (about a second), so the default model loads and draws as before
  _shapeInner() {
    const sk = this.shapeMeshes.find(m => m.name === "Body"); if (!sk) return;
    const g = sk.geometry, p = g.attributes.position, nA = g.attributes.normal, n = p.count, B = sk.bindMatrix, B3 = new THREE.Matrix3().setFromMatrix4(B);
    const W = new Float32Array(n * 3), NW = new Float32Array(n * 3), v = new THREE.Vector3(), C = .02, H = new Map(), key = (x, y, z) => `${x},${y},${z}`;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).applyMatrix4(B); W.set([v.x, v.y, v.z], i * 3); v.fromBufferAttribute(nA, i).applyMatrix3(B3).normalize(); NW.set([v.x, v.y, v.z], i * 3);
      const k = key(Math.floor(W[i * 3] / C), Math.floor(W[i * 3 + 1] / C), Math.floor(W[i * 3 + 2] / C)); (H.get(k) || H.set(k, []).get(k)).push(i); }
    const sb = sk.userData.shapeBase || 0;
    const TP = g.morphAttributes.position.slice(sb).map(t => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v.fromBufferAttribute(t, i).applyMatrix3(B3); o.set([v.x, v.y, v.z], i * 3); } return o; });
    const TN = g.morphAttributes.normal.slice(sb).map(t => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v.fromBufferAttribute(t, i).applyMatrix3(B3); o.set([v.x, v.y, v.z], i * 3); } return o; });
    const follow = this.shapeMacros.flatMap(k => k === "muscle" ? [1, 1] : [0, 0]), GAP = .002, DEEP = .04;
    let moved = 0, meshes = 0;
    for (const m of [...this.layerMeshes.muscles, ...this.layerMeshes.skeleton]) {
      const mp = m.geometry.attributes.position, mn = mp.count, M = m.isSkinnedMesh ? m.bindMatrix : m.matrixWorld, Mi = new THREE.Matrix3().setFromMatrix4(m.isSkinnedMesh ? m.bindMatrixInverse : new THREE.Matrix4().copy(m.matrixWorld).invert());
      const near = new Int32Array(mn).fill(-1), depth = new Float32Array(mn), X = new Float32Array(mn * 3);
      for (let i = 0; i < mn; i++) {
        v.fromBufferAttribute(mp, i).applyMatrix4(M); X.set([v.x, v.y, v.z], i * 3); const cx = Math.floor(v.x / C), cy = Math.floor(v.y / C), cz = Math.floor(v.z / C);
        let bd = DEEP * DEEP;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of H.get(key(cx + a, cy + b, cz + c)) || []) {
          const d = (W[j * 3] - v.x) ** 2 + (W[j * 3 + 1] - v.y) ** 2 + (W[j * 3 + 2] - v.z) ** 2; if (d < bd) { bd = d; near[i] = j; } }
        if (near[i] >= 0) { const j = near[i]; depth[i] = (W[j * 3] - v.x) * NW[j * 3] + (W[j * 3 + 1] - v.y) * NW[j * 3 + 1] + (W[j * 3 + 2] - v.z) * NW[j * 3 + 2]; }
      }
      if (!near.some(j => j >= 0)) continue;
      const isMuscle = this.layerMeshes.muscles.includes(m), T = [], d = new THREE.Vector3(); let any = false;
      for (let q = 0; q < TP.length; q++) {
        const t = new Float32Array(mn * 3), P = TP[q], N = TN[q], f0 = isMuscle ? follow[q] : 0;
        for (let i = 0; i < mn; i++) { const j = near[i]; if (j < 0) continue;
          const f = f0 * Math.max(0, Math.min(1, 1 - (depth[i] - .005) / (DEEP - .005)));
          let dx = P[j * 3] * f, dy = P[j * 3 + 1] * f, dz = P[j * 3 + 2] * f;
          // where is the new skin: its point and normal near this vertex
          let nx = NW[j * 3] + N[j * 3], ny = NW[j * 3 + 1] + N[j * 3 + 1], nz = NW[j * 3 + 2] + N[j * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
          const s = (X[i * 3] + dx - W[j * 3] - P[j * 3]) * nx + (X[i * 3 + 1] + dy - W[j * 3 + 1] - P[j * 3 + 1]) * ny + (X[i * 3 + 2] + dz - W[j * 3 + 2] - P[j * 3 + 2]) * nz;
          const goal = Math.max(-GAP, -depth[i]);                 // 2 mm under the skin, or no worse than in the model (folds)
          if (s > goal) { const k = s - goal; dx -= nx * k; dy -= ny * k; dz -= nz * k; }
          if (dx || dy || dz) { d.set(dx, dy, dz).applyMatrix3(Mi); t[i * 3] = d.x; t[i * 3 + 1] = d.y; t[i * 3 + 2] = d.z; any = true; moved++; }
        }
        T.push(t);
      }
      if (!any) continue;
      m.geometry.morphAttributes.position = T.map(t => new THREE.BufferAttribute(t, 3)); m.geometry.morphTargetsRelative = true;
      m.updateMorphTargets(); m.morphTargetInfluences.fill(0); this.shapeMeshes.push(m); m.material.needsUpdate = true; meshes++;
    }
    this.shapeInnerStats = { meshes, moved };
  }
  _ensureInner() { if (this._shapeReady && !this._innerDone) { this._innerDone = true; try { this._shapeInner(); } catch (e) { console.warn("shape inner layers:", e); } } }
  setShape(o = {}) {
    for (const k of Object.keys(this.shape)) if (o[k] != null && isFinite(+o[k])) this.shape[k] = Math.max(-1, Math.min(1, +o[k]));
    if (Object.values(this.shape).some(v => v)) this._ensureInner();
    for (const m of this.shapeMeshes) { const o = m.userData.shapeBase || 0; this.shapeMacros.forEach((k, q) => { const b = this.shape[k] || 0; m.morphTargetInfluences[o + q * 2] = Math.max(0, -b); m.morphTargetInfluences[o + q * 2 + 1] = Math.max(0, b); }); }
    for (const W of Object.values(this.worn || {})) for (const m of W.meshes) { const D = m.morphTargetDictionary; if (!D || !m.userData.ownShapes) continue;    // wardrobe items carry their own
      for (const k in this.shape) { const b = this.shape[k] || 0, n = D[`shape_${k}_neg`], p = D[`shape_${k}_pos`]; if (n != null) m.morphTargetInfluences[n] = Math.max(0, -b); if (p != null) m.morphTargetInfluences[p] = Math.max(0, b); } }
    return { ...this.shape };
  }
  // soft tissue that has no bone of its own in the model (the thighs, the belly): a bone is added under `parent` at
  // `center` (the bind frame: y up, z to the front, metres), the skin within `r` of it hands it part of the weight it
  // had on the bones `from` matches (all of it near the centre, fading to none at r), and it joins the jiggle springs.
  // The clothes are not reweighted: the tissue moves less than the skin under clothes is tucked in (12 mm).
  addSoftTissue(list, { part = null } = {}) {
    let skin = this.parts.get("Body"); if (part) { skin = null; this.root.traverse(o => { if (!skin && o.isSkinnedMesh && o.name.includes(part)) skin = o; }); }   // (or a worn piece: a loose panel of a shirt)
    if (!skin || !skin.isSkinnedMesh || !this.jiggle) return { ok: false };
    const sk = skin.skeleton, g = skin.geometry, P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = P.count, v = new THREE.Vector3();
    const bones = [...sk.bones], inv = [...sk.boneInverses], added = [];
    const X = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(skin.bindMatrix); X.set([v.x, v.y, v.z], i * 3); }
    const NI = new Uint16Array(si.array.length), NW = new Float32Array(sw.array.length);
    for (let i = 0; i < n * 4; i++) { NI[i] = si.array[i]; NW[i] = sw.getComponent(i >> 2, i & 3); }
    for (const t of list) {
      const pi = sk.bones.findIndex(b => b.name === t.parent); if (pi < 0) continue;
      const c = new THREE.Vector3(...t.center), cl = c.clone().applyMatrix4(sk.boneInverses[pi]);
      const B = new THREE.Bone(); B.name = t.name; B.position.copy(cl); (this.bones[t.parent] || sk.bones[pi]).add(B); this.bones[t.name] = B; B.userData.rest = B.quaternion.clone(); B.userData.restPos = B.position.clone();
      const bi = bones.length; bones.push(B); inv.push(new THREE.Matrix4().makeTranslation(-cl.x, -cl.y, -cl.z).multiply(sk.boneInverses[pi]));
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(X[i * 3] - c.x, X[i * 3 + 1] - c.y, X[i * 3 + 2] - c.z); if (d >= t.r) continue;
        const a = (t.gain || .85) * (1 - Math.min(1, Math.max(0, (d - t.r * .3) / (t.r * .7)))) ** 2; if (a < .01) continue;
        const W = new Map(); let took = 0;
        for (let j = 0; j < 4; j++) { const b = NI[i * 4 + j], w = NW[i * 4 + j]; if (!w) continue; const nm = bones[b].name;
          if (t.from.test(nm)) { took += w * a; W.set(b, (W.get(b) || 0) + w * (1 - a)); } else W.set(b, (W.get(b) || 0) + w); }
        if (took < .005) continue; W.set(bi, took); moved++;
        const best = [...W.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = best.reduce((x, e) => x + e[1], 0) || 1;
        for (let j = 0; j < 4; j++) { NI[i * 4 + j] = best[j] ? best[j][0] : 0; NW[i * 4 + j] = best[j] ? best[j][1] / tot : 0; }
      }
      added.push({ ...t, moved });
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(NI, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(NW, 4));
    skin.bind(new THREE.Skeleton(bones, inv), skin.bindMatrix); this.root.updateMatrixWorld(true);
    const n2 = this.jiggle.add(added.filter(t => t.moved).map(t => ({ bone: t.name, f: t.f, z: t.z, max: t.max, sag: t.sag || 0, wind: t.wind || 0 })));
    return { ok: true, added: added.map(t => ({ bone: t.name, skin: t.moved })), springs: n2 };
  }
  // the usual places: the back of each thigh and the lower belly (from this skeleton's own bones)
  addSoftTissueDefaults() {
    if (this._softDefaults) return this._softDefaults;
    const skin = this.parts.get("Body"); if (!skin || !skin.isSkinnedMesh || !this.jiggle) return { ok: false };
    const sk = skin.skeleton, at = nm => { const i = sk.bones.findIndex(b => b.name === nm); return i < 0 ? null : new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert()); };
    const L = [];
    for (const S of ["L", "R"]) { const hip = at("upperleg01" + S), knee = at("lowerleg01" + S); if (!hip || !knee) continue;
      L.push({ name: "thigh" + S, parent: "upperleg01" + S, center: hip.clone().lerp(knee, .45).add(new THREE.Vector3(0, 0, -.025)).toArray(), r: .15, from: new RegExp("^upperleg0[12]" + S + "$"), f: 3.2, z: .3, max: .012, sag: .004 }); }
    for (const S of ["L", "R"]) {                                       // the back of the upper arms and the calves: smaller, firmer
      const sh = at("upperarm01" + S), el = at("lowerarm01" + S), kn = at("lowerleg01" + S), an = at("foot" + S);
      if (sh && el) L.push({ name: "arm" + S, parent: "upperarm02" + S, center: sh.clone().lerp(el, .55).add(new THREE.Vector3(0, 0, -.03)).toArray(), r: .08, from: new RegExp("^upperarm0[12]" + S + "$"), gain: .7, f: 4.5, z: .3, max: .006, sag: .002 });
      if (kn && an) L.push({ name: "calf" + S, parent: "lowerleg01" + S, center: kn.clone().lerp(an, .3).add(new THREE.Vector3(0, 0, -.035)).toArray(), r: .09, from: new RegExp("^lowerleg0[12]" + S + "$"), gain: .7, f: 5.5, z: .3, max: .005, sag: .001 });
    }
    const sp = at("spine04"); if (sp) L.push({ name: "belly", parent: "spine04", center: sp.clone().add(new THREE.Vector3(0, -.015, .1)).toArray(), r: .11, from: /^(spine0[345]|root)$/, f: 3.5, z: .32, max: .012, sag: .006 });
    return (this._softDefaults = L.length ? this.addSoftTissue(L) : { ok: false });
  }
  // lay a worn garment on the deformed skin instead of skinning it on its own (see skin-wrap.js): part = its name or
  // a piece of it. Costs a little CPU per frame (the skin under it is skinned on the CPU too)
  wrapGarment(part) {
    let m = null; this.root.traverse(o => { if (!m && o.isSkinnedMesh && o.name.includes(part)) m = o; }); if (!m) return { ok: false, error: "no mesh " + part };
    this.root.updateMatrixWorld(true); const w = new SkinWrap(this, m); if (!w.ok) return { ok: false };
    this.wraps = (this.wraps || []).filter(x => x.src !== m); this.wraps.push(w); this.applyLayers();
    return { ok: true, part: m.name, verts: w.n, skin: w.U.length, far: w.far };
  }
  // something worn that hangs from one spot (the ends of a knot, a tassel) swings on a spring chain: part = the mesh's
  // name (or a piece of it); front = { offset: [x, y, z], r } a sphere on the body (bind frame) it stays outside of
  addDangle(part, { front = null, segments = 2 } = {}) {
    let m = null; this.root.traverse(o => { if (!m && o.isSkinnedMesh && (o.name === part || o.name.includes(part))) m = o; });
    if (!m) return { ok: false, error: "no mesh " + part };
    this.root.updateMatrixWorld(true);
    const d = dangleSpring(this, m, { segments, front: front && { offset: new THREE.Vector3(...front.offset), r: front.r } });
    if (!d.ok) return { ok: false, error: "nothing hangs from " + part };
    const W = Object.entries(this.worn || {}).find(([, w]) => w.meshes.includes(m)); d.slot = W ? W[0] : null;
    this.springs = this.springs || []; this.springs.push(d); return { ok: true, part: m.name, moved: d.moved };
  }
  // lips move for this many seconds (with speech, captions); 0 stops them
  /* ---------------- wardrobe ---------------- */
  // slots: outfit, shoes, hair (and anything an item names). The base model's own clothes and hair are the first items;
  // an item GLB (avatar/tools/build_wardrobe.py) brings one skinned mesh on the same bone names, its own body-shape
  // morphs (shape_<slider>_neg/pos) and the list of skin vertices it covers, which are then hidden under it
  _initWardrobe() {
    const body = this.parts.get("Body"); this.worn = {}; if (!body) return;
    const g = body.geometry, p = g.attributes.position, n = p.count, col = g.attributes.color, v = new THREE.Vector3();
    // the skin's rest positions, hashed (for matching an item's covered-skin list)
    this._skinPos = new Float32Array(n * 3); const H = new Map(), C = .004; this._skinHash = H;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).applyMatrix4(body.bindMatrix); this._skinPos.set([v.x, v.y, v.z], i * 3);
      const k = `${Math.floor(v.x / C)},${Math.floor(v.y / C)},${Math.floor(v.z / C)}`; (H.get(k) || H.set(k, []).get(k)).push(i); }
    const fromColor = ch => { const M = new Uint8Array(n); if (col) for (let i = 0; i < n; i++) M[i] = col.getComponent(i, ch) > .5 ? 1 : 0; return M; };
    for (const [slot, re, ch] of [["outfit", /^Clothes_(?!Shoes)/, 0], ["shoes", /^Clothes_Shoes/, 1], ["hair", /^Hair$/, -1]]) {
      const meshes = [...this.layerMeshes.clothes, ...this.layerMeshes.hair].filter(m => re.test(m.name));
      if (meshes.length) this.worn[slot] = { id: "builtin", meshes, mask: ch >= 0 ? fromColor(ch) : null, channel: ch === 1 ? 1 : 0 };
      if (slot === "outfit") for (const m of meshes) { if (m.material) this._inflate(m.material, .002); this._fitCloth(m); }
      if (slot === "shoes") for (const m of meshes) this._fitShoe(m);
    }
    for (const [slot, b64] of Object.entries(this._builtinHides || {})) {
      const W = this.worn[slot]; if (!W || !W.mask) continue; const M = this._maskFrom(b64);
      // shoes: only the skin the shoe really covers (measured) goes; the model's delete group runs up the shin, above
      // its short sock, and the leg would end in mid-air under a skirt or shorts
      if (slot === "shoes") {                                         // (and only up to the shoe's own top, its sock included)
        let top = -1e9; const v3 = new THREE.Vector3();
        for (const m of W.meshes) { const q = m.geometry.attributes.position; for (let i = 0; i < q.count; i++) top = Math.max(top, v3.fromBufferAttribute(q, i).applyMatrix4(m.bindMatrix).y); }
        for (let i = 0; i < n; i++) if (M[i] && this._skinPos[i * 3 + 1] > top - .005) M[i] = 0;
        W.mask = M;
      } else for (let i = 0; i < n; i++) if (M[i]) W.mask[i] = 1;
    }
    this._builtinMask = { outfit: this.worn.outfit && this.worn.outfit.mask, shoes: this.worn.shoes && this.worn.shoes.mask };
    if (this._builtinHides) this._updateSkinMask();
    // a second hairstyle in the model (Hair_Long): not worn
    for (const m of this.layerMeshes.hair) if (!/^Hair$/.test(m.name)) m.userData.hidden = true;
  }
  // a garment made coarser than the skin (the base sports suit: 2k vertices over a 14k body) cuts chords through the
  // skin's curves at knees, hips and shoulders, and the skin shows through between its vertices. Each triangle is split
  // in four (twice for the coarse ones), every attribute and shape morph carried along, and the new vertices that sink
  // under the skin are lifted back out to 3 mm over it
  _subdivide(m, levels = 1) {
    const body = this.parts.get("Body"); if (!body || !m.isSkinnedMesh || !this._skinPos || m.userData.subdiv) return; m.userData.subdiv = true;
    for (let L = 0; L < levels; L++) {
      const g = m.geometry; if (!g.index) return; const idx = g.index.array, A = g.attributes, n0 = A.position.count, mid = new Map(), tris = [];
      const MA = g.morphAttributes || {}; const pairs = [];
      const mk = (a, b) => { const k = a < b ? a * 1e6 + b : b * 1e6 + a; let i = mid.get(k); if (i == null) { i = n0 + pairs.length; mid.set(k, i); pairs.push([a, b]); } return i; };
      for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2], ab = mk(a, b), bc = mk(b, c), ca = mk(c, a); tris.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
      const n1 = n0 + pairs.length, discrete = name => /skinIndex|^aMi$/.test(name);
      const grow = (attr, name) => {
        const it = attr.itemSize, src = attr, out = new (attr.array.constructor)(n1 * it);
        for (let i = 0; i < n0; i++) for (let c = 0; c < it; c++) out[i * it + c] = src.array[i * it + c];
        if (src.isInterleavedBufferAttribute || src.normalized) {   // quantized: read as floats, keep floats
          const f = new Float32Array(n1 * it); for (let i = 0; i < n0; i++) for (let c = 0; c < it; c++) f[i * it + c] = src.getComponent(i, c);
          pairs.forEach(([a, b], k) => { for (let c = 0; c < it; c++) f[(n0 + k) * it + c] = discrete(name) ? f[a * it + c] : (f[a * it + c] + f[b * it + c]) / 2; });
          return new THREE.BufferAttribute(f, it);
        }
        pairs.forEach(([a, b], k) => { for (let c = 0; c < it; c++) out[(n0 + k) * it + c] = discrete(name) ? out[a * it + c] : (out[a * it + c] + out[b * it + c]) / 2; });
        return new THREE.BufferAttribute(out, it, false);
      };
      const ng = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(A)) ng.setAttribute(name, grow(attr, name));
      // bone weights of a new point: both ends' weights merged (the four strongest kept)
      const SI = A.skinIndex, SW = A.skinWeight, NSI = ng.attributes.skinIndex, NSW = ng.attributes.skinWeight;
      if (SI && SW) pairs.forEach(([a, b], k) => { const M = new Map(); for (const e of [a, b]) for (let c = 0; c < 4; c++) { const w = SW.getComponent(e, c); if (w > 0) { const j = SI.getComponent(e, c); M.set(j, (M.get(j) || 0) + w / 2); } }
        const best = [...M.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), t = best.reduce((x, e) => x + e[1], 0) || 1;
        for (let c = 0; c < 4; c++) { NSI.setComponent(n0 + k, c, best[c] ? best[c][0] : 0); NSW.setComponent(n0 + k, c, best[c] ? best[c][1] / t : 0); } });
      for (const [name, list] of Object.entries(MA)) ng.morphAttributes[name] = list.map(a => grow(a, name));
      ng.morphTargetsRelative = g.morphTargetsRelative; ng.setIndex(new THREE.BufferAttribute(n1 > 65535 ? new Uint32Array(tris) : new Uint16Array(tris), 1));
      for (const gr of g.groups) ng.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
      ng.userData = g.userData; g.dispose(); m.geometry = ng;
    }
    // out of the skin: the nearest skin vertex and its normal (rest pose, bind space)
    const g = m.geometry, pos = g.attributes.position, P = this._skinPos, sn = body.geometry.attributes.normal, C = .025, v = new THREE.Vector3(), nm = new THREE.Vector3();
    const XF = this._gFrame(m), inv = XF.clone().invert(), NXF = new THREE.Matrix3().getNormalMatrix(XF); if (!this._wHash) this._hashSkinW();
    let moved = 0; const sI = g.attributes.skinIndex, sW = g.attributes.skinWeight, bn = m.skeleton.bones;
    const armW = i => { let a = 0; for (let c = 0; c < 4; c++) { const w = sW.getComponent(i, c); if (w > 0 && /^(upperarm|lowerarm|shoulder01)/.test(bn[sI.getComponent(i, c)].name)) a += w; } return a; };
    const tightArm = /Sport|Top|Shirt|Tee|Suit/i.test(m.name + " " + (m.userData.part || "")) && !/Dress|Coat|Jacket|Blouse/i.test(m.name);
    const done = new Map(), kk = i => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    for (let i = 0; i < pos.count; i++) {
      const wk = kk(i), dn = done.get(wk); if (dn) { if (dn !== true) pos.setXYZ(i, dn[0], dn[1], dn[2]); continue; } done.set(wk, true);   // seam copies move together
      v.fromBufferAttribute(pos, i).applyMatrix4(XF); const cx = Math.floor(v.x / C), cy = Math.floor(v.y / C), cz = Math.floor(v.z / C); const sleeve = tightArm && armW(i) > .5; let bd = sleeve ? .1 : .03, bq = -1; const rr = sleeve ? 4 : 1;
      const SN = this._skinNormals(), cn = g.attributes.normal, w3 = cn ? new THREE.Vector3().fromBufferAttribute(cn, i).applyMatrix3(NXF).normalize() : null;
      for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) for (let c = -rr; c <= rr; c++) for (const q of this._wHash.get(wkey(cx + a, cy + b, cz + c)) || []) {
        if (w3 && SN[q * 3] * w3.x + SN[q * 3 + 1] * w3.y + SN[q * 3 + 2] * w3.z < .2) continue;
        const d = Math.hypot(P[q * 3] - v.x, P[q * 3 + 1] - v.y, P[q * 3 + 2] - v.z); if (d < bd) { bd = d; bq = q; } }
      if (bq < 0) continue; nm.set(SN[bq * 3], SN[bq * 3 + 1], SN[bq * 3 + 2]);
      const h = (v.x - P[bq * 3]) * nm.x + (v.y - P[bq * 3 + 1]) * nm.y + (v.z - P[bq * 3 + 2]) * nm.z;
      if (h < .003 && bd < .03) { v.addScaledVector(nm, .003 - h).applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z); done.set(wk, [v.x, v.y, v.z]); moved++; }
      // a loose sleeve on a sports top is taken in to 1.5 cm round the arm: a wide sleeve on a skinned arm stretches into
      // a wing between the chest and a raised arm, a fitted one follows it
      else if (sleeve && h > .015) { v.addScaledVector(nm, .015 - h).applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z); done.set(wk, [v.x, v.y, v.z]); moved++; }
    }
    // normals: the carried ones, made unit again (recomputing them would split at the UV seams and draw them as lines)
    const nr = g.attributes.normal; if (nr) for (let i = 0; i < nr.count; i++) { v.fromBufferAttribute(nr, i).normalize(); nr.setXYZ(i, v.x, v.y, v.z); }
    g.computeBoundingSphere(); m.userData.subdivMoved = moved;
  }
  // shoes: the shoe stays on the foot bones; what rises above the ankle (a sock, a boot's shaft) follows the shin's skin,
  // or a deep squat folds the ankle and the sock stays behind, leaving the cut-off shin bare
  _fitShoe(m) {
    if (this.opt.noFit) return; const A = this.bones.footL || this.bones.footR; if (!A) return;
    this.root.updateMatrixWorld(true); const y0 = A.getWorldPosition(new THREE.Vector3()).y - this.root.position.y + .03;
    this._fitWeights(m, { only: v => v.y > y0 });
  }
  _fitCloth(m) {
    const n = m.geometry.attributes.position.count, lv = this.opt.noSubdiv ? 0 : n < 4000 ? 2 : n < 16000 ? 1 : 0;
    // weights fitted on the garment as made (4 to 16 times fewer points), then carried into the finer mesh
    if (!this.opt.noFit) this._fitWeights(m);
    if (lv) this._subdivide(m, lv);
    const g = m.geometry; if (lv && this.drive && this.drive.couple) { g.deleteAttribute("aMi"); g.deleteAttribute("aMw"); this.drive.couple(m); }
  }
  // garment bind space -> the skin's bind space (a garment file may be bound at another scale or offset: its inverse
  // bind matrices say how; one bone both have is enough)
  _gFrame(m) {
    const body = this.parts.get("Body"), sb = body.skeleton.bones, gb = m.skeleton.bones, j = gb.findIndex(b => sb.includes(b));
    const X = j < 0 ? new THREE.Matrix4() : body.skeleton.boneInverses[sb.indexOf(gb[j])].clone().invert().multiply(m.skeleton.boneInverses[j]);
    return X.multiply(m.bindMatrix);
  }
  // lips a colour of their own (the skin texture barely sets them apart: at a distance the mouth vanishes). Where the
  // lips are comes from the face's own ARKit shapes: the points the lip-roll shapes move most are the lips' red.
  // color: the tint (lipstick, or a deeper natural lip), amount 0..1. Returns how many points it took.
  lipTint(color = "#9c4a4e", amount = .55, { lo = .0003, hi = .0014 } = {}) {      // lo..hi: how far (m) the shapes move a point
    const skin = this.parts.get("Body"), M = this.skinMat; if (!skin || !M) return { ok: false, error: "no skin" };
    const g = skin.geometry, D = skin.morphTargetDictionary || {}, ma = g.morphAttributes.position || [], P = g.attributes.position, n = P.count, rel = g.morphTargetsRelative;
    const ks = ["mouthRollUpper", "mouthRollLower"].map(k => D[k]).filter(i => i != null && ma[i]); if (!ks.length) return { ok: false, error: "no lip shapes" };
    let L = g.attributes.aLip ? g.attributes.aLip.array : null;
    if (!L) { L = new Float32Array(n); const W = ks.map(k => { const w = new Float32Array(n);
        for (let i = 0; i < n; i++) { let x = ma[k].getX(i), y = ma[k].getY(i), z = ma[k].getZ(i); if (!rel) { x -= P.getX(i); y -= P.getY(i); z -= P.getZ(i); } w[i] = THREE.MathUtils.smoothstep(Math.hypot(x, y, z), lo, hi); } return w; });
      // the lower-lip roll drags the skin under the lip too: the lower lip stops 7-11 mm under the line where the lips
      // meet (the bottom of the upper lip)
      const Y = new Float32Array(n), v = new THREE.Vector3(); for (let i = 0; i < n; i++) Y[i] = v.fromBufferAttribute(P, i).applyMatrix4(skin.bindMatrix).y;
      const up = D.mouthRollUpper != null ? W[ks.indexOf(D.mouthRollUpper)] : null; let line = null;
      if (up) { line = Infinity; for (let i = 0; i < n; i++) if (up[i] > .5 && Y[i] < line) line = Y[i]; if (!isFinite(line)) line = null; }
      ks.forEach((k, j) => { const w = W[j], low = k === D.mouthRollLower && line != null;
        for (let i = 0; i < n; i++) { const f = low ? THREE.MathUtils.smoothstep(Y[i], line - .011, line - .007) : 1; L[i] = Math.max(L[i], w[i] * f); } });
      g.setAttribute("aLip", new THREE.BufferAttribute(L, 1)); }
    const U = M.userData.lipU || (M.userData.lipU = { uLip: { value: new THREE.Color() }, uLipA: { value: 0 } }); U.uLip.value.set(color); U.uLipA.value = amount;
    if (!M.userData.lipHooked) { M.userData.lipHooked = true; const prev = M.onBeforeCompile, prevKey = M.customProgramCacheKey ? M.customProgramCacheKey.bind(M) : () => "";
      M.onBeforeCompile = (sh, r) => { prev && prev.call(M, sh, r); Object.assign(sh.uniforms, U);
        sh.vertexShader = "attribute float aLip; varying float vLip;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vLip = aLip;");
        sh.fragmentShader = "uniform vec3 uLip; uniform float uLipA; varying float vLip;\n" + sh.fragmentShader.replace("#include <alphamap_fragment>",
          " diffuseColor.rgb = mix(diffuseColor.rgb, uLip * (.55 + .9 * dot(diffuseColor.rgb, vec3(.3, .59, .11))), vLip * uLipA);\n#include <alphamap_fragment>"); };
      M.customProgramCacheKey = () => "lips|" + prevKey(); M.needsUpdate = true; }
    return { ok: true, points: L.reduce((a, x) => a + (x > .5 ? 1 : 0), 0) };
  }
  // the eyes' mesh: "Eyes" in the character models, MakeHuman's eye proxy ("Body.low-poly" / "high-poly") in the full one
  _eyesPart() { return this.parts.get("Eyes") || [...this.parts.entries()].find(([k]) => /(^|\.)(low|high)-poly$/i.test(k))?.[1] || null; }
  // living eyes. The model's eyes are a low-poly ball with a painted iris under a matte coat; here, in the eye shader:
  // - a wet coat (clearcoat) with a smooth ball's normals, and a cornea of its own, more curved, over the iris: the
  //   highlight and the reflection sit on it as in a real eye;
  // - the iris lies in a plane behind the cornea: what the eye shows is where the view ray, bent at the cornea, meets
  //   that plane (the iris shifts as the eye turns, and does not look painted on);
  // - the pupil can open and close (body.pupil: 1 = as painted, < 1 smaller, > 1 larger);
  // - the shadow of the lids (top most, then the corners), which stays with the head and not with the turned eye;
  // - the white not paper white, a soft dark ring at the edge of the iris, an iris tint (a reddish texture made brown).
  // Sizes are fractions of the ball's radius: iris .43 and pupil .14 match MakeHuman's eye textures.
  eyeLook({ iris = .43, pupil = .14, cornea = .65, ior = 1.336, occlusion = .6, sclera = "#e4d9d2", tint = null, tintAmount = .6, limbus = .35 } = {}) {
    const eyes = this._eyesPart(); if (!eyes || !eyes.isSkinnedMesh || !eyes.material) return { ok: false, error: "no eyes" };
    const g = eyes.geometry, P = g.attributes.position, UV = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, sk = eyes.skeleton;
    if (!UV || !SI) return { ok: false, error: "eyes without uv or skin" };
    // one eye per bone: the bone that carries most of each point
    const by = new Map(), v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { let b = SI.getX(i), w = SW.getX(i); for (const [j, c] of [[SI.getY(i), SW.getY(i)], [SI.getZ(i), SW.getZ(i)], [SI.getW(i), SW.getW(i)]]) if (c > w) { b = j; w = c; }
      (by.get(b) || by.set(b, []).get(b)).push(i); }
    const E = [...by.entries()].filter(([, l]) => l.length > 8).slice(0, 2).map(([b, l]) => {
      const bone = sk.bones[b], c = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[b].clone().invert());   // the ball's centre: its bone (bind space)
      const pts = l.map(i => v.fromBufferAttribute(P, i).applyMatrix4(eyes.bindMatrix).clone()), a = new THREE.Vector3();
      let R = 0; for (const p of pts) { R += p.distanceTo(c); a.add(p.clone().sub(c)); } R /= pts.length; a.normalize();   // the cap's middle is where it looks
      // the texture over the front of the ball, as a linear map of the two directions across the eye's axis
      const e1 = new THREE.Vector3(0, 1, 0).cross(a).normalize(), e2 = a.clone().cross(e1), S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Bu = [0, 0, 0], Bv = [0, 0, 0];
      l.forEach((i, k) => { const d = pts[k].clone().sub(c); if (d.clone().addScaledVector(a, -d.dot(a)).length() > .7 * R) return;
        const x = [1, d.dot(e1), d.dot(e2)], u = UV.getX(i), w = UV.getY(i); for (let r = 0; r < 3; r++) { Bu[r] += x[r] * u; Bv[r] += x[r] * w; for (let s = 0; s < 3; s++) S[r][s] += x[r] * x[s]; } });
      const M3 = new THREE.Matrix3().set(...S[0], ...S[1], ...S[2]); if (Math.abs(M3.determinant()) < 1e-18) return null; M3.invert();
      const su = new THREE.Vector3(...Bu).applyMatrix3(M3), sv = new THREE.Vector3(...Bv).applyMatrix3(M3);
      const Ju = e1.clone().multiplyScalar(su.y).addScaledVector(e2, su.z), Jv = e1.clone().multiplyScalar(sv.y).addScaledVector(e2, sv.z);
      const head = bone.parent && sk.bones.includes(bone.parent) ? sk.bones.indexOf(bone.parent) : b;
      return { b, head, c, a, R, Ju, Jv };
    }).filter(Boolean);
    if (E.length !== 2) return { ok: false, error: "eyes not found" };
    const M = eyes.material, V3 = () => new THREE.Vector3(), two = f => [f(), f()];
    const U = M.userData.eyeU || (M.userData.eyeU = { uEC: { value: two(V3) }, uEA: { value: two(V3) }, uEJu: { value: two(V3) }, uEJv: { value: two(V3) }, uEP: { value: two(() => new THREE.Vector4()) },
      uEUp: { value: V3() }, uERt: { value: V3() }, uEIor: { value: 1.336 }, uEPupil: { value: 1 }, uEOcc: { value: .6 }, uESclera: { value: new THREE.Color() }, uETint: { value: new THREE.Color() }, uETintA: { value: 0 }, uELimbus: { value: .35 } });
    U.uEIor.value = ior; U.uEOcc.value = occlusion; U.uESclera.value.set(sclera); U.uETintA.value = tint ? tintAmount : 0; if (tint) U.uETint.value.set(tint); U.uELimbus.value = limbus;
    this.pupil = this.pupil || 1; const fr = { iris, pupil, cornea };
    // each frame: the balls' centres, axes and texture map in the camera's space (they turn with the eye bones), the
    // head's up and right for the lid shadows
    const Mv = new THREE.Matrix4(), Mh = new THREE.Matrix4(), N3 = new THREE.Matrix3(), self = this;
    const place = (m, b, cam) => m.copy(cam.matrixWorldInverse).multiply(eyes.matrixWorld).multiply(eyes.bindMatrixInverse).multiply(sk.bones[b].matrixWorld).multiply(sk.boneInverses[b]);
    const prevBR = eyes.userData.eyePrevBR !== undefined ? eyes.userData.eyePrevBR : (eyes.userData.eyePrevBR = eyes.onBeforeRender);
    eyes.onBeforeRender = function (r, sc, cam, ...rest) {
      prevBR && prevBR.call(this, r, sc, cam, ...rest);
      E.forEach((e, k) => { place(Mv, e.b, cam); const s = new THREE.Vector3().setFromMatrixColumn(Mv, 0).length();
        U.uEC.value[k].copy(e.c).applyMatrix4(Mv); U.uEA.value[k].copy(e.a).transformDirection(Mv);
        N3.getNormalMatrix(Mv); U.uEJu.value[k].copy(e.Ju).applyMatrix3(N3); U.uEJv.value[k].copy(e.Jv).applyMatrix3(N3);
        U.uEP.value[k].set(e.R * s, fr.iris * e.R * s, fr.pupil * e.R * s, fr.cornea * e.R * s);
        if (k === 0) { place(Mh, e.head, cam); U.uEUp.value.set(0, 1, 0).transformDirection(Mh); U.uERt.value.set(1, 0, 0).transformDirection(Mh); } });
      U.uEPupil.value = Math.max(.5, Math.min(1.6, self.pupil || 1));
    };
    if (!M.userData.eyeHooked) { M.userData.eyeHooked = true; const prev = M.onBeforeCompile, prevKey = M.customProgramCacheKey ? M.customProgramCacheKey.bind(M) : () => "";
      M.onBeforeCompile = (sh, r) => { prev && prev.call(M, sh, r); Object.assign(sh.uniforms, U);
        const pre = `
  // the eye: which ball, where in it, the ball's and the cornea's normals, the iris seen through the cornea
  vec3 eP = -vViewPosition; int eK = distance(eP, uEC[0]) < distance(eP, uEC[1]) ? 0 : 1;
  vec3 eC = uEC[eK], eA = uEA[eK]; vec4 eR = uEP[eK];                       // R, iris, pupil, cornea radius
  vec3 eD = eP - eC; float eZ = dot(eD, eA); vec3 eQ = eD - eA * eZ; float eRr = length(eQ);
  vec3 eNs = normalize(eD);
  float eZI = sqrt(max(eR.x * eR.x - eR.y * eR.y, 0.)), eRq = min(eRr, eR.y);
  vec3 eNcor = normalize(eQ + eA * sqrt(max(eR.w * eR.w - eRq * eRq, 0.)));   // the cornea: a smaller ball through the iris's rim
  float eWC = 1. - smoothstep(eR.y * .9, eR.y * 1.03, eRr);
  vec3 eNc = normalize(mix(eNs, eNcor, eWC));
  vec3 eT = refract(normalize(eP), eNcor, 1. / uEIor);
  vec3 eHit = eD + eT * (min(eZI - eZ, 0.) / min(dot(eT, eA), -.05));
  vec3 eQh = eHit - eA * dot(eHit, eA); float eRh = length(eQh), eS = uEPupil, eRp = eR.z;
  float eRs = eRh < eRp * eS ? eRh / eS : (eRh < eR.y ? eRp + (eRh - eRp * eS) * (eR.y - eRp) / max(eR.y - eRp * eS, 1e-6) : eRh);
  vec3 eDP = (eQh * (eRs / max(eRh, 1e-7)) - eQ) * eWC;
  vec2 eDuv = vec2(dot(uEJu[eK], eDP), dot(uEJv[eK], eDP)); float eL = length(eDuv); if (eL > .08) eDuv *= .08 / eL;
  float eRsrc = length(eQ + eDP) / eR.y;                                     // where on the painted eye, in iris radii
  float eYh = dot(eD, uEUp) / eR.x, eXh = abs(dot(eD, uERt)) / eR.x;
  float eOcc = clamp(1. - uEOcc * (.75 * smoothstep(-.1, .5, eYh) + .3 * (1. - smoothstep(-.55, -.25, eYh)) + .55 * smoothstep(.35, .85, eXh)), .2, 1.);
`;
        sh.fragmentShader = `uniform vec3 uEC[2]; uniform vec3 uEA[2]; uniform vec3 uEJu[2]; uniform vec3 uEJv[2]; uniform vec4 uEP[2];
uniform vec3 uEUp; uniform vec3 uERt; uniform float uEIor; uniform float uEPupil; uniform float uEOcc; uniform vec3 uESclera; uniform vec3 uETint; uniform float uETintA; uniform float uELimbus;\n`
          + sh.fragmentShader
            .replace("#include <map_fragment>", pre + THREE.ShaderChunk.map_fragment.replace("texture2D( map, vMapUv )", "texture2D( map, vMapUv + eDuv )") + `
  { float eIr = 1. - smoothstep(.93, 1.0, eRsrc);                           // iris (and pupil) vs the white
    float eLum = dot(diffuseColor.rgb, vec3(.3, .59, .11));
    diffuseColor.rgb = mix(diffuseColor.rgb, uETint * eLum / max(dot(uETint, vec3(.3, .59, .11)), 1e-3), uETintA * eIr);
    diffuseColor.rgb *= mix(uESclera, vec3(1.), eIr);
    float eRg = eRr / eR.y; diffuseColor.rgb *= 1. - uELimbus * smoothstep(.84, .98, eRg) * (1. - smoothstep(.98, 1.08, eRg)); }   // the ring stays thin on the ball`)
            .replace("#include <clearcoat_normal_fragment_begin>", "#include <clearcoat_normal_fragment_begin>\n  normal = normalize(mix(eNs, eA, eWC * .7));\n#ifdef USE_CLEARCOAT\n  clearcoatNormal = eNc;\n#endif")
            .replace("#include <aomap_fragment>", `#include <aomap_fragment>
  reflectedLight.directDiffuse *= eOcc; reflectedLight.indirectDiffuse *= eOcc; reflectedLight.directSpecular *= eOcc; reflectedLight.indirectSpecular *= eOcc;
#ifdef USE_CLEARCOAT
  clearcoatSpecularDirect *= eOcc; clearcoatSpecularIndirect *= mix(.35, 1., eOcc);
#endif`);
      };
      M.customProgramCacheKey = () => "eyes|" + prevKey(); }
    // wet: a clear, sharp coat over a softer ball
    M.clearcoat = 1; M.clearcoatRoughness = .08; M.roughness = .4; M.specularIntensity = .3; M.needsUpdate = true;
    return { ok: true, eyes: E.length, radius: +E[0].R.toFixed(4) };
  }
  // brows the colour of the hair (the model's are near-black strips, which reads as drawn on), a little darker, and
  // soft-edged
  _browTint() {
    const brow = this.parts.get("Eyebrows"), hair = (this.worn && this.worn.hair && this.worn.hair.meshes || []).find(m => m.material && m.material.map && m.material.map.image);
    if (!brow || !brow.material) return; let col = new THREE.Color(0x5a4030);
    try { if (hair) { const im = hair.material.map.image, c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 160) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      if (n) col = new THREE.Color().setRGB(r / n / 255 * .9, gg / n / 255 * .9, b / n / 255 * .9, THREE.SRGBColorSpace).multiply(hair.material.color); } } catch (e) { /* a texture from another origin */ }
    // thinner and a touch higher (the model's brows are a wide, low band: a heavy, stern look): each brow's points drawn
    // toward its own middle line to 70 %, the band raised 1.5 mm
    if (!brow.userData.thinned) {
      brow.userData.thinned = true; const p = brow.geometry.attributes.position, v = new THREE.Vector3(), inv = brow.bindMatrixInverse || new THREE.Matrix4(), M4 = brow.bindMatrix || new THREE.Matrix4();
      const P = []; for (let i = 0; i < p.count; i++) P.push(v.fromBufferAttribute(p, i).clone().applyMatrix4(M4));
      const bins = new Map(), key = q => `${q.x > 0 ? 1 : 0}:${Math.round(q.x / .004)}`;
      for (const q of P) { const k = key(q), b = bins.get(k) || { y: 0, z: 0, n: 0 }; b.y += q.y; b.z += q.z; b.n++; bins.set(k, b); }
      for (let i = 0; i < p.count; i++) { const q = P[i], b = bins.get(key(q)), my = b.y / b.n; q.y = my + (q.y - my) * .7 + .0015; q.applyMatrix4(inv); p.setXYZ(i, q.x, q.y, q.z); }
      p.needsUpdate = true; brow.geometry.computeBoundingSphere();
    }
    const M = brow.material, U = M.userData.browU || (M.userData.browU = { uBrow: { value: col } }); U.uBrow.value = col;
    if (!M.userData.browHooked) { M.userData.browHooked = true; const prev = M.onBeforeCompile;
      M.onBeforeCompile = (sh, r) => { prev && prev.call(M, sh, r); Object.assign(sh.uniforms, U); sh.fragmentShader = "uniform vec3 uBrow;\n" + sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = mix(uBrow, diffuseColor.rgb, .08);"); };
      M.alphaToCoverage = true; M.needsUpdate = true; }
  }
  _skinNormals() {
    if (this._sN) return this._sN; const body = this.parts.get("Body"), sn = body.geometry.attributes.normal, NB = new THREE.Matrix3().getNormalMatrix(body.bindMatrix), v = new THREE.Vector3();
    const o = this._sN = new Float32Array(sn.count * 3); for (let i = 0; i < sn.count; i++) { v.fromBufferAttribute(sn, i).applyMatrix3(NB).normalize(); o[i * 3] = v.x; o[i * 3 + 1] = v.y; o[i * 3 + 2] = v.z; } return o;
  }
  _hashSkinW() { const P = this._skinPos, ns = P.length / 3, C = .025; this._wHash = new Map(); for (let i = 0; i < ns; i++) { const k = wkey(Math.floor(P[i * 3] / C), Math.floor(P[i * 3 + 1] / C), Math.floor(P[i * 3 + 2] / C)); (this._wHash.get(k) || this._wHash.set(k, []).get(k)).push(i); } }
  // a tight garment moves with the skin under it: each cloth vertex near the skin takes the skin's own bone weights
  // there (inverse-distance mix of the nearest skin vertices), fading back to the garment's weights from 2 to 7 cm off
  // the body (a loose hem or a skirt keeps its own). Both are skinned the same way (DQS), so the cloth then keeps its
  // few millimetres over the skin in every pose instead of the skin coming through at the shoulders, knees and hips
  _fitWeights(m, { only = null } = {}) {
    const body = this.parts.get("Body"); if (!body || !m.isSkinnedMesh || !this._skinPos || m.userData.fitW) return; m.userData.fitW = true;
    const P = this._skinPos, sg = body.geometry, sI = sg.attributes.skinIndex, sW = sg.attributes.skinWeight, sb = body.skeleton.bones, ns = P.length / 3;
    const C = .025; if (!this._wHash) this._hashSkinW();
    // one skeleton for both: the garment's bones, plus any of the skin's it lacks
    const bones = m.skeleton.bones.slice(), inv = m.skeleton.boneInverses.slice(), at = new Map(bones.map((b, i) => [b, i]));
    // (a bone the garment lacks gets its inverse bind matrix in the garment's own frame: the body's one, carried over
    // through a bone both have; the two files need not share one bind frame)
    const ref = bones.findIndex(b => sb.includes(b)), BI = body.skeleton.boneInverses;
    const toG = ref < 0 ? null : BI[sb.indexOf(bones[ref])].clone().invert();
    const idx = b => { if (!at.has(b)) { at.set(b, bones.length); bones.push(b);
      // inv_b(garment) = inv_b(body) · inv_ref(body)⁻¹ · inv_ref(garment)
      inv.push(ref < 0 ? BI[sb.indexOf(b)].clone() : BI[sb.indexOf(b)].clone().multiply(toG).multiply(m.skeleton.boneInverses[ref])); } return at.get(b); };
    const g = m.geometry, pos = g.attributes.position, cI = g.attributes.skinIndex, cW = g.attributes.skinWeight, n = pos.count, v = new THREE.Vector3();
    const XF = this._gFrame(m), FIT = new Uint8Array(n), NI = new Uint16Array(n * 4), NW = new Float32Array(n * 4), D0 = new Float32Array(n).fill(1), OWN = new Array(n), SN = this._skinNormals(), cn = g.attributes.normal, w3 = new THREE.Vector3(), NBc = new THREE.Matrix3().getNormalMatrix(XF);
    // a tight garment (most of it within 2.5 cm of the skin: sportswear, leggings) is glued to the skin all over, its
    // sleeves too (they would otherwise stretch into wings between the chest and a raised arm); a loose one (a skirt)
    // only where it touches
    const dist = []; for (let i = 0; i < n; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(XF); const cx = Math.floor(v.x / C), cy = Math.floor(v.y / C), cz = Math.floor(v.z / C); let bd = .2;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (const q of this._wHash.get(wkey(cx + a, cy + b, cz + c)) || []) bd = Math.min(bd, Math.hypot(P[q * 3] - v.x, P[q * 3 + 1] - v.y, P[q * 3 + 2] - v.z)); dist.push(bd); }
    dist.sort((x, y) => x - y); const tight = dist[Math.floor(dist.length * .75)] < .025, R0 = tight ? .07 : .012, R1 = tight ? .13 : .035, rc = Math.ceil(R1 / C); m.userData.tight = tight;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(XF); if (cn) w3.fromBufferAttribute(cn, i).applyMatrix3(NBc).normalize();
      const own = new Map(); for (let c = 0; c < 4; c++) { const w = cW.getComponent(i, c); if (w > 0) { const b = m.skeleton.bones[cI.getComponent(i, c)]; own.set(b, (own.get(b) || 0) + w); } }
      const cx = Math.floor(v.x / C), cy = Math.floor(v.y / C), cz = Math.floor(v.z / C), near = [];
      // (only skin facing the same way: the inside of a sleeve under the arm belongs to the arm, not to the chest wall
      // a centimetre away, whose surface faces the other way)
      for (let a = -rc; a <= rc; a++) for (let b = -rc; b <= rc; b++) for (let c = -rc; c <= rc; c++) for (const q of this._wHash.get(wkey(cx + a, cy + b, cz + c)) || []) {
        if (cn && SN[q * 3] * w3.x + SN[q * 3 + 1] * w3.y + SN[q * 3 + 2] * w3.z < .2) continue;
        const d = Math.hypot(P[q * 3] - v.x, P[q * 3 + 1] - v.y, P[q * 3 + 2] - v.z); if (d >= R1) continue;
        // and skin of the same body part as the garment says (its own weights): a sleeve picks the arm, not the chest
        let ov = 0; for (let c = 0; c < 4; c++) { const w = sW.getComponent(q, c); if (w > 0) ov += Math.min(w, own.get(sb[sI.getComponent(q, c)]) || 0); }
        near.push([d * (1.6 - ov), q, d]); }
      const acc = new Map(), add = (bi, w) => acc.set(bi, (acc.get(bi) || 0) + w);
      near.sort((x, y) => x[0] - y[0]); const top = near.slice(0, 4).map(([, q, d]) => [d, q]), d0 = D0[i] = top.length ? Math.min(...top.map(t => t[0])) : 1, f = only && !(FIT[i] = only(v) ? 1 : 0) ? 0 : Math.max(0, Math.min(1, (R1 - d0) / (R1 - R0)));
      if (f > 0) { let ws = 0; const k = top.map(([d]) => 1 / (d + .004)); k.forEach(x => (ws += x));
        top.forEach(([, q], j) => { for (let c = 0; c < 4; c++) { const w = sW.getComponent(q, c); if (w > 0) add(idx(sb[sI.getComponent(q, c)]), f * w * k[j] / ws); } }); }
      if (f < 1) for (let c = 0; c < 4; c++) { const w = cW.getComponent(i, c); if (w > 0) add(cI.getComponent(i, c), (1 - f) * w); }
      const best = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), t = best.reduce((x, e) => x + e[1], 0) || 1;
      best.forEach(([bi, w], c) => { NI[i * 4 + c] = bi; NW[i * 4 + c] = w / t; });
    }
    // smoothed over the garment's own surface: neighbours that picked different body parts (arm / chest under the arm)
    // would pull a triangle into a long shard between them; averaged out they stretch the cloth evenly instead
    const key = i => { v.fromBufferAttribute(pos, i); return `${Math.round(v.x * 2000)},${Math.round(v.y * 2000)},${Math.round(v.z * 2000)}`; };
    const weld = new Map(), wid = new Int32Array(n); for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k); }
    const nw = weld.size, nb = Array.from({ length: nw }, () => new Set()), ix = g.index ? g.index.array : null;
    if (ix) for (let t = 0; t < ix.length; t += 3) for (let e = 0; e < 3; e++) { const a = wid[ix[t + e]], b = wid[ix[t + (e + 1) % 3]]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
    const first2 = new Int32Array(nw).fill(-1); for (let i = 0; i < n; i++) if (first2[wid[i]] < 0) first2[wid[i]] = i;
    let W = Array.from({ length: nw }, () => new Map()); const FITW = new Uint8Array(nw); for (let i = 0; i < n; i++) if (FIT[i]) FITW[wid[i]] = 1;
    for (let i = 0; i < n; i++) { const M = W[wid[i]]; if (M.size) continue; for (let c = 0; c < 4; c++) if (NW[i * 4 + c] > 0) M.set(NI[i * 4 + c], NW[i * 4 + c]); }
    // a skirt (a loose garment hanging off the legs, > 2.5 cm from the skin below the hips): it does not belong to one
    // thigh or the other, or it splits up the side at every step; its leg weights are shared by both legs and the pelvis
    if (!tight) {
      const legs = new Map(); bones.forEach((b, k) => { const m2 = /^(upperleg|lowerleg)\d*([LR])$/.exec(b.name); if (m2) legs.set(k, m2[2]); });
      const pel = bones.findIndex(b => b.name === "root"), hipY = this.bones.upperleg01L ? (() => { this.root.updateMatrixWorld(true); return this.bones.upperleg01L.getWorldPosition(new THREE.Vector3()).y - this.root.position.y; })() : 1;
      if (pel >= 0) for (let a = 0; a < nw; a++) {
        const i = first2[a]; if (i < 0 || D0[i] < .025) continue; v.fromBufferAttribute(pos, i).applyMatrix4(XF); if (v.y > hipY) continue;
        const M = W[a]; let L = 0; for (const [b, w] of M) if (legs.has(b)) L += w; if (L < .05) continue;
        const o = new Map(); for (const [b, w] of M) if (!legs.has(b)) o.set(b, w);
        const pick = S => [...legs.entries()].filter(([, s2]) => s2 === S).map(([b]) => b).find(b => /upperleg01/.test(bones[b].name));
        const bl = pick("L"), br = pick("R");
        if (bl != null) o.set(bl, (o.get(bl) || 0) + L * .3); if (br != null) o.set(br, (o.get(br) || 0) + L * .3); o.set(pel, (o.get(pel) || 0) + L * .4);
        W[a] = o;
      }
    }
    for (let it = 0; it < 6; it++) {
      W = W.map((M, a) => { if (!nb[a].size || (only && !FITW[a])) return M; const o = new Map(); for (const [b, w] of M) o.set(b, .5 * w); const k = .5 / nb[a].size;
        for (const q of nb[a]) for (const [b, w] of W[q]) o.set(b, (o.get(b) || 0) + k * w); return o; });
    }
    // (where the cloth lies on the skin it keeps mostly the skin's own weights, so the skin cannot come through there)
    for (let i = 0; i < n; i++) { const k = only && !FIT[i] ? 0 : Math.max(0, Math.min(1, (.025 - D0[i]) / .015)) * .8; if (k <= 0) continue; const M = new Map(); for (const [b, w] of W[wid[i]]) M.set(b, (1 - k) * w);
      for (let c = 0; c < 4; c++) if (NW[i * 4 + c] > 0) M.set(NI[i * 4 + c], (M.get(NI[i * 4 + c]) || 0) + k * NW[i * 4 + c]); OWN[i] = M; }
    // (copies of one point along a UV seam get one set of weights, or the seam opens into a slit)
    const first = new Int32Array(nw).fill(-1); for (let i = 0; i < n; i++) if (first[wid[i]] < 0) first[wid[i]] = i;
    for (let i = 0; i < n; i++) { const j = first[wid[i]], best = [...(OWN[j] || W[wid[i]]).entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), t = best.reduce((x, e) => x + e[1], 0) || 1;
      for (let c = 0; c < 4; c++) { NI[i * 4 + c] = best[c] ? best[c][0] : 0; NW[i * 4 + c] = best[c] ? best[c][1] / t : 0; } }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(NI, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(NW, 4));
    m.bind(new THREE.Skeleton(bones, inv), m.bindMatrix);
  }
  _maskFrom(b64, unit = 1e-4) {
    const body = this.parts.get("Body"), n = body.geometry.attributes.position.count, M = new Uint8Array(n); if (!b64) return M;
    const s = atob(b64), a = new Int16Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = (s.charCodeAt(2 * i) | s.charCodeAt(2 * i + 1) << 8) << 16 >> 16;
    const C = .004, P = this._skinPos;
    for (let j = 0; j < a.length / 3; j++) { const x = a[j * 3] * unit, y = a[j * 3 + 1] * unit, z = a[j * 3 + 2] * unit, cx = Math.floor(x / C), cy = Math.floor(y / C), cz = Math.floor(z / C);
      for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) for (let l = -1; l <= 1; l++) for (const q of this._skinHash.get(`${cx + i},${cy + k},${cz + l}`) || [])
        if (Math.abs(P[q * 3] - x) + Math.abs(P[q * 3 + 1] - y) + Math.abs(P[q * 3 + 2] - z) < .003) M[q] = 1; }
    return M;
  }
  // the skin under what is worn is hidden: R = under clothes, G = under shoes (the skin shader discards those)
  _updateSkinMask() {
    const body = this.parts.get("Body"); if (!body) return; const g = body.geometry, n = g.attributes.position.count;
    let col = g.attributes.color; if (!col) { col = new THREE.BufferAttribute(new Float32Array(n * 4).fill(1), 4); g.setAttribute("color", col); }
    const R = new Uint8Array(n), G = new Uint8Array(n), Bc = new Uint8Array(n);
    for (const W of Object.values(this.worn)) {
      if (W.mask) { const T = W.channel === 1 ? G : R; for (let i = 0; i < n; i++) if (W.mask[i]) T[i] = 1; }
      if (W.cut) for (let i = 0; i < n; i++) if (W.cut[i]) Bc[i] = 1;     // B: well inside tight cloth, cut out
    }
    for (let i = 0; i < n; i++) { col.setComponent(i, 0, R[i]); col.setComponent(i, 1, G[i]); col.setComponent(i, 2, Bc[i]); }
    col.needsUpdate = true;
  }
  // a GLB split into base64 text parts (a manifest {bytes, parts}), for hosts that only serve text
  async _loadParts(url, onProgress) {
    const base = url.replace(/[^/]*$/, ""), man = await (await fetch(url)).json(), out = new Uint8Array(man.bytes); let off = 0, done = 0;
    await Promise.all(man.parts.map(async (p, i) => { const t = await (await fetch(base + p)).text(); man.parts[i] = t; onProgress && onProgress(++done / man.parts.length * .9); }));
    for (const t of man.parts) { const bin = atob(t); for (let i = 0; i < bin.length; i++) out[off++] = bin.charCodeAt(i); }
    return this._L.parseAsync(out.buffer, base);
  }
  // put on an item (a GLB url); it replaces whatever the same slot held. Returns {ok, slot, id}
  // { color: tint, socks: false = shoes without MakeHuman's sock (bare ankle above the shoe line; the item says where
  // that is), sockTint: the colour of what is left of it inside the shoe }
  async wear(url, { color, socks = true, sockTint } = {}) {
    const g = /\.json$/.test(url) ? await this._loadParts(url) : await this._L.loadAsync(url); const meshes = []; g.scene.traverse(o => { if (o.isSkinnedMesh || o.isMesh) meshes.push(o); });
    if (!meshes.length) return { ok: false, error: "no mesh in " + url };
    const ex = meshes.map(m => m.userData).find(u => u.slot) || {}, slot = ex.slot || "outfit", layer = slot === "hair" ? "hair" : "clothes";
    this.takeOff(slot, { keepBase: true });
    const host = this.parts.get("Body").parent;
    for (const m of meshes) {
      if (m.isSkinnedMesh) { const bones = m.skeleton.bones.map(b => this.bones[b.name] || b); m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), m.bindMatrix); }
      host.add(m); m.frustumCulled = false; m.userData.part = ex.item || m.name; m.userData.layerName = layer; m.userData.ownShapes = true; m.castShadow = true;
      if (m.material && m.material.map && m.material.transparent && !m.material.alphaTest) { m.material.alphaTest = .15; m.material.alphaToCoverage = true; m.material.side = THREE.DoubleSide; }
      if (color && m.material) m.material.color.set(color);
      if (slot === "outfit" && m.material) this._inflate(m.material, .002);
      if (slot === "outfit" && !ex.prefit) this._fitCloth(m);   // (an item cut from the skin itself comes fitted)
      if (slot === "shoes") this._fitShoe(m);
      if (slot === "shoes" && ex.sock && m.material) this._sockShader(m.material, ex.sock, sockTint);
      if (this.drive && this.drive.couple && slot !== "hair") this.drive.couple(m);
      m.userData.baseMat = m.material; this.layerMeshes[layer].push(m); this.parts.set(m.userData.part, m);
    }
    const sockMasks = slot === "shoes" && ex.sock ? { full: this._maskFrom(ex.hides), cut: this._maskFrom(ex.sock.hides) } : null;
    this.worn[slot] = { id: ex.item || url, meshes, mask: sockMasks ? sockMasks.full : this._maskFrom(ex.hides), sockMasks, cut: ex.cut && !meshes.some(m => m.material && m.material.transparent) ? this._maskFrom(ex.cut) : null,   // (see-through parts, tights: the skin under them stays) channel: slot === "shoes" ? 1 : 0, title: ex.title,
      socks: !(slot === "shoes" && !socks && ex.sock), sock: ex.sock, sockTint };
    this._updateSkinMask(); this._updateSocks(); this.setShape({}); this.applyLayers(); if (slot === "hair") this._browTint();
    // whatever of a hairstyle hangs free swings on a spring chain (hair-spring.js); opt.hairPhysics === false: rigid
    if (slot === "hair" && this.opt.hairPhysics !== false) { const m = meshes.find(o => o.isSkinnedMesh); if (m) try { this.root.updateMatrixWorld(true); const hs = hairSpring(this, m, this.opt.hair || {}); if (hs.ok) { hs.slot = "hair"; this.springs = (this.springs || []).filter(x => x.slot !== "hair"); this.springs.push(hs); } } catch (e) { console.warn("hair spring off:", e); } }
    this.dispatchEvent(new CustomEvent("wardrobe", { detail: this.wardrobe() }));
    return { ok: true, slot, id: ex.item || url, title: ex.title };
  }
  // take off a slot; with nothing left for "outfit" the base sports suit goes back on (the character is always dressed)
  takeOff(slot, { keepBase = false } = {}) {
    const W = this.worn && this.worn[slot]; if (!W) return { ok: false, error: "nothing in " + slot };
    for (const m of W.meshes) {
      if (W.id === "builtin") { m.userData.hidden = true; continue; }    // the model's own items stay in memory, hidden
      if (m.userData.wrapProxy) { m.userData.wrapProxy.parent && m.userData.wrapProxy.parent.remove(m.userData.wrapProxy); this.wraps = (this.wraps || []).filter(x => x.src !== m); }
      m.parent && m.parent.remove(m); for (const l of LAYERS) { const i = this.layerMeshes[l].indexOf(m); if (i >= 0) this.layerMeshes[l].splice(i, 1); }
      this.parts.delete(m.userData.part); m.geometry.dispose();
    }
    delete this.worn[slot]; if (this.springs) this.springs = this.springs.filter(x => x.slot !== slot);
    if (!keepBase && slot === "outfit") this._wearBuiltin("outfit");
    this._updateSkinMask(); this._updateSocks(); this.applyLayers(); return { ok: true, slot };
  }
  _wearBuiltin(slot) {
    const re = { outfit: /^Clothes_(?!Shoes)/, shoes: /^Clothes_Shoes/, hair: /^Hair$/ }[slot]; if (!re) return;
    const meshes = [...this.layerMeshes.clothes, ...this.layerMeshes.hair].filter(m => re.test(m.name)); if (!meshes.length) return;
    for (const m of meshes) { m.userData.hidden = false; if (slot === "outfit" && m.material) this._inflate(m.material, .002); }
    const ch = slot === "shoes" ? 1 : 0, body = this.parts.get("Body"), col = body.geometry.attributes.color;
    this.worn[slot] = { id: "builtin", meshes, mask: this._builtinMask && this._builtinMask[slot] || null, channel: ch };
  }
  wardrobe() { return Object.fromEntries(Object.entries(this.worn || {}).map(([k, W]) => [k, { id: W.id, title: W.title || null }])); }
  // the model's ARKit face shapes (eyeBlinkLeft ... on Body, brows, lashes, teeth, tongue): name -> [[mesh, index]], or null
  _arkitMap() {
    if (this._ak !== undefined) return this._ak;
    const M = {}; this.root.traverse(o => { if (o.morphTargetDictionary) for (const [n, i] of Object.entries(o.morphTargetDictionary)) if (/^(eye|jaw|mouth|brow|cheek|nose|tongue)[A-Z]/.test(n)) (M[n] = M[n] || []).push([o, i]); });
    return (this._ak = M.eyeBlinkLeft && M.jawOpen ? M : null);
  }
  // a face performance (video_to_clip.py --face): {fps, names, frames}; the procedural face resumes when it ends
  /* ---------------- motion clips (mocap, video takes, any humanoid's animations) ---------------- */
  // load the animations of a GLB (any humanoid rig: Rocketbox/Biped, Mixamo, CC, UE, or this skeleton) and retarget
  // them onto this body; returns the names. names: {source clip name: our name}, or a function, to rename / pick
  async loadClips(url, { names = null, move = false } = {}) {
    const g = await this._L.loadAsync(url); this.clips = this.clips || {}; const out = [];
    // our own skeleton (a clip file made for this body, its nodes need not be skinned bones): no retarget
    const own = (() => { let m = 0; g.scene.traverse(o => { if (this.bones[o.name]) m++; }); return m / Object.keys(this.bones).length > .9; })();
    for (const c of g.animations) {
      let t0 = Infinity, t1 = 0; for (const t of c.tracks) { t0 = Math.min(t0, t.times[0]); t1 = Math.max(t1, t.times[t.times.length - 1]); }
      if (t0 > 1e-3 && isFinite(t0)) {                     // clips cut from a longer take keep its clock (tracks may share one times array)
        const seen = new Set(); for (const t of c.tracks) if (!seen.has(t.times)) { seen.add(t.times); for (let i = 0; i < t.times.length; i++) t.times[i] -= t0; }
        c.duration = t1 - t0; }
      const nm = typeof names === "function" ? names(c.name) : names ? names[c.name] : c.name.replace(/\.max$/, ""); if (!nm) continue;
      const clip = own ? c : retarget({ root: g.scene, clip: c }, this.root, this.bones, { move, name: nm }); clip.name = nm;
      this.clips[nm] = clip; out.push(nm);
    }
    return out;
  }
  // play a loaded clip over the procedural pose: fades in and out, the face, breath and soft tissue stay alive;
  // { loop, fade (s), speed, weight (0..1: how much of the clip), hold: stay on the last frame }
  playClip(name, { loop = false, fade = .35, speed = 1, weight = 1, hold = false, idle = false } = {}) {
    const clip = this.clips && this.clips[name]; if (!clip) return { ok: false, error: "no clip " + name + "; loaded: " + Object.keys(this.clips || {}).join(", ") };
    this._mixer = this._mixer || new THREE.AnimationMixer(this.root);
    const prev = this._clip; if (prev && prev.action) prev.action.stop();
    const action = this._mixer.clipAction(clip); action.reset(); action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); action.clampWhenFinished = true; action.timeScale = speed; action.play();
    const bones = clip.tracks.map(t => this.bones[t.name.split(".")[0]]).filter(Boolean);
    // from the clip that was playing the new one starts where that one stood (crossfade over `fade`)
    if (prev && prev.w > 0) { this._xf = { bones: prev.bones, q: prev.bones.map(b => b.quaternion.clone()), t: 0, dur: Math.max(.05, fade) }; }
    this._clip = { name, action, clip, bones, w: prev && prev.w > 0 ? 1 : 0, target: weight, weight, fade, loop, hold, idle, air: !!(clip.userData && clip.userData.air), pq: bones.map(() => new THREE.Quaternion()), pp: new THREE.Vector3() };
    this.dispatchEvent(new CustomEvent("clip", { detail: { name, state: "start" } }));
    return { ok: true, clip: name, seconds: +(clip.duration / speed).toFixed(2) };
  }
  stopClip(fade = .35) { if (this._clip) { this._clip.target = 0; this._clip.fade = fade; this._clip.hold = false; this._clip.loop = false; } return { ok: true }; }
  clipNames() { return Object.keys(this.clips || {}); }
  _clipLayer(dt) {
    const C = this._clip, A = C.action, root = this.bones.root;
    if (!C.loop && !C.hold && A.time >= C.clip.duration - C.fade * A.timeScale) C.target = 0;       // fade out at the end
    const k = C.fade > 0 ? Math.min(1, dt / C.fade) : 1; C.w += Math.sign(C.target - C.w) * Math.min(Math.abs(C.target - C.w), k);
    C.bones.forEach((b, i) => C.pq[i].copy(b.quaternion)); if (root) C.pp.copy(root.position);
    this._mixer.update(dt);
    if (C.w < 1) { C.bones.forEach((b, i) => b.quaternion.copy(C.pq[i].slerp(b.quaternion, C.w))); if (root) root.position.copy(C.pp.lerp(root.position, C.w)); }   // procedural -> clip
    if (this._xf) { const X = this._xf; X.t += dt; const u = Math.min(1, X.t / X.dur), e = u * u * (3 - 2 * u);   // crossfade from the last clip's pose
      X.bones.forEach((b, i) => b.quaternion.copy(X.q[i].clone().slerp(b.quaternion, e))); if (u >= 1) this._xf = null; }
    if (C.target === 0 && C.w <= 1e-3) { A.stop(); this._clip = null; this.dispatchEvent(new CustomEvent("clip", { detail: { name: C.name, state: "end" } })); }
  }
  playFace(data, { loop = false, gain = 1 } = {}) { this._faceClip = data && data.frames && data.frames.length ? { d: data, t0: this.t, loop, gain, dur: data.frames.length / data.fps } : null; return { ok: !!this._faceClip }; }
  talk(seconds, text) { this._talk = seconds > 0 ? { t0: this.t, until: this.t + seconds, vis: text ? visemes(text) : null } : null; return { ok: true, seconds }; }
  // eyes follow the camera: 0 off .. 1 fully
  // eye colour: MakeHuman's iris textures (CC0) in ./eyes/ — brown (reddish), brownlight (hazel, the default), green,
  // bluegreen, blue, deepblue, grey, ice
  async setEyeColor(name = "brownlight") {
    const eyes = this.parts.get("Eyes"); if (!eyes || !eyes.material) return { ok: false, error: "no eyes" };
    if (!/^[a-z]+$/.test(name)) return { ok: false, error: "unknown colour" };
    try {
      const t = await new THREE.TextureLoader().loadAsync(new URL(`./eyes/${name}.jpg`, import.meta.url).href);
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      for (const m of [eyes.material, eyes.userData.baseMat]) if (m && m.map !== undefined) { const o = m.map; m.map = t; m.needsUpdate = true; if (o && o !== t) o.dispose && o.dispose(); }
      this.eyeColor = name; return { ok: true, eyes: name };
    } catch (e) { return { ok: false, error: "no eye colour " + name }; }
  }
  setGaze(v) { this.gaze = Math.max(0, Math.min(1, +v || 0)); return { ok: true, gaze: this.gaze }; }
  // soft tissue on springs (models with jiggle bones, see jiggle.js): on/off and strength (1 = natural)
  setJiggle({ on, gain } = {}) { if (!this.jiggle) return { ok: false, error: "this model has no jiggle bones" };
    if (on != null) this.jiggle.on = !!on; if (gain != null && isFinite(+gain)) this.jiggle.gain = Math.max(0, Math.min(2, +gain)); return { ok: true, on: this.jiggle.on, gain: this.jiggle.gain }; }
  snap() { if (this.jiggle) this.jiggle.reset(); for (const s of this.springs || []) s.reset(); for (const k of POSE_KEYS) this.pose[k] = this.target[k]; if (this.camTween) { const T = this.camTween; this.controls.target.copy(T.b.t); this.camera.position.copy(T.b.p); this.camTween = null; } if (this.root) { this._applyPose(); if (this.drive) { this.root.updateMatrixWorld(true); for (let i = 0; i < 40; i++) this.drive.update(.1); } } }
  state() { return { pose: Object.fromEntries(POSE_KEYS.map(k => [k, Math.round(this.target[k] * 10) / 10])), shape: { ...this.shape }, layers: { ...this.layerOn }, opacity: { ...this.opacity }, highlighted: [...this.hl.keys()].map(m => m.userData.part) }; }
  listParts(filter) { const out = []; for (const [n, m] of this.parts) if (!filter || m.userData.layerName === filter) out.push({ name: n, ru: ruName(n), layer: m.userData.layerName }); return out; }
}
export { VERTEBRAE, ruName };
