import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX_TREES  = 8000;
const MAX_BUSHES = 5000;
const TREE_CAP   = 6000;
const CHUNK_SIZE = 32;

function hash2d(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 918273645) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function setVertexColors(geo, r, g, b) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

export class VegetationSystem {
  constructor(scene) {
    this.scene = scene;
    this.chunkData = new Map();
    this.freeTreeSlots = [];
    this.freeBushSlots = [];
    this.nextTree = 0;
    this.nextBush = 0;

    this._buildTreeMesh();
    this._buildBushMesh();
  }

  _buildTreeMesh() {
    const trunk = new THREE.CylinderGeometry(0.1, 0.15, 1.2, 6);
    trunk.translate(0, 0.6, 0);
    setVertexColors(trunk, 0.35, 0.22, 0.1);

    const canopy = new THREE.ConeGeometry(0.8, 2.0, 6);
    canopy.translate(0, 2.5, 0);
    setVertexColors(canopy, 0.15, 0.42, 0.1);

    const geo = mergeGeometries([trunk, canopy]);
    trunk.dispose();
    canopy.dispose();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.treeMesh = new THREE.InstancedMesh(geo, mat, MAX_TREES);
    this.treeMesh.count = 0;
    this.treeMesh.castShadow = true;
    this.treeMesh.receiveShadow = true;
    this.scene.add(this.treeMesh);
  }

  _buildBushMesh() {
    const geo = new THREE.SphereGeometry(0.3, 5, 4);
    geo.translate(0, 0.15, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a4d1a, roughness: 0.9 });
    this.bushMesh = new THREE.InstancedMesh(geo, mat, MAX_BUSHES);
    this.bushMesh.count = 0;
    this.bushMesh.castShadow = true;
    this.bushMesh.receiveShadow = true;
    this.scene.add(this.bushMesh);
  }

  _allocTree() {
    if (this.freeTreeSlots.length > 0) return this.freeTreeSlots.pop();
    if (this.nextTree < MAX_TREES) return this.nextTree++;
    return -1;
  }

  _allocBush() {
    if (this.freeBushSlots.length > 0) return this.freeBushSlots.pop();
    if (this.nextBush < MAX_BUSHES) return this.nextBush++;
    return -1;
  }

  get visibleTrees() { return this.nextTree - this.freeTreeSlots.length; }
  get visibleBushes() { return this.nextBush - this.freeBushSlots.length; }

  placeForChunk(chunkX, chunkZ, noiseGen, biomeNet, config) {
    const key = `${chunkX},${chunkZ}`;
    if (this.chunkData.has(key)) return;
    if (!biomeNet || !biomeNet.ready) return;

    const wx0 = chunkX * CHUNK_SIZE - CHUNK_SIZE / 2;
    const wz0 = chunkZ * CHUNK_SIZE - CHUNK_SIZE / 2;
    const cellSize = CHUNK_SIZE / 6;
    const treeSlots = [];
    const bushSlots = [];
    const _q = new THREE.Quaternion();
    const _up = new THREE.Vector3(0, 1, 0);

    for (let gz = 0; gz < 6; gz++) {
      for (let gx = 0; gx < 6; gx++) {
        const ci = gz * 6 + gx;
        const wx = wx0 + gx * cellSize + hash2d(chunkX, chunkZ, ci * 2) * cellSize;
        const wz = wz0 + gz * cellSize + hash2d(chunkX, chunkZ, ci * 2 + 1) * cellSize;

        const height = noiseGen.getHeight(wx, wz, config);
        if (height <= 0) continue;

        const nh = height / 100;
        const moisture = noiseGen.getMoisture(wx, wz, config.moistureScale);
        const temperature = noiseGen.getTemperature(wx, wz, height, config);

        const hL = noiseGen.getHeight(wx - 1, wz, config);
        const hR = noiseGen.getHeight(wx + 1, wz, config);
        const hU = noiseGen.getHeight(wx, wz - 1, config);
        const hD = noiseGen.getHeight(wx, wz + 1, config);
        const slope = Math.min(Math.sqrt(((hR - hL) / 2) ** 2 + ((hD - hU) / 2) ** 2) / 40, 1);
        const dw = nh < 0 ? 0 : nh;

        const probs = biomeNet.predictSingle([nh, moisture, temperature, slope, dw]);
        if (!probs) continue;

        // Trees: forest > 0.5, gentle slope, under cap
        if (probs[3] > 0.5 && slope < 0.4 && this.visibleTrees < TREE_CAP) {
          const slot = this._allocTree();
          if (slot >= 0) {
            const rot = hash2d(chunkX, chunkZ, ci + 100) * Math.PI * 2;
            const s = 0.7 + hash2d(chunkX, chunkZ, ci + 200) * 0.7;
            const m = new THREE.Matrix4();
            _q.setFromAxisAngle(_up, rot);
            m.compose(new THREE.Vector3(wx, height, wz), _q, new THREE.Vector3(s, s, s));
            this.treeMesh.setMatrixAt(slot, m);
            treeSlots.push(slot);
          }
        }

        // Bushes: plains > 0.5, lower density (every other cell)
        if (probs[2] > 0.5 && slope < 0.4 && (gx + gz) % 2 === 0) {
          const slot = this._allocBush();
          if (slot >= 0) {
            const rot = hash2d(chunkX, chunkZ, ci + 300) * Math.PI * 2;
            const s = 0.6 + hash2d(chunkX, chunkZ, ci + 400) * 0.6;
            const m = new THREE.Matrix4();
            _q.setFromAxisAngle(_up, rot);
            m.compose(new THREE.Vector3(wx, height, wz), _q, new THREE.Vector3(s, s, s));
            this.bushMesh.setMatrixAt(slot, m);
            bushSlots.push(slot);
          }
        }
      }
    }

    this.chunkData.set(key, { treeSlots, bushSlots });
    this._sync();
  }

  removeForChunk(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    const data = this.chunkData.get(key);
    if (!data) return;

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const s of data.treeSlots) {
      this.treeMesh.setMatrixAt(s, zero);
      this.freeTreeSlots.push(s);
    }
    for (const s of data.bushSlots) {
      this.bushMesh.setMatrixAt(s, zero);
      this.freeBushSlots.push(s);
    }
    this.chunkData.delete(key);
    this._sync();
  }

  clearAll() {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.nextTree; i++) this.treeMesh.setMatrixAt(i, zero);
    for (let i = 0; i < this.nextBush; i++) this.bushMesh.setMatrixAt(i, zero);
    this.chunkData.clear();
    this.freeTreeSlots.length = 0;
    this.freeBushSlots.length = 0;
    this.nextTree = 0;
    this.nextBush = 0;
    this._sync();
  }

  _sync() {
    if (this.freeTreeSlots.length === this.nextTree) {
      this.nextTree = 0;
      this.freeTreeSlots.length = 0;
    }
    if (this.freeBushSlots.length === this.nextBush) {
      this.nextBush = 0;
      this.freeBushSlots.length = 0;
    }
    this.treeMesh.count = this.nextTree;
    this.treeMesh.instanceMatrix.needsUpdate = true;
    this.bushMesh.count = this.nextBush;
    this.bushMesh.instanceMatrix.needsUpdate = true;
  }

  getStats() {
    return { trees: this.visibleTrees, bushes: this.visibleBushes };
  }
}
