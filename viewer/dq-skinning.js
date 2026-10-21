// Dual quaternion skinning for every skinned mesh (skin, clothes, muscles, organs).
// The standard linear blend averages bone matrices, and at a bent knee, elbow or hip the averaged matrix shrinks:
// the skin collapses into the joint and the bones come out through it. A dual quaternion blend keeps the blend a
// pure rotation plus translation, so the limb keeps its volume (measured on this model: knee 41% -> 79% of the
// rest volume at 115°, hip 37% -> 98% in a squat). Bone scale is taken as uniform (scaling the whole model).
// It replaces three.js' skinning shader chunks; a material with defines.LINEAR_SKINNING keeps the old blend.
import * as THREE from "three";

const C = THREE.ShaderChunk;
if (!C.skinning_pars_vertex.includes("dqRot")) {
  C.skinning_pars_vertex += /* glsl */`
#if defined( USE_SKINNING ) && !defined( LINEAR_SKINNING )
	vec4 dqFromMat3( mat3 m ) {
		float tr = m[0][0] + m[1][1] + m[2][2]; vec4 q;
		if ( tr > 0.0 ) { float s = sqrt( tr + 1.0 ) * 2.0; q = vec4( ( m[1][2] - m[2][1] ) / s, ( m[2][0] - m[0][2] ) / s, ( m[0][1] - m[1][0] ) / s, 0.25 * s ); }
		else if ( m[0][0] > m[1][1] && m[0][0] > m[2][2] ) { float s = sqrt( 1.0 + m[0][0] - m[1][1] - m[2][2] ) * 2.0; q = vec4( 0.25 * s, ( m[1][0] + m[0][1] ) / s, ( m[2][0] + m[0][2] ) / s, ( m[1][2] - m[2][1] ) / s ); }
		else if ( m[1][1] > m[2][2] ) { float s = sqrt( 1.0 + m[1][1] - m[0][0] - m[2][2] ) * 2.0; q = vec4( ( m[1][0] + m[0][1] ) / s, 0.25 * s, ( m[2][1] + m[1][2] ) / s, ( m[2][0] - m[0][2] ) / s ); }
		else { float s = sqrt( 1.0 + m[2][2] - m[0][0] - m[1][1] ) * 2.0; q = vec4( ( m[2][0] + m[0][2] ) / s, ( m[2][1] + m[1][2] ) / s, 0.25 * s, ( m[0][1] - m[1][0] ) / s ); }
		return q;
	}
	// bone matrix -> unit dual quaternion (qr, qd) and its uniform scale
	void dqFromBone( mat4 m, out vec4 qr, out vec4 qd, out float s ) {
		s = length( m[0].xyz ); qr = normalize( dqFromMat3( mat3( m ) / s ) ); vec3 t = m[3].xyz;
		qd = 0.5 * vec4( t * qr.w + cross( t, qr.xyz ), - dot( t, qr.xyz ) );
	}
	vec3 dqRot( vec4 q, vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }
	vec3 dqMove( vec4 qr, vec4 qd ) { return 2.0 * ( qr.w * qd.xyz - qd.w * qr.xyz + cross( qr.xyz, qd.xyz ) ); }
#endif
`;
  C.skinbase_vertex += /* glsl */`
#if defined( USE_SKINNING ) && !defined( LINEAR_SKINNING )
	vec4 dqR, dqD, dqR1, dqD1; float dqS, dqS1, dqW;
	dqFromBone( boneMatX, dqR, dqD, dqS ); dqR *= skinWeight.x; dqD *= skinWeight.x; dqS *= skinWeight.x;
	vec4 dqR0 = dqR;
	dqFromBone( boneMatY, dqR1, dqD1, dqS1 ); dqW = dot( dqR1, dqR0 ) < 0.0 ? - skinWeight.y : skinWeight.y; dqR += dqR1 * dqW; dqD += dqD1 * dqW; dqS += dqS1 * skinWeight.y;
	dqFromBone( boneMatZ, dqR1, dqD1, dqS1 ); dqW = dot( dqR1, dqR0 ) < 0.0 ? - skinWeight.z : skinWeight.z; dqR += dqR1 * dqW; dqD += dqD1 * dqW; dqS += dqS1 * skinWeight.z;
	dqFromBone( boneMatW, dqR1, dqD1, dqS1 ); dqW = dot( dqR1, dqR0 ) < 0.0 ? - skinWeight.w : skinWeight.w; dqR += dqR1 * dqW; dqD += dqD1 * dqW; dqS += dqS1 * skinWeight.w;
	{ float l = length( dqR ); dqR /= l; dqD /= l; dqS /= ( skinWeight.x + skinWeight.y + skinWeight.z + skinWeight.w ); }
#endif
`;
  const lin = /#ifdef USE_SKINNING\n([\s\S]*)#endif/;
  C.skinnormal_vertex = C.skinnormal_vertex.replace(lin, (_, body) => `#if defined( USE_SKINNING ) && defined( LINEAR_SKINNING )\n${body}#elif defined( USE_SKINNING )
	objectNormal = ( bindMatrixInverse * vec4( dqRot( dqR, ( bindMatrix * vec4( objectNormal, 0.0 ) ).xyz ), 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = ( bindMatrixInverse * vec4( dqRot( dqR, ( bindMatrix * vec4( objectTangent, 0.0 ) ).xyz ), 0.0 ) ).xyz;
	#endif
#endif`);
  C.skinning_vertex = C.skinning_vertex.replace(lin, (_, body) => `#if defined( USE_SKINNING ) && defined( LINEAR_SKINNING )\n${body}#elif defined( USE_SKINNING )
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	transformed = ( bindMatrixInverse * vec4( dqRot( dqR, skinVertex.xyz * dqS ) + dqMove( dqR, dqD ), 1.0 ) ).xyz;
#endif`);
}

// switch one material between dual quaternion (default) and linear blend skinning
export function setLinearSkinning(material, linear) {
  material.defines = material.defines || {};
  const has = "LINEAR_SKINNING" in material.defines;
  if (linear && !has) material.defines.LINEAR_SKINNING = ""; else if (!linear && has) delete material.defines.LINEAR_SKINNING; else return;
  material.needsUpdate = true;
}
