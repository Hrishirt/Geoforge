// Biome indices: 0=ocean, 1=beach, 2=plains, 3=forest, 4=mountain, 5=snow

export const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Mountain', 'Snow'];

export const BIOME_COLORS = [
  [0.08, 0.18, 0.35],  // ocean deep
  [0.82, 0.75, 0.52],  // beach
  [0.35, 0.58, 0.28],  // plains
  [0.13, 0.32, 0.08],  // forest
  [0.52, 0.48, 0.44],  // mountain
  [0.92, 0.93, 0.96],  // snow
];

export const BIOME_COLORS_SHALLOW_OCEAN = [0.15, 0.38, 0.58];

export function labelBiome(height, moisture, temperature, slope) {
  const normalizedHeight = height / 100;

  if (normalizedHeight < -0.03) return 0;  // ocean
  if (normalizedHeight < 0.03 && normalizedHeight >= -0.03) return 1; // beach

  if (normalizedHeight > 0.45 && temperature < 0.4) return 5; // snow
  if (normalizedHeight > 0.3 || slope > 0.5) return 4; // mountain

  if (moisture > 0.5 && temperature > 0.3) return 3; // forest
  return 2; // plains
}

export function generateTrainingData(noiseGen, config, numSamples = 2000) {
  const features = [];
  const labels = [];

  const range = 5000;

  for (let i = 0; i < numSamples; i++) {
    const wx = (Math.random() - 0.5) * range;
    const wz = (Math.random() - 0.5) * range;

    const height = noiseGen.getHeight(wx, wz, config);
    const moisture = noiseGen.getMoisture(wx, wz, config.moistureScale);
    const temperature = noiseGen.getTemperature(wx, wz, height, config);

    const dx = noiseGen.getHeight(wx + 1, wz, config) - noiseGen.getHeight(wx - 1, wz, config);
    const dz = noiseGen.getHeight(wx, wz + 1, config) - noiseGen.getHeight(wx, wz - 1, config);
    const slope = Math.sqrt(dx * dx + dz * dz) / 2;
    const normalizedSlope = Math.min(slope / 40, 1);

    const normalizedHeight = height / 100;
    const distWater = normalizedHeight < 0 ? 0 : normalizedHeight;

    features.push([normalizedHeight, moisture, temperature, normalizedSlope, distWater]);
    labels.push(labelBiome(height, moisture, temperature, normalizedSlope));
  }

  return { features, labels };
}
