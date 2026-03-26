import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

import { NoiseGenerator }    from './terrain/NoiseGenerator.js';
import { BiomeNetwork }      from './biome/BiomeNetwork.js';
import { ChunkManager }      from './terrain/ChunkManager.js';
import { SkySystem }         from './rendering/Sky.js';
import { WaterSystem }       from './rendering/Water.js';
import { VegetationSystem }  from './rendering/Vegetation.js';
import { PlayerController }  from './player/PlayerController.js';
import { Minimap }           from './ui/Minimap.js';
import { HUD }               from './ui/HUD.js';
import { ControlPanel }      from './ui/ControlPanel.js';
import { fnv1aHash, randomSeedString, seedFromURL, setSeedInURL } from './utils/SeededRNG.js';
import {
  exportHeightmap, exportBiomeMap, exportConfig,
  importConfig, takeScreenshot,
} from './export/Exporters.js';

// ─── Loading UI ───────────────────────────────────────────
const loadingOverlay = document.getElementById('loading-overlay');
const loadingBar     = document.getElementById('loading-bar');
const loadingStatus  = document.getElementById('loading-status');

function setLoading(progress, status) {
  loadingBar.style.width = `${progress * 100}%`;
  loadingStatus.textContent = status;
}

// ─── Texture helpers ──────────────────────────────────────
function createColorTex(r, g, b) {
  const data = new Uint8Array([r * 255, g * 255, b * 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createFlatNormal() {
  const data = new Uint8Array([128, 128, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── Globals ──────────────────────────────────────────────
let scene, camera, renderer, composer, bloomPass;
let skySystem, waterSystem, chunkManager, hud, controlPanel, vegetation;
let player, minimap;
let noiseGen, biomeNet;
let groundPlane;

const BASE_FOG_DENSITY = 0.003;
const CYCLE_DURATION = 600;

const clock = new THREE.Clock();
let needsRegeneration = false;
let cycleTime = 12;
let currentSeed = '';

const sharedUniforms = {
  sunDirection:  { value: new THREE.Vector3(0, 1, 0) },
  sunColor:      { value: new THREE.Color(1, 1, 1) },
  ambientColor:  { value: new THREE.Color(0.4, 0.45, 0.5) },
  fogColor:      { value: new THREE.Color(0.7, 0.8, 0.9) },
  fogDensity:    { value: BASE_FOG_DENSITY },
  grassTex:      { value: createColorTex(0.35, 0.58, 0.28) },
  rockTex:       { value: createColorTex(0.52, 0.48, 0.44) },
  sandTex:       { value: createColorTex(0.82, 0.75, 0.52) },
  grassNormal:   { value: createFlatNormal() },
  rockNormal:    { value: createFlatNormal() },
  useTextures:   { value: 0.0 },
};

// ─── Texture loading ──────────────────────────────────────
function loadBiomeTextures() {
  const loader = new THREE.TextureLoader();
  const base = 'https://threejs.org/examples/textures/';

  function load(path, srgb = true) {
    return new Promise(resolve => {
      loader.load(
        base + path,
        tex => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
          resolve(tex);
        },
        undefined,
        () => resolve(null),
      );
    });
  }

  return Promise.all([
    load('terrain/grasslight-big.jpg'),
    load('terrain/backgrounddetailed6.jpg'),
    load('waternormals.jpg'),
    load('terrain/grasslight-big-nm.jpg', false),
  ]);
}

// ─── Seed handling ────────────────────────────────────────
function getSeedHash(seedStr) {
  return fnv1aHash(seedStr);
}

function regenerateWorld(seedStr) {
  currentSeed = seedStr;
  const numericSeed = getSeedHash(seedStr);
  setSeedInURL(seedStr);
  controlPanel.setSeed(seedStr);
  controlPanel.updateShareURL(seedStr);

  const config = controlPanel.getConfig();
  noiseGen.regenerate(numericSeed);
  biomeNet.train(noiseGen, config, null).then(() => {
    chunkManager.regenerate(numericSeed, config);
  });
}

// ─── Init ─────────────────────────────────────────────────
async function init() {
  setLoading(0.05, 'Setting up renderer…');

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  document.body.appendChild(renderer.domElement);

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 20000);
  camera.position.set(0, 30, 0);

  scene.fog = new THREE.FogExp2(0xaabbcc, BASE_FOG_DENSITY);

  // ── Post-processing ──
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.12, 0.3, 0.8,
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  setLoading(0.08, 'Creating sky & water…');
  skySystem   = new SkySystem(scene, renderer);
  waterSystem = new WaterSystem(scene);

  // ── Ground plane ──
  const groundGeo = new THREE.PlaneGeometry(5000, 5000);
  groundGeo.rotateX(-Math.PI / 2);
  groundPlane = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    color: 0x0e2d47, roughness: 0.9, metalness: 0,
  }));
  groundPlane.position.y = -2;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  // ── Textures (background) ──
  const texPromise = loadBiomeTextures();

  // ── Seed ──
  currentSeed = seedFromURL() || randomSeedString();
  const numericSeed = getSeedHash(currentSeed);

  setLoading(0.12, 'Generating noise fields…');
  noiseGen = new NoiseGenerator(numericSeed);

  setLoading(0.15, 'Training biome neural network…');
  biomeNet = new BiomeNetwork();

  const defaultConfig = {
    scale: 0.003,
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
    moistureScale: 0.002,
    temperatureStrength: 1.0,
  };

  try {
    await biomeNet.train(noiseGen, defaultConfig, p => {
      setLoading(0.15 + p * 0.6, `Training biome network… ${Math.round(p * 100)}%`);
    });
  } catch (err) {
    console.error('Training failed:', err);
  }

  // ── Textures ──
  setLoading(0.78, 'Loading textures…');
  const [grassTex, rockTex, sandTex, grassNorm] = await texPromise;
  if (grassTex) sharedUniforms.grassTex.value = grassTex;
  if (rockTex)  sharedUniforms.rockTex.value  = rockTex;
  if (sandTex)  sharedUniforms.sandTex.value  = sandTex;
  if (grassNorm) sharedUniforms.grassNormal.value = grassNorm;
  if (rockTex) sharedUniforms.rockNormal.value = rockTex;
  if (grassTex && rockTex && sandTex) sharedUniforms.useTextures.value = 1.0;

  setLoading(0.82, 'Building initial terrain…');

  vegetation = new VegetationSystem(scene);

  chunkManager = new ChunkManager(scene, noiseGen, biomeNet, sharedUniforms);
  chunkManager.setVegetation(vegetation);
  chunkManager.setConfig(defaultConfig);

  for (let i = 0; i < 15; i++) {
    chunkManager.update(camera.position);
  }

  setLoading(0.92, 'Setting up player & UI…');

  player = new PlayerController(camera, renderer, scene);
  player.setPosition(0, 30, 0);

  minimap = new Minimap();
  hud = new HUD();

  controlPanel = new ControlPanel((key, value) => {
    if (key === 'regenerate') {
      regenerateWorld(String(value));
      return;
    }
    if (key === 'timeOfDay') {
      cycleTime = parseFloat(value);
      skySystem.setTimeOfDay(cycleTime);
      return;
    }
    if (key === 'fog') {
      const d = parseFloat(value);
      sharedUniforms.fogDensity.value = d;
      scene.fog.density = d;
      return;
    }
    if (key === 'exportHeightmap') {
      const config = controlPanel.getConfig();
      exportHeightmap(noiseGen, config, camera.position, currentSeed, msg => controlPanel.setExportStatus(msg));
      return;
    }
    if (key === 'exportBiomeMap') {
      const config = controlPanel.getConfig();
      exportBiomeMap(noiseGen, biomeNet, config, camera.position, currentSeed, msg => controlPanel.setExportStatus(msg));
      return;
    }
    if (key === 'exportConfig') {
      const config = controlPanel.getConfig();
      const fogVal = parseFloat(sharedUniforms.fogDensity.value);
      exportConfig(currentSeed, config, fogVal, cycleTime);
      return;
    }
    if (key === 'importConfig') {
      handleImportConfig(value);
      return;
    }
    if (key === 'screenshot') {
      takeScreenshot(renderer, currentSeed, cycleTime);
      return;
    }
    // Slider change → regen
    const config = controlPanel.getConfig();
    chunkManager.setConfig(config);
    needsRegeneration = true;
  });

  controlPanel.setSeed(currentSeed);
  setSeedInURL(currentSeed);

  setupInput();

  setLoading(1, 'Ready!');
  await new Promise(r => setTimeout(r, 300));
  loadingOverlay.classList.add('hidden');
  setTimeout(() => { loadingOverlay.style.display = 'none'; }, 700);

  animate();
}

// ─── Import config handler ────────────────────────────────
async function handleImportConfig(file) {
  try {
    const data = await importConfig(file);
    if (data.seed) {
      currentSeed = data.seed;
      controlPanel.setSeed(data.seed);
    }
    const config = {};
    if (data.noise) {
      if (data.noise.scale != null) config.scale = data.noise.scale;
      if (data.noise.octaves != null) config.octaves = data.noise.octaves;
      if (data.noise.persistence != null) config.persistence = data.noise.persistence;
      if (data.noise.lacunarity != null) config.lacunarity = data.noise.lacunarity;
    }
    if (data.biome) {
      if (data.biome.moisture_scale != null) config.moistureScale = data.biome.moisture_scale;
      if (data.biome.temperature_strength != null) config.temperatureStrength = data.biome.temperature_strength;
    }
    controlPanel.setConfig(config);

    if (data.environment) {
      if (data.environment.fog_density != null) {
        const fd = data.environment.fog_density;
        sharedUniforms.fogDensity.value = fd;
        scene.fog.density = fd;
        controlPanel.setFogDensity(fd);
      }
      if (data.environment.time_of_day) {
        const parts = data.environment.time_of_day.split(':');
        const tod = parseInt(parts[0]) + parseInt(parts[1]) / 60;
        cycleTime = tod;
        skySystem.setTimeOfDay(tod);
      }
    }

    regenerateWorld(currentSeed);
  } catch (e) {
    console.error('Import failed:', e);
  }
}

// ─── Input ────────────────────────────────────────────────
function setupInput() {
  const pauseEl = document.getElementById('pause-overlay');

  window.addEventListener('keydown', e => {
    if (e.code === 'Tab') {
      e.preventDefault();
      controlPanel.toggle();
    }
    if (e.code === 'Escape') {
      if (player.locked) {
        player.unlock();
        pauseEl.style.display = 'flex';
      }
    }
    if (e.code === 'F2') {
      e.preventDefault();
      takeScreenshot(renderer, currentSeed, cycleTime);
    }
  });

  player.controls.addEventListener('lock', () => {
    pauseEl.style.display = 'none';
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ─── Animation Loop ───────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const dt      = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  if (needsRegeneration) {
    needsRegeneration = false;
    regenerateWorld(currentSeed);
  }

  // Day/night cycle
  const hoursPerSec = 24 / CYCLE_DURATION;
  cycleTime = (cycleTime + dt * hoursPerSec) % 24;
  skySystem.setTimeOfDay(cycleTime);
  controlPanel.setTimeOfDay(cycleTime);

  // Terrain meshes for raycast
  const terrainMeshes = [];
  for (const [, chunk] of chunkManager.getChunks()) {
    if (chunk.mesh) terrainMeshes.push(chunk.mesh);
  }

  player.update(dt, terrainMeshes);

  groundPlane.position.x = camera.position.x;
  groundPlane.position.z = camera.position.z;

  chunkManager.update(camera.position);
  skySystem.update(camera.position);

  const sunDir   = skySystem.getSunDirection();
  const sunColor = skySystem.getSunColor();
  const fogColor = skySystem.getFogColor();
  const timeData = skySystem.getTimeData();

  sharedUniforms.sunDirection.value.copy(sunDir);
  sharedUniforms.sunColor.value.copy(sunColor);
  sharedUniforms.ambientColor.value.copy(skySystem.ambientLight.color);
  sharedUniforms.fogColor.value.copy(fogColor);

  const effectiveFogDensity = skySystem.getFogDensity(parseFloat(sharedUniforms.fogDensity.value) || BASE_FOG_DENSITY);
  scene.fog.density = effectiveFogDensity;
  scene.fog.color.copy(fogColor);

  bloomPass.threshold = timeData.isNight ? 0.6 : 0.8;

  waterSystem.setTimeColors(timeData.elevation);
  waterSystem.update(elapsed, sunDir, sunColor, fogColor, camera.position);

  const biomeProbs = chunkManager.getBiomeAtWorld(camera.position.x, camera.position.z);
  if (biomeProbs) {
    let maxIdx = 0;
    for (let i = 1; i < biomeProbs.length; i++) {
      if (biomeProbs[i] > biomeProbs[maxIdx]) maxIdx = i;
    }
    player.currentBiome = maxIdx;
  }

  const yaw = Math.atan2(
    -(camera.matrixWorld.elements[8]),
    -(camera.matrixWorld.elements[10]),
  );
  minimap.update(camera.position, yaw, chunkManager);

  const vegStats = vegetation.getStats();
  hud.update(biomeProbs, { ...chunkManager.getStats(), ...vegStats });
  hud.updateClock(cycleTime);

  composer.render();
}

init().catch(console.error);
