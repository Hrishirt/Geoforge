const BIOME_COLORS_EXPORT = [
  [0x1a, 0x3a, 0x5c], // ocean
  [0xc2, 0xb2, 0x80], // beach
  [0x4a, 0x7c, 0x3f], // plains
  [0x2d, 0x5a, 0x1b], // forest
  [0x7a, 0x7a, 0x7a], // mountain
  [0xf0, 0xf0, 0xf0], // snow
];
const BIOME_NAMES_EXPORT = ['Ocean', 'Beach', 'Plains', 'Forest', 'Mountain', 'Snow'];

function download(dataURL, filename) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function exportHeightmap(noiseGen, config, playerPos, seed, statusCb) {
  const size = 1024;
  const worldSpan = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  if (statusCb) statusCb('Generating heightmap...');

  let minH = Infinity, maxH = -Infinity;
  const heights = new Float32Array(size * size);

  const ox = playerPos.x - worldSpan / 2;
  const oz = playerPos.z - worldSpan / 2;
  const step = worldSpan / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = ox + x * step;
      const wz = oz + y * step;
      const h = noiseGen.getHeight(wx, wz, config);
      heights[y * size + x] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
    if (y % 128 === 0) await new Promise(r => setTimeout(r, 0));
  }

  const range = maxH - minH || 1;
  const waterLevel = 0;
  const waterVal = Math.round(((waterLevel - minH) / range) * 255);
  const flatWater = Math.max(0, Math.min(255, waterVal < 30 ? 30 : waterVal));

  for (let i = 0; i < size * size; i++) {
    const h = heights[i];
    let val;
    if (h <= waterLevel) {
      val = flatWater;
    } else {
      val = Math.round(((h - minH) / range) * 255);
    }
    const pi = i * 4;
    img.data[pi] = img.data[pi + 1] = img.data[pi + 2] = val;
    img.data[pi + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  download(canvas.toDataURL('image/png'), `heightmap_${seed}.png`);
  if (statusCb) statusCb(null);
}

export async function exportBiomeMap(noiseGen, biomeNet, config, playerPos, seed, statusCb) {
  const size = 1024;
  const worldSpan = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  if (statusCb) statusCb('Generating biome map...');

  const ox = playerPos.x - worldSpan / 2;
  const oz = playerPos.z - worldSpan / 2;
  const step = worldSpan / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = ox + x * step;
      const wz = oz + y * step;
      const h = noiseGen.getHeight(wx, wz, config);
      const moisture = noiseGen.getMoisture(wx, wz, config.moistureScale);
      const temp = noiseGen.getTemperature(wx, wz, h, config);
      const nh = h / 100;
      const dw = nh < 0 ? 0 : nh;

      const hL = noiseGen.getHeight(wx - 1, wz, config);
      const hR = noiseGen.getHeight(wx + 1, wz, config);
      const hU = noiseGen.getHeight(wx, wz - 1, config);
      const hD = noiseGen.getHeight(wx, wz + 1, config);
      const ddx = (hR - hL) / 2;
      const ddz = (hD - hU) / 2;
      const slope = Math.min(Math.sqrt(ddx * ddx + ddz * ddz) / 40, 1);

      const probs = biomeNet.predictSingle([nh, moisture, temp, slope, dw]);
      let best = 0;
      if (probs) {
        for (let j = 1; j < probs.length; j++) { if (probs[j] > probs[best]) best = j; }
      }

      const rgb = BIOME_COLORS_EXPORT[best];
      const pi = (y * size + x) * 4;
      img.data[pi]     = rgb[0];
      img.data[pi + 1] = rgb[1];
      img.data[pi + 2] = rgb[2];
      img.data[pi + 3] = 255;
    }
    if (y % 64 === 0) await new Promise(r => setTimeout(r, 0));
  }

  ctx.putImageData(img, 0, 0);

  // Draw legend
  const legendX = size - 140;
  let legendY = size - 20 - BIOME_NAMES_EXPORT.length * 22;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(legendX - 10, legendY - 8, 150, BIOME_NAMES_EXPORT.length * 22 + 16);
  ctx.font = '13px monospace';
  for (let i = 0; i < BIOME_NAMES_EXPORT.length; i++) {
    const [r, g, b] = BIOME_COLORS_EXPORT[i];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(legendX, legendY, 14, 14);
    ctx.fillStyle = '#fff';
    ctx.fillText(BIOME_NAMES_EXPORT[i], legendX + 20, legendY + 12);
    legendY += 22;
  }

  download(canvas.toDataURL('image/png'), `biomemap_${seed}.png`);
  if (statusCb) statusCb(null);
}

export function exportConfig(seed, config, fogDensity, timeOfDay) {
  const h = Math.floor(timeOfDay);
  const m = Math.round((timeOfDay % 1) * 60);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const data = {
    seed,
    generated_at: new Date().toISOString(),
    noise: {
      scale: config.scale,
      octaves: config.octaves,
      persistence: config.persistence,
      lacunarity: config.lacunarity,
    },
    biome: {
      moisture_scale: config.moistureScale,
      temperature_strength: config.temperatureStrength,
    },
    environment: {
      fog_density: fogDensity,
      time_of_day: timeStr,
    },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `worldconfig_${seed}.json`);
  URL.revokeObjectURL(url);
}

export function importConfig(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function takeScreenshot(renderer, seed, timeOfDay) {
  const uiElements = document.querySelectorAll(
    '#hud-biome, #hud-stats, #control-panel, #minimap-wrap, #crosshair, #tab-hint, #click-to-play, #pause-overlay'
  );
  uiElements.forEach(el => el.style.visibility = 'hidden');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const dataURL = renderer.domElement.toDataURL('image/png');
      const h = Math.floor(timeOfDay);
      const m = Math.round((timeOfDay % 1) * 60);
      const timeStr = `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
      download(dataURL, `screenshot_${seed}_${timeStr}.png`);
      uiElements.forEach(el => el.style.visibility = '');
    });
  });
}
