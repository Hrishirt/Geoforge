import { createNoise2D } from 'simplex-noise';

export class NoiseGenerator {
  constructor(seed = Math.random()) {
    this.seed = seed;
    this.heightNoise = createNoise2D(() => this._seededRandom(seed));
    this.moistureNoise = createNoise2D(() => this._seededRandom(seed * 2.731));
    this.temperatureNoise = createNoise2D(() => this._seededRandom(seed * 5.419));
    this._rngState = seed;
  }

  _seededRandom(seed) {
    this._rngState = seed || this._rngState;
    this._rngState = (this._rngState * 9301 + 49297) % 233280;
    return this._rngState / 233280;
  }

  getHeight(worldX, worldZ, config) {
    const { scale, octaves, persistence, lacunarity } = config;
    let amplitude = 1;
    let frequency = scale;
    let value = 0;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.heightNoise(worldX * frequency, worldZ * frequency);
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    value /= maxAmplitude;

    // Gentle redistribution — keep negative values for oceans
    const sign = Math.sign(value);
    value = sign * Math.pow(Math.abs(value), 1.1);

    return value * 100;
  }

  getMoisture(worldX, worldZ, scale) {
    let value = 0;
    let amp = 1;
    let freq = scale;
    let maxAmp = 0;
    for (let i = 0; i < 4; i++) {
      value += amp * this.moistureNoise(worldX * freq, worldZ * freq);
      maxAmp += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return (value / maxAmp + 1) * 0.5; // [0, 1]
  }

  getTemperature(worldX, worldZ, height, config) {
    const baseTemp = this.temperatureNoise(worldX * 0.001, worldZ * 0.001);
    const latitudeGrad = Math.cos(worldZ * 0.0003) * config.temperatureStrength;
    const heightCooling = Math.max(0, height / 100) * 0.6;
    return (baseTemp * 0.4 + latitudeGrad * 0.4 - heightCooling + 1) * 0.5; // [0, 1]
  }

  regenerate(seed) {
    this.seed = seed;
    this._rngState = seed;
    this.heightNoise = createNoise2D(() => this._seededRandom(seed));
    this.moistureNoise = createNoise2D(() => this._seededRandom(seed * 2.731));
    this.temperatureNoise = createNoise2D(() => this._seededRandom(seed * 5.419));
  }
}
