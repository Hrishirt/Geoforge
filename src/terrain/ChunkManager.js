import * as THREE from 'three';
import { ChunkMesh, CHUNK_WORLD_SIZE } from './ChunkMesh.js';

const LOAD_RADIUS = 5;
const UNLOAD_RADIUS = 8;
const MAX_CHUNKS_PER_FRAME = 2;

export class ChunkManager {
  constructor(scene, noiseGen, biomeNetwork, sharedUniforms) {
    this.scene = scene;
    this.noiseGen = noiseGen;
    this.biomeNetwork = biomeNetwork;
    this.sharedUniforms = sharedUniforms;
    this.chunks = new Map();
    this.fadingChunks = [];
    this.noiseConfig = null;
    this.totalVertices = 0;
    this.vegetation = null;
  }

  setVegetation(vegSystem) {
    this.vegetation = vegSystem;
  }

  setConfig(config) {
    this.noiseConfig = config;
  }

  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  _getResolution(dist) {
    if (dist <= 2) return 64;
    if (dist <= 4) return 32;
    return 16;
  }

  update(cameraPosition) {
    if (!this.noiseConfig) return;

    const camCX = Math.round(cameraPosition.x / CHUNK_WORLD_SIZE);
    const camCZ = Math.round(cameraPosition.z / CHUNK_WORLD_SIZE);

    // Unload distant chunks
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.chunkX - camCX;
      const dz = chunk.chunkZ - camCZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > UNLOAD_RADIUS) {
        this.scene.remove(chunk.mesh);
        this.totalVertices -= chunk.mesh.geometry.getAttribute('position').count;
        if (this.vegetation) this.vegetation.removeForChunk(chunk.chunkX, chunk.chunkZ);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }

    // Collect needed chunks sorted by distance
    const needed = [];
    for (let cx = camCX - LOAD_RADIUS; cx <= camCX + LOAD_RADIUS; cx++) {
      for (let cz = camCZ - LOAD_RADIUS; cz <= camCZ + LOAD_RADIUS; cz++) {
        const dx = cx - camCX;
        const dz = cz - camCZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= LOAD_RADIUS) {
          const key = this._key(cx, cz);
          if (!this.chunks.has(key)) {
            needed.push({ cx, cz, dist });
          }
        }
      }
    }

    needed.sort((a, b) => a.dist - b.dist);

    const toLoad = needed.slice(0, MAX_CHUNKS_PER_FRAME);
    for (const { cx, cz, dist } of toLoad) {
      const resolution = this._getResolution(dist);
      const chunk = new ChunkMesh(cx, cz, resolution, this.noiseGen, this.biomeNetwork, this.noiseConfig, this.sharedUniforms);
      this.scene.add(chunk.mesh);
      this.totalVertices += chunk.mesh.geometry.getAttribute('position').count;
      this.chunks.set(this._key(cx, cz), chunk);
      this.fadingChunks.push(chunk);

      if (this.vegetation) {
        this.vegetation.placeForChunk(cx, cz, this.noiseGen, this.biomeNetwork, this.noiseConfig);
      }
    }

    this.fadingChunks = this.fadingChunks.filter(chunk => !chunk.updateFade());
  }

  getHeightAtWorld(wx, wz) {
    const cx = Math.round(wx / CHUNK_WORLD_SIZE);
    const cz = Math.round(wz / CHUNK_WORLD_SIZE);
    const key = this._key(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return 0;
    const localX = wx - chunk.worldX;
    const localZ = wz - chunk.worldZ;
    return chunk.getHeightAt(localX, localZ);
  }

  getBiomeAtWorld(wx, wz) {
    if (!this.biomeNetwork || !this.biomeNetwork.ready || !this.noiseConfig) return null;
    const config = this.noiseConfig;
    const height = this.noiseGen.getHeight(wx, wz, config);
    const moisture = this.noiseGen.getMoisture(wx, wz, config.moistureScale);
    const temperature = this.noiseGen.getTemperature(wx, wz, height, config);

    const hL = this.noiseGen.getHeight(wx - 1, wz, config);
    const hR = this.noiseGen.getHeight(wx + 1, wz, config);
    const hU = this.noiseGen.getHeight(wx, wz - 1, config);
    const hD = this.noiseGen.getHeight(wx, wz + 1, config);
    const dx = (hR - hL) / 2;
    const dz = (hD - hU) / 2;
    const slope = Math.min(Math.sqrt(dx * dx + dz * dz) / 40, 1);
    const normalizedHeight = height / 100;
    const distWater = normalizedHeight < 0 ? 0 : normalizedHeight;

    return this.biomeNetwork.predictSingle([normalizedHeight, moisture, temperature, slope, distWater]);
  }

  getChunks() { return this.chunks; }

  getChunkAt(cx, cz) { return this.chunks.get(this._key(cx, cz)) || null; }

  getStats() {
    return {
      chunkCount: this.chunks.size,
      totalVertices: this.totalVertices,
    };
  }

  regenerate(seed, config) {
    for (const [, chunk] of this.chunks) {
      this.scene.remove(chunk.mesh);
      chunk.dispose();
    }
    this.chunks.clear();
    this.fadingChunks = [];
    this.totalVertices = 0;
    this.noiseGen.regenerate(seed);
    this.noiseConfig = config;
    if (this.vegetation) this.vegetation.clearAll();
  }
}
