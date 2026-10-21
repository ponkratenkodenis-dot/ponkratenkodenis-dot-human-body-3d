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
  "thumbL", "indexL", "middleL", "ringL", "littleL", "thumbR", "indexR", "middleR", "ringR", "littleR", "breath"];
// hand keys are kept when a whole-body preset is chosen (a fist stays a fist while the body squats)
export const HAND_KEYS = ["thumbL", "indexL", "middleL", "ringL", "littleL", "thumbR", "indexR", "middleR", "ringR", "littleR", "wristLFlex", "wristRFlex", "spreadL", "spreadR"];
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
  tiptoe: { ankleL: 40, ankleR: 40, toesL: -40, toesR: -40 }
};

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
    this.camera = new THREE.PerspectiveCamera(32, 1, .01, 50); this.camera.position.set(0, 1.1, 4.2);
    this.controls = new OrbitControls(this.camera, R.domElement); this.controls.target.set(0, .95, 0); this.controls.enableDamping = true;
    this.controls.minDistance = .15; this.controls.maxDistance = 12;
    this.pose = Object.fromEntries(POSE_KEYS.map(k => [k, 0])); this.target = { ...this.pose }; this.target.breath = 1;
    this.live = true; this.parts = new Map(); this.layerMeshes = Object.fromEntries(LAYERS.map(l => [l, []]));
    this.layerOn = { clothes: true, hair: true, skin: true, muscles: false, organs: false, skeleton: false };
    this.opacity = { skin: 1, muscles: 1, organs: 1, skeleton: 1, clothes: 1, hair: 1 };
    this.hl = new Map(); this.camTween = null; this.clock = new THREE.Clock(); this.t = 0;
    new ResizeObserver(() => this.resize()).observe(el); this.resize();
    R.domElement.addEventListener("pointerdown", e => (this._down = [e.clientX, e.clientY]));
    R.domElement.addEventListener("pointerup", e => { if (this._down && Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) < 5) this.pickAt(e.clientX, e.clientY); });
    R.setAnimationLoop(() => this.frame());
  }
  resize() { const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1; this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = "100%"; this.renderer.domElement.style.height = "100%"; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

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
    for (const k in this.bones) { const B = this.bones[k], q = new THREE.Quaternion(); if (B.parent) B.parent.getWorldQuaternion(q); const rq = this.root.getWorldQuaternion(new THREE.Quaternion()).invert(); q.premultiply(rq); B.userData.pr = q.clone(); B.userData.pri = q.clone().invert(); }
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
    this._ballRest = this._ballPos();
  }
  _ballPos() { const v = new THREE.Vector3(), s = new THREE.Vector3(); (this._balls || []).forEach(f => s.add(f.getWorldPosition(v))); return s.multiplyScalar(1 / ((this._balls || []).length || 1)); }
  // rotate a bone about an axis given in the root frame of the rest pose (degrees)
  _rotAx(b, axis, deg) {
    const B = this.bones[b]; if (!B || !axis || !deg) return;
    this._q.setFromAxisAngle(axis, deg * D2R); this._q2.copy(B.userData.pri).multiply(this._q).multiply(B.userData.pr); B.quaternion.premultiply(this._q2);
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
  setLayer(l, on) { if (l === "all") LAYERS.forEach(x => (this.layerOn[x] = on)); else if (l in this.layerOn) this.layerOn[l] = !!on; this.applyLayers(); }
  setOpacity(l, a) { if (l in this.opacity) this.opacity[l] = Math.max(0, Math.min(1, a)); this.applyLayers(); }
  // peel down to one depth: dressed | skin | muscles | skeleton | xray (skin ghosted over muscles over bones)
  peel(depth) {
    // order: clothes, hair, skin, muscles, organs, skeleton
    const P = { dressed: [1, 1, 1, 0, 0, 0], skin: [0, 1, 1, 0, 0, 0], muscles: [0, 0, 0, 1, 0, 0], skeleton: [0, 0, 0, 0, 0, 1], xray: [0, 0, 1, 1, 0, 1],
      muscles_bones: [0, 0, 0, 1, 0, 1], organs: [0, 0, 1, 0, 1, 1], organs_only: [0, 0, 0, 0, 1, 0] }[depth];
    if (!P) throw new Error("unknown depth " + depth);
    LAYERS.forEach((l, i) => (this.layerOn[l] = !!P[i]));
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
    for (const k in this.bones) { const B = this.bones[k]; if (B.userData.rest) B.quaternion.copy(B.userData.rest); }
    const br = P.breath * (this.live ? Math.sin(this.t * 1.6) : 0);
    // trunk: hip hinge at the pelvis, then the spine segment by segment, then the neck
    this._rot("root", P.hipFlex, 0, 0);
    for (const s of SPINE) this._rot(s, P.spineFlex * SHARE.flex[s] - (s === "spine01" ? br * .9 : 0), P.spineTwist * SHARE.twist[s], P.spineSide * SHARE.side[s]);
    if (this.regionBend) for (const r in this.regionBend) { const rb = this.regionBend[r], segs = REGION[r] || []; for (const s of segs) this._rot(s, rb.flex / segs.length, rb.twist / segs.length, rb.side / segs.length); }
    for (const s of NECK) this._rot(s, P.neckFlex * (SHARE.nflex[s] || 0) + (s === "neck01" ? br * .6 : 0), P.neckTwist * (SHARE.ntwist[s] || 0), P.neckSide * (SHARE.nside[s] || 0));
    this._rot("clavicleL", 0, 0, -br * .5); this._rot("clavicleR", 0, 0, br * .5);
    // legs: undo the hip hinge so they stay upright, then hip flexion/abduction, knee, and a foot that stays flat
    for (const [S, K, A] of [["L", P.kneeL, P.hipLRaise], ["R", P.kneeR, P.hipRRaise]]) {
      const th = K * .75;
      this._rot("upperleg01" + S, -P.hipFlex - th, 0, S === "L" ? -A : A);
      this._rot("lowerleg01" + S, K, 0, 0);
      this._rot("foot" + S, -(K - th) + P["ankle" + S], 0, 0);           // + ankle: plantar flexion (point the foot)
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
    // pointing the feet (tiptoe): the balls of the feet stay on the floor instead of the ankles
    const w = Math.min(1, Math.max(0, Math.max(P.ankleL, P.ankleR) / 15)), f = this._footPos(), rest = this._footRest.clone();
    if (w > 0 && this._ballRest) { f.lerp(this._ballPos(), w); rest.lerp(this._ballRest, w); }
    this.root.position.set(rest.x - f.x, rest.y - f.y, rest.z - f.z);
  }
  frame() {
    const dt = Math.min(.05, this.clock.getDelta()); this.t += dt;
    if (this.root) {
      const k = 1 - Math.exp(-dt * 5); for (const key of POSE_KEYS) this.pose[key] += (this.target[key] - this.pose[key]) * k;
      this._applyPose();
      if (this.drive) { this.root.updateMatrixWorld(true); this.drive.update(dt); }
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
