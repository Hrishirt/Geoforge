import { generateTrainingData, BIOME_NAMES } from './BiomeLabeler.js';

function randomMatrix(rows, cols, scale) {
  const m = new Float32Array(rows * cols);
  for (let i = 0; i < m.length; i++) {
    m[i] = (Math.random() * 2 - 1) * scale;
  }
  return m;
}

function zeros(n) {
  return new Float32Array(n);
}

function relu(x) {
  return x > 0 ? x : 0;
}

function reluDeriv(x) {
  return x > 0 ? 1 : 0;
}

function softmax(arr, start, len) {
  let max = -Infinity;
  for (let i = 0; i < len; i++) {
    if (arr[start + i] > max) max = arr[start + i];
  }
  let sum = 0;
  for (let i = 0; i < len; i++) {
    arr[start + i] = Math.exp(arr[start + i] - max);
    sum += arr[start + i];
  }
  for (let i = 0; i < len; i++) {
    arr[start + i] /= sum;
  }
}

class DenseLayer {
  constructor(inputSize, outputSize) {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    const scale = Math.sqrt(2 / inputSize);
    this.weights = randomMatrix(inputSize, outputSize, scale);
    this.biases = zeros(outputSize);
    this.dWeights = zeros(inputSize * outputSize);
    this.dBiases = zeros(outputSize);
  }

  forward(input, inputOffset, output, outputOffset) {
    for (let j = 0; j < this.outputSize; j++) {
      let sum = this.biases[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[inputOffset + i] * this.weights[i * this.outputSize + j];
      }
      output[outputOffset + j] = sum;
    }
  }

  accumulateGradients(input, inputOffset, outputGrad, outputGradOffset) {
    for (let j = 0; j < this.outputSize; j++) {
      this.dBiases[j] += outputGrad[outputGradOffset + j];
      for (let i = 0; i < this.inputSize; i++) {
        this.dWeights[i * this.outputSize + j] +=
          input[inputOffset + i] * outputGrad[outputGradOffset + j];
      }
    }
  }

  backpropInput(outputGrad, outputGradOffset, inputGrad, inputGradOffset) {
    for (let i = 0; i < this.inputSize; i++) {
      let sum = 0;
      for (let j = 0; j < this.outputSize; j++) {
        sum += this.weights[i * this.outputSize + j] * outputGrad[outputGradOffset + j];
      }
      inputGrad[inputGradOffset + i] = sum;
    }
  }

  applyGradients(lr, batchSize) {
    const scale = lr / batchSize;
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] -= this.dWeights[i] * scale;
      this.dWeights[i] = 0;
    }
    for (let i = 0; i < this.biases.length; i++) {
      this.biases[i] -= this.dBiases[i] * scale;
      this.dBiases[i] = 0;
    }
  }
}

export class BiomeNetwork {
  constructor() {
    this.ready = false;
    this.layer1 = new DenseLayer(5, 32);
    this.layer2 = new DenseLayer(32, 16);
    this.layer3 = new DenseLayer(16, BIOME_NAMES.length);
    this.numClasses = BIOME_NAMES.length;
  }

  _forward(input, offset) {
    const h1 = new Float32Array(32);
    const h1a = new Float32Array(32);
    const h2 = new Float32Array(16);
    const h2a = new Float32Array(16);
    const out = new Float32Array(this.numClasses);

    this.layer1.forward(input, offset, h1, 0);
    for (let i = 0; i < 32; i++) h1a[i] = relu(h1[i]);

    this.layer2.forward(h1a, 0, h2, 0);
    for (let i = 0; i < 16; i++) h2a[i] = relu(h2[i]);

    this.layer3.forward(h2a, 0, out, 0);
    softmax(out, 0, this.numClasses);

    return { h1, h1a, h2, h2a, out };
  }

  _trainStep(features, labels, lr) {
    const batchSize = features.length;
    let totalLoss = 0;

    for (let b = 0; b < batchSize; b++) {
      const input = features[b];
      const label = labels[b];
      const { h1, h1a, h2, h2a, out } = this._forward(input, 0);

      totalLoss -= Math.log(Math.max(out[label], 1e-7));

      // Output gradient (softmax + cross-entropy)
      const dOut = new Float32Array(this.numClasses);
      for (let i = 0; i < this.numClasses; i++) {
        dOut[i] = out[i] - (i === label ? 1 : 0);
      }

      // Layer 3 gradients
      this.layer3.accumulateGradients(h2a, 0, dOut, 0);
      const dH2a = new Float32Array(16);
      this.layer3.backpropInput(dOut, 0, dH2a, 0);

      // ReLU gradient for layer 2
      const dH2 = new Float32Array(16);
      for (let i = 0; i < 16; i++) dH2[i] = dH2a[i] * reluDeriv(h2[i]);

      // Layer 2 gradients
      this.layer2.accumulateGradients(h1a, 0, dH2, 0);
      const dH1a = new Float32Array(32);
      this.layer2.backpropInput(dH2, 0, dH1a, 0);

      // ReLU gradient for layer 1
      const dH1 = new Float32Array(32);
      for (let i = 0; i < 32; i++) dH1[i] = dH1a[i] * reluDeriv(h1[i]);

      // Layer 1 gradients
      this.layer1.accumulateGradients(input, 0, dH1, 0);
    }

    this.layer1.applyGradients(lr, batchSize);
    this.layer2.applyGradients(lr, batchSize);
    this.layer3.applyGradients(lr, batchSize);

    return totalLoss / batchSize;
  }

  async train(noiseGen, config, onProgress) {
    const { features, labels } = generateTrainingData(noiseGen, config, 2000);
    const numEpochs = 20;
    const batchSize = 64;
    const lr = 0.05;

    for (let epoch = 0; epoch < numEpochs; epoch++) {
      for (let i = features.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [features[i], features[j]] = [features[j], features[i]];
        [labels[i], labels[j]] = [labels[j], labels[i]];
      }

      for (let start = 0; start < features.length; start += batchSize) {
        const end = Math.min(start + batchSize, features.length);
        const batchFeatures = features.slice(start, end);
        const batchLabels = labels.slice(start, end);
        this._trainStep(batchFeatures, batchLabels, lr);
      }

      if (onProgress) onProgress((epoch + 1) / numEpochs);
      // Yield to UI every 5 epochs
      if (epoch % 5 === 4) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    this.ready = true;
  }

  predict(featureArray) {
    if (!this.ready) return null;
    const results = [];
    for (let i = 0; i < featureArray.length; i++) {
      const { out } = this._forward(featureArray[i], 0);
      results.push(Array.from(out));
    }
    return results;
  }

  predictSingle(features) {
    if (!this.ready) return null;
    const { out } = this._forward(features, 0);
    return Array.from(out);
  }
}
