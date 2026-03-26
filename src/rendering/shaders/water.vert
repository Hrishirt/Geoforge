varying vec3 vWorldPosition;
varying float vFogDepth;
varying vec2 vUv;

uniform float time;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Subtle wave displacement
  float wave1 = sin(pos.x * 0.02 + time * 0.8) * cos(pos.z * 0.015 + time * 0.6) * 0.4;
  float wave2 = sin(pos.x * 0.04 + time * 1.2) * cos(pos.z * 0.03 + time * 0.9) * 0.15;
  pos.y += wave1 + wave2;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;

  vec4 mvPosition = viewMatrix * worldPos;
  vFogDepth = -mvPosition.z;

  gl_Position = projectionMatrix * mvPosition;
}
