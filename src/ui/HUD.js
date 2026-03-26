import { BIOME_NAMES } from '../biome/BiomeLabeler.js';

export class HUD {
  constructor() {
    this.biomeEl  = document.getElementById('hud-biome');
    this.fpsEl    = document.getElementById('stat-fps');
    this.chunksEl = document.getElementById('stat-chunks');
    this.vertsEl  = document.getElementById('stat-verts');
    this.treesEl  = document.getElementById('stat-trees');
    this.clockEl  = document.getElementById('hud-clock');

    this._frames = 0;
    this._lastFpsUpdate = performance.now();
    this._fps = 60;
  }

  update(biomeProbs, stats) {
    this._frames++;
    const now = performance.now();
    if (now - this._lastFpsUpdate > 500) {
      this._fps = Math.round(this._frames / ((now - this._lastFpsUpdate) / 1000));
      this._lastFpsUpdate = now;
      this._frames = 0;
    }

    this.fpsEl.textContent = `${this._fps} FPS`;
    this.chunksEl.textContent = `${stats.chunkCount} chunks`;
    this.vertsEl.textContent = `${(stats.totalVertices / 1000).toFixed(0)}k vertices`;
    if (this.treesEl) {
      this.treesEl.textContent = `${stats.trees || 0} trees · ${stats.bushes || 0} bushes`;
    }

    if (biomeProbs) {
      let maxIdx = 0;
      for (let i = 1; i < biomeProbs.length; i++) {
        if (biomeProbs[i] > biomeProbs[maxIdx]) maxIdx = i;
      }
      this.biomeEl.textContent = BIOME_NAMES[maxIdx];
    }
  }

  updateClock(hour) {
    if (!this.clockEl) return;
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    const hStr = String(h).padStart(2, '0');
    const mStr = String(m).padStart(2, '0');
    const icon = (hour >= 6 && hour < 19) ? '\u2600' : '\u263E';
    this.clockEl.textContent = `${hStr}:${mStr} ${icon}`;
  }
}
