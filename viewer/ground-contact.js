// Flesh and cloth on the ground. Whatever of the body goes under the ground's plane is pressed flat onto it, in the
// vertex shader, after the skinning, the morphs and everything else. The skeleton's points keep the joints above the
// sand (ragdoll.js), but the flesh round them is fuller than their balls: lying on her side, the hip, the breast, the
// thigh would sink into the sand, and since the sand is drawn behind the body they would show below its line.
// (Each point keeps where it is across the plane: only its height is taken up to the plane, 2 mm over it so the
// shadow-catcher under her does not flicker through. The light and the shadow map still see the unpressed shape.)
export function groundContact(materials, U) {
  let n = 0;
  for (const m of materials) { if (!m || m.userData.groundHooked) continue; m.userData.groundHooked = true; n++;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => "";
    m.onBeforeCompile = (sh, r) => { prev && prev.call(m, sh, r); Object.assign(sh.uniforms, U);
      sh.vertexShader = "uniform vec2 uGround;\n" + sh.vertexShader.replace("#include <project_vertex>", `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
 mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
 mvPosition = instanceMatrix * mvPosition;
#endif
{ vec4 wq = modelMatrix * mvPosition;                                                     // ground contact: pressed flat on the plane
  if (uGround.y > .5 && wq.y < uGround.x + .002) { wq.y = uGround.x + .002; mvPosition = viewMatrix * wq; } else mvPosition = modelViewMatrix * mvPosition; }
gl_Position = projectionMatrix * mvPosition;`); };
    m.customProgramCacheKey = () => "ground|" + prevKey(); m.needsUpdate = true; }
  return n;
}
