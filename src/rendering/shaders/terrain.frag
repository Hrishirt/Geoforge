varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFogDepth;
varying vec3 vBiomeW1;
varying vec3 vBiomeW2;

uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 ambientColor;
uniform vec3 fogColor;
uniform float fogDensity;

uniform sampler2D grassTex;
uniform sampler2D rockTex;
uniform sampler2D sandTex;
uniform sampler2D grassNormal;
uniform sampler2D rockNormal;
uniform float useTextures;

void main() {
  vec3 normal = normalize(vNormal);

  // World-space tiling UVs
  vec2 uvFine   = vWorldPosition.xz;       // 32 repeats per 32-unit chunk
  vec2 uvCoarse = vWorldPosition.xz * 0.5; // 16 repeats per chunk

  // Biome weights
  float wOcean    = vBiomeW1.x;
  float wBeach    = vBiomeW1.y;
  float wPlains   = vBiomeW1.z;
  float wForest   = vBiomeW2.x;
  float wMountain = vBiomeW2.y;
  float wSnow     = vBiomeW2.z;

  // Texture sampling
  vec3 oceanCol  = vec3(0.08, 0.18, 0.35);
  vec3 sandCol   = texture2D(sandTex, uvFine).rgb * vec3(1.3, 1.1, 0.7);
  vec3 grassCol  = texture2D(grassTex, uvFine).rgb;
  vec3 forestCol = texture2D(grassTex, uvFine * 0.8).rgb * vec3(0.5, 0.72, 0.3);
  vec3 rockCol   = texture2D(rockTex, uvCoarse).rgb;
  vec3 snowCol   = rockCol * 0.25 + vec3(0.68, 0.69, 0.72);

  vec3 texColor = wOcean    * oceanCol
                + wBeach    * sandCol
                + wPlains   * grassCol
                + wForest   * forestCol
                + wMountain * rockCol
                + wSnow     * snowCol;

  vec3 baseColor = mix(vColor, texColor, useTextures);

  // Normal-map perturbation (simplified world-space blend)
  vec3 gN = texture2D(grassNormal, uvFine).rgb   * 2.0 - 1.0;
  vec3 rN = texture2D(rockNormal, uvCoarse).rgb   * 2.0 - 1.0;
  float grassNW = (wPlains + wForest) * useTextures;
  float rockNW  = wMountain * useTextures;
  normal = normalize(normal + gN * grassNW * 0.25 + rN * rockNW * 0.25);

  // Directional light
  float NdotL = max(dot(normal, sunDirection), 0.0);
  vec3 diffuse = sunColor * NdotL * 0.7;

  // Ambient occlusion approx
  float ao = 0.6 + 0.4 * normal.y;

  // Hemisphere ambient
  float hemi = 0.5 + 0.5 * normal.y;
  vec3 ambient = mix(ambientColor * 0.4, ambientColor * 0.8, hemi);

  vec3 litColor = baseColor * (ambient + diffuse) * ao;

  // Exponential fog
  float fogFactor = 1.0 - exp(-fogDensity * vFogDepth);
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  vec3 finalColor = mix(litColor, fogColor, fogFactor);

  gl_FragColor = vec4(finalColor, 1.0);
}
