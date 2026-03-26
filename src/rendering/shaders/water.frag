varying vec3 vWorldPosition;
varying float vFogDepth;
varying vec2 vUv;

uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;
uniform vec3 cameraPosition;

void main() {
  vec3 waterDeep = vec3(0.06, 0.15, 0.28);
  vec3 waterShallow = vec3(0.12, 0.35, 0.55);

  // Simple depth-ish effect based on wave pattern
  float pattern = sin(vWorldPosition.x * 0.05 + time * 0.5) * cos(vWorldPosition.z * 0.05 + time * 0.3);
  vec3 waterColor = mix(waterDeep, waterShallow, pattern * 0.5 + 0.5);

  // Specular highlight from sun
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 normal = vec3(0.0, 1.0, 0.0);
  vec3 halfDir = normalize(viewDir + sunDirection);
  float spec = pow(max(dot(normal, halfDir), 0.0), 128.0);
  waterColor += sunColor * spec * 0.5;

  // Sun diffuse on water surface
  float NdotL = max(dot(normal, sunDirection), 0.0);
  waterColor += sunColor * NdotL * 0.08;

  // Fog
  float fogFactor = 1.0 - exp(-fogDensity * vFogDepth);
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  vec3 finalColor = mix(waterColor, fogColor, fogFactor);

  finalColor = pow(finalColor, vec3(1.0 / 2.2));

  gl_FragColor = vec4(finalColor, 0.82);
}
