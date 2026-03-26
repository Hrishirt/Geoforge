const BIOME_RGB = [
  [26, 58, 92],   // 0 ocean
  [194, 178, 128], // 1 beach
  [74, 124, 63],  // 2 plains
  [45, 90, 27],   // 3 forest
  [122, 122, 122], // 4 mountain
  [240, 240, 240], // 5 snow
];
const UNEXPLORED = [26, 26, 46];
const CHUNK_SIZE = 32;
const MAP_SIZE   = 180;
const SCALE      = 2;

const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Mountain', 'Snow'];

export class Minimap {
  constructor() {
    this.canvas = document.getElementById('minimap');
    this.ctx    = this.canvas.getContext('2d');
    this.labelEl = document.getElementById('minimap-biome');
    this._lastDraw = 0;
    this._imgData = this.ctx.createImageData(MAP_SIZE, MAP_SIZE);
  }

  update(playerPos, cameraYaw, chunkManager) {
    const now = performance.now();
    if (now - this._lastDraw < 500) return;
    this._lastDraw = now;

    const px = playerPos.x;
    const pz = playerPos.z;
    const halfWorld = (MAP_SIZE * SCALE) / 2;
    const data = this._imgData.data;
    let centerBiome = 2;

    for (let py = 0; py < MAP_SIZE; py++) {
      for (let ppx = 0; ppx < MAP_SIZE; ppx++) {
        const wx = px - halfWorld + ppx * SCALE;
        const wz = pz - halfWorld + py * SCALE;

        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const chunk = chunkManager.getChunkAt(cx, cz);

        const i = (py * MAP_SIZE + ppx) * 4;
        if (!chunk || !chunk.biomeGrid) {
          data[i]     = UNEXPLORED[0];
          data[i + 1] = UNEXPLORED[1];
          data[i + 2] = UNEXPLORED[2];
          data[i + 3] = 255;
          continue;
        }

        const localX = wx - cx * CHUNK_SIZE;
        const localZ = wz - cz * CHUNK_SIZE;
        const gx = Math.min(15, Math.max(0, Math.floor((localX / CHUNK_SIZE) * 16)));
        const gz = Math.min(15, Math.max(0, Math.floor((localZ / CHUNK_SIZE) * 16)));
        const biome = chunk.biomeGrid[gz * 16 + gx];
        const rgb = BIOME_RGB[biome] || UNEXPLORED;
        data[i]     = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;

        if (ppx === 90 && py === 90) centerBiome = biome;
      }
    }

    this.ctx.putImageData(this._imgData, 0, 0);

    // Player marker: white dot + direction triangle
    this.ctx.save();
    this.ctx.translate(90, 90);
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.rotate(-cameraYaw);
    this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -8);
    this.ctx.lineTo(-4, 0);
    this.ctx.lineTo(4, 0);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    // Circular clip
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-in';
    this.ctx.beginPath();
    this.ctx.arc(90, 90, 89, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    if (this.labelEl) {
      this.labelEl.textContent = BIOME_NAMES[centerBiome] || 'Unknown';
    }

    return centerBiome;
  }
}
