// Skin micro detail shared by the viewers: tiling pores as a normal map (made on a canvas, no file) and a light
// subsurface look for the direct light (wrap lighting, redder at the terminator: light that went into the skin and
// came out a little further on, as it does in a person). Used by body.js for every page.
import * as THREE from "three";

export // tiling pore detail as a normal map: soft noise of two scales turned into normals
function poreNormalMap(size = 256) {
  const n = size, h = new Float32Array(n * n), rnd = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const val = (x, y, f) => { const X = x * f / n, Y = y * f / n, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, w = f;
    const r = (a, b) => rnd(((a % w) + w) % w, ((b % w) + w) % w), sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (r(x0, y0) * (1 - sx) + r(x0 + 1, y0) * sx) * (1 - sy) + (r(x0, y0 + 1) * (1 - sx) + r(x0 + 1, y0 + 1) * sx) * sy; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = val(x, y, 64) * .6 + val(x, y, 16) * .4;
  const c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d"), im = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = h[y * n + (x + 1) % n] - h[y * n + (x - 1 + n) % n], dy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x], k = 4;
    const nx = -dx * k, ny = -dy * k, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * n + x) * 4;
    im.data[i] = (nx / l * .5 + .5) * 255; im.data[i + 1] = (ny / l * .5 + .5) * 255; im.data[i + 2] = (nz / l * .5 + .5) * 255; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(64, 64); return t;
}

// the diffuse part of three's physical lighting with wrapped, per-channel falloff (red reaches furthest round)
export function sssLights(wrap = "vec3(.32, .15, .09)") {
  const L = THREE.ShaderChunk.lights_physical_pars_fragment, line = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );";
  if (!L.includes(line)) return null;                                     // another three.js: keep its own lighting
  return L.replace(line, `{ float nlw = dot( geometryNormal, directLight.direction ); vec3 W = ${wrap};
    vec3 wr = clamp( ( vec3( nlw ) + W ) / ( 1.0 + W ), 0.0, 1.0 ); reflectedLight.directDiffuse += wr * directLight.color * BRDF_Lambert( material.diffuseColor ); }`);
}
