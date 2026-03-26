import * as THREE from 'three';
import terrainVertSrc from '../rendering/shaders/terrain.vert?raw';
import terrainFragSrc from '../rendering/shaders/terrain.frag?raw';
import { BIOME_COLORS, BIOME_COLORS_SHALLOW_OCEAN } from '../biome/BiomeLabeler.js';

const CHUNK_WORLD_SIZE = 32;
const SKIRT_DROP = 10;

export class ChunkMesh {
  constructor(chunkX, chunkZ, resolution, noiseGen, biomeNetwork, noiseConfig, sharedUniforms) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.resolution = resolution;
    this.worldX = chunkX * CHUNK_WORLD_SIZE;
    this.worldZ = chunkZ * CHUNK_WORLD_SIZE;
    this.mesh = null;
    this.heightSamples = null;
    this._generate(noiseGen, biomeNetwork, noiseConfig, sharedUniforms);
  }

  _generate(noiseGen, biomeNetwork, config, sharedUniforms) {
    const res = this.resolution;
    const step = CHUNK_WORLD_SIZE / (res - 1);
    const mainCount = res * res;
    const skirtCount = 4 * res;
    const totalVerts = mainCount + skirtCount;

    const positions = new Float32Array(totalVerts * 3);
    const heightArr = new Float32Array(totalVerts);
    this.heightSamples = new Float32Array(mainCount);

    // ── 1. Main grid — absolute world-coordinate noise sampling ──
    for (let iz = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++) {
        const idx = iz * res + ix;
        const localX = -CHUNK_WORLD_SIZE / 2 + ix * step;
        const localZ = -CHUNK_WORLD_SIZE / 2 + iz * step;
        const wx = this.worldX + localX;
        const wz = this.worldZ + localZ;
        const height = noiseGen.getHeight(wx, wz, config);

        positions[idx * 3]     = localX;
        positions[idx * 3 + 1] = height;
        positions[idx * 3 + 2] = localZ;
        heightArr[idx] = height;
        this.heightSamples[idx] = height;
      }
    }

    // ── 2. Skirt vertices ──
    const skirtSrc = new Uint32Array(skirtCount);
    let si = mainCount;

    const addSkirtEdge = (getMainIdx) => {
      for (let k = 0; k < res; k++) {
        const mi = getMainIdx(k);
        positions[si * 3]     = positions[mi * 3];
        positions[si * 3 + 1] = positions[mi * 3 + 1] - SKIRT_DROP;
        positions[si * 3 + 2] = positions[mi * 3 + 2];
        heightArr[si] = heightArr[mi] - SKIRT_DROP;
        skirtSrc[si - mainCount] = mi;
        si++;
      }
    };

    addSkirtEdge(ix => ix);
    addSkirtEdge(ix => (res - 1) * res + ix);
    addSkirtEdge(iz => iz * res);
    addSkirtEdge(iz => iz * res + (res - 1));

    // ── 3. Index buffer ──
    const mainTris  = 2 * (res - 1) * (res - 1);
    const skirtTris = 4 * 2 * (res - 1);
    const indices   = new Uint32Array((mainTris + skirtTris) * 3);
    let ii = 0;

    for (let iz = 0; iz < res - 1; iz++) {
      for (let ix = 0; ix < res - 1; ix++) {
        const a = iz * res + ix;
        const b = a + 1;
        const c = a + res;
        const d = c + 1;
        indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
        indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
      }
    }

    const topBase   = mainCount;
    const botBase   = mainCount + res;
    const leftBase  = mainCount + 2 * res;
    const rightBase = mainCount + 3 * res;

    for (let ix = 0; ix < res - 1; ix++) {
      const a = ix, b = ix + 1;
      const c = topBase + ix, d = topBase + ix + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
    for (let ix = 0; ix < res - 1; ix++) {
      const a = (res - 1) * res + ix, b = a + 1;
      const c = botBase + ix, d = botBase + ix + 1;
      indices[ii++] = a; indices[ii++] = b; indices[ii++] = c;
      indices[ii++] = c; indices[ii++] = b; indices[ii++] = d;
    }
    for (let iz = 0; iz < res - 1; iz++) {
      const a = iz * res, b = (iz + 1) * res;
      const c = leftBase + iz, d = leftBase + iz + 1;
      indices[ii++] = a; indices[ii++] = b; indices[ii++] = c;
      indices[ii++] = c; indices[ii++] = b; indices[ii++] = d;
    }
    for (let iz = 0; iz < res - 1; iz++) {
      const a = iz * res + (res - 1), b = (iz + 1) * res + (res - 1);
      const c = rightBase + iz, d = rightBase + iz + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }

    // ── 4. Slopes ──
    const slopeArr = new Float32Array(mainCount);
    for (let i = 0; i < mainCount; i++) {
      const wx = this.worldX + positions[i * 3];
      const wz = this.worldZ + positions[i * 3 + 2];
      const hL = noiseGen.getHeight(wx - step, wz, config);
      const hR = noiseGen.getHeight(wx + step, wz, config);
      const hU = noiseGen.getHeight(wx, wz - step, config);
      const hD = noiseGen.getHeight(wx, wz + step, config);
      const dx = (hR - hL) / (2 * step);
      const dz = (hD - hU) / (2 * step);
      slopeArr[i] = Math.min(Math.sqrt(dx * dx + dz * dz) / 40, 1);
    }

    // ── 5. Biome features + inference ──
    const featureBatch = [];
    for (let i = 0; i < mainCount; i++) {
      const wx = this.worldX + positions[i * 3];
      const wz = this.worldZ + positions[i * 3 + 2];
      const height = heightArr[i];
      const nh = height / 100;
      const moisture    = noiseGen.getMoisture(wx, wz, config.moistureScale);
      const temperature = noiseGen.getTemperature(wx, wz, height, config);
      featureBatch.push([nh, moisture, temperature, slopeArr[i], nh < 0 ? 0 : nh]);
    }

    const predictions = biomeNetwork.predict(featureBatch);

    // ── 5b. Low-res biome grid for minimap (16x16, 1 byte = dominant biome) ──
    this.biomeGrid = new Uint8Array(256);
    if (predictions) {
      for (let gz = 0; gz < 16; gz++) {
        for (let gx = 0; gx < 16; gx++) {
          const ix = Math.round(gx * (res - 1) / 15);
          const iz = Math.round(gz * (res - 1) / 15);
          const vi = iz * res + ix;
          const p = predictions[vi];
          let best = 0;
          for (let j = 1; j < 6; j++) { if (p[j] > p[best]) best = j; }
          this.biomeGrid[gz * 16 + gx] = best;
        }
      }
    }

    // ── 6. Vertex colours + biome weight attributes ──
    const colors   = new Float32Array(totalVerts * 3);
    const biomeW1  = new Float32Array(totalVerts * 3);
    const biomeW2  = new Float32Array(totalVerts * 3);

    for (let i = 0; i < mainCount; i++) {
      let r = 0, g = 0, b = 0;
      if (predictions) {
        const probs = predictions[i];
        biomeW1[i * 3]     = probs[0];
        biomeW1[i * 3 + 1] = probs[1];
        biomeW1[i * 3 + 2] = probs[2];
        biomeW2[i * 3]     = probs[3];
        biomeW2[i * 3 + 1] = probs[4];
        biomeW2[i * 3 + 2] = probs[5];

        for (let j = 0; j < probs.length; j++) {
          const bc = j === 0 && heightArr[i] / 100 > -0.12
            ? BIOME_COLORS_SHALLOW_OCEAN : BIOME_COLORS[j];
          r += probs[j] * bc[0];
          g += probs[j] * bc[1];
          b += probs[j] * bc[2];
        }
      } else {
        r = 0.3; g = 0.5; b = 0.3;
      }
      const hVar = 1.0 + (heightArr[i] / 100) * 0.08;
      colors[i * 3]     = Math.min(1, r * hVar);
      colors[i * 3 + 1] = Math.min(1, g * hVar);
      colors[i * 3 + 2] = Math.min(1, b * hVar);
    }

    // Copy to skirt
    for (let s = 0; s < skirtCount; s++) {
      const mi = skirtSrc[s];
      const ti = (mainCount + s) * 3;
      colors[ti]     = colors[mi * 3];
      colors[ti + 1] = colors[mi * 3 + 1];
      colors[ti + 2] = colors[mi * 3 + 2];
      biomeW1[ti]     = biomeW1[mi * 3];
      biomeW1[ti + 1] = biomeW1[mi * 3 + 1];
      biomeW1[ti + 2] = biomeW1[mi * 3 + 2];
      biomeW2[ti]     = biomeW2[mi * 3];
      biomeW2[ti + 1] = biomeW2[mi * 3 + 1];
      biomeW2[ti + 2] = biomeW2[mi * 3 + 2];
    }

    // ── 7. Assemble BufferGeometry ──
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',      new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color',         new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('biomeWeights1', new THREE.BufferAttribute(biomeW1, 3));
    geometry.setAttribute('biomeWeights2', new THREE.BufferAttribute(biomeW2, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const material = new THREE.ShaderMaterial({
      vertexShader:   terrainVertSrc,
      fragmentShader: terrainFragSrc,
      uniforms:       sharedUniforms,
      vertexColors:   true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.worldX, 0, this.worldZ);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.material.transparent = true;
    this.mesh.material.opacity = 0;
    this._fadeStartTime = performance.now();
  }

  updateFade() {
    const elapsed = (performance.now() - this._fadeStartTime) / 300;
    const opacity = Math.min(1, elapsed);
    this.mesh.material.opacity = opacity;
    this.mesh.material.transparent = opacity < 1;
    return opacity >= 1;
  }

  getHeightAt(localX, localZ) {
    if (!this.heightSamples) return 0;
    const res = this.resolution;
    const step = CHUNK_WORLD_SIZE / (res - 1);
    const ix = Math.round((localX + CHUNK_WORLD_SIZE / 2) / step);
    const iz = Math.round((localZ + CHUNK_WORLD_SIZE / 2) / step);
    const ci = Math.max(0, Math.min(res - 1, iz)) * res + Math.max(0, Math.min(res - 1, ix));
    return this.heightSamples[ci] || 0;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}

export { CHUNK_WORLD_SIZE };
