attribute vec3 biomeWeights1; // ocean, beach, plains
attribute vec3 biomeWeights2; // forest, mountain, snow

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFogDepth;
varying vec3 vBiomeW1;
varying vec3 vBiomeW2;

void main() {
  vColor = color;
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  vBiomeW1 = biomeWeights1;
  vBiomeW2 = biomeWeights2;

  vec4 mvPosition = viewMatrix * worldPos;
  vFogDepth = -mvPosition.z;

  gl_Position = projectionMatrix * mvPosition;
}
