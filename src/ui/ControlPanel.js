export class ControlPanel {
  constructor(onChange) {
    this.onChange = onChange;
    this.panel = document.getElementById('control-panel');
    this._visible = true;

    this.sliders = {
      noiseScale: this._bind('slider-noise-scale', 'val-noise-scale', v => parseFloat(v).toFixed(4)),
      octaves: this._bind('slider-octaves', 'val-octaves', v => parseInt(v)),
      persistence: this._bind('slider-persistence', 'val-persistence', v => parseFloat(v).toFixed(2)),
      lacunarity: this._bind('slider-lacunarity', 'val-lacunarity', v => parseFloat(v).toFixed(1)),
      moistureScale: this._bind('slider-moisture', 'val-moisture', v => parseFloat(v).toFixed(4)),
      temperatureStrength: this._bind('slider-temperature', 'val-temperature', v => parseFloat(v).toFixed(1)),
      timeOfDay: this._bind('slider-time', 'val-time', v => {
        const h = Math.floor(v);
        const m = Math.round((v - h) * 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      }),
      fog: this._bind('slider-fog', 'val-fog', v => parseFloat(v).toFixed(3)),
    };

    this.seedInput = document.getElementById('seed-input');
    this.shareUrlEl = document.getElementById('share-url');

    document.getElementById('btn-regenerate').addEventListener('click', () => {
      this.onChange('regenerate', this.getSeed());
    });

    // Copy seed
    document.getElementById('btn-copy-seed').addEventListener('click', () => {
      navigator.clipboard.writeText(this.getSeed());
      this._flash('copy-tooltip');
    });

    // Share link
    document.getElementById('btn-share').addEventListener('click', () => {
      navigator.clipboard.writeText(this.shareUrlEl.value);
      this._flash('share-tooltip');
    });

    // Import config
    const fileInput = document.getElementById('import-file');
    document.getElementById('btn-import-config').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        this.onChange('importConfig', fileInput.files[0]);
        fileInput.value = '';
      }
    });

    // Export buttons
    document.getElementById('btn-export-height').addEventListener('click', () => this.onChange('exportHeightmap', null));
    document.getElementById('btn-export-biome').addEventListener('click', () => this.onChange('exportBiomeMap', null));
    document.getElementById('btn-export-config').addEventListener('click', () => this.onChange('exportConfig', null));
    document.getElementById('btn-screenshot').addEventListener('click', () => this.onChange('screenshot', null));
  }

  _flash(tooltipId) {
    const el = document.getElementById(tooltipId);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
  }

  toggle() {
    this._visible = !this._visible;
    this.panel.classList.toggle('hidden', !this._visible);
  }

  show() { this._visible = true;  this.panel.classList.remove('hidden'); }
  hide() { this._visible = false; this.panel.classList.add('hidden'); }
  get visible() { return this._visible; }

  getSeed() {
    return this.seedInput.value.trim() || 'default';
  }

  setSeed(seed) {
    this.seedInput.value = seed;
    this.updateShareURL(seed);
  }

  updateShareURL(seed) {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', seed);
    if (this.shareUrlEl) this.shareUrlEl.value = url.toString();
  }

  setExportStatus(msg) {
    const el = document.getElementById('export-status');
    if (el) el.textContent = msg || '';
  }

  _bind(sliderId, valueId, format) {
    const slider = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);
    const key = sliderId.replace('slider-', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      valueEl.textContent = format(val);
      this.onChange(key, val);
    });

    return slider;
  }

  getConfig() {
    return {
      scale: parseFloat(this.sliders.noiseScale.value),
      octaves: parseInt(this.sliders.octaves.value),
      persistence: parseFloat(this.sliders.persistence.value),
      lacunarity: parseFloat(this.sliders.lacunarity.value),
      moistureScale: parseFloat(this.sliders.moistureScale.value),
      temperatureStrength: parseFloat(this.sliders.temperatureStrength.value),
    };
  }

  setConfig(config) {
    const setSlider = (slider, val, format, valId) => {
      slider.value = val;
      const el = document.getElementById(valId);
      if (el) el.textContent = format(val);
    };
    if (config.scale != null)
      setSlider(this.sliders.noiseScale, config.scale, v => parseFloat(v).toFixed(4), 'val-noise-scale');
    if (config.octaves != null)
      setSlider(this.sliders.octaves, config.octaves, v => parseInt(v), 'val-octaves');
    if (config.persistence != null)
      setSlider(this.sliders.persistence, config.persistence, v => parseFloat(v).toFixed(2), 'val-persistence');
    if (config.lacunarity != null)
      setSlider(this.sliders.lacunarity, config.lacunarity, v => parseFloat(v).toFixed(1), 'val-lacunarity');
    if (config.moistureScale != null)
      setSlider(this.sliders.moistureScale, config.moistureScale, v => parseFloat(v).toFixed(4), 'val-moisture');
    if (config.temperatureStrength != null)
      setSlider(this.sliders.temperatureStrength, config.temperatureStrength, v => parseFloat(v).toFixed(1), 'val-temperature');
  }

  getTimeOfDay() {
    return parseFloat(this.sliders.timeOfDay.value);
  }

  setTimeOfDay(val) {
    const slider = this.sliders.timeOfDay;
    slider.value = val;
    const h = Math.floor(val);
    const m = Math.round((val % 1) * 60);
    const valEl = document.getElementById('val-time');
    if (valEl) valEl.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  setFogDensity(val) {
    this.sliders.fog.value = val;
    const el = document.getElementById('val-fog');
    if (el) el.textContent = parseFloat(val).toFixed(3);
  }
}
