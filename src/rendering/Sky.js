import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

const NIGHT_AMB   = new THREE.Color(0x0a0a1a);
const DAWN_AMB    = new THREE.Color(0xff7040);
const MIDDAY_AMB  = new THREE.Color(0xb0c4de);
const DUSK_AMB    = new THREE.Color(0xff5020);

function lerpColor3(out, a, b, c, t) {
  if (t < 0.5) { out.copy(a).lerp(b, t * 2); }
  else          { out.copy(b).lerp(c, (t - 0.5) * 2); }
}

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    scene.add(this.sky);

    this.sun = new THREE.Vector3();

    // Sun light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    const ss = 200;
    this.sunLight.shadow.camera.left = -ss;
    this.sunLight.shadow.camera.right = ss;
    this.sunLight.shadow.camera.top = ss;
    this.sunLight.shadow.camera.bottom = -ss;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Moon light (opposite sun)
    this.moonLight = new THREE.DirectionalLight(0x3344aa, 0.0);
    scene.add(this.moonLight);

    // Ambient
    this.ambientLight = new THREE.AmbientLight(0xb0c4de, 0.4);
    scene.add(this.ambientLight);

    this.starField = this._createStars();
    scene.add(this.starField);

    this.hour = 12;
    this.elevation = 0;
    this.setTimeOfDay(12);
  }

  _createStars() {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 800;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: true, transparent: true });
    return new THREE.Points(geo, mat);
  }

  setTimeOfDay(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this.elevation = Math.sin((this.hour / 24) * Math.PI * 2 - Math.PI / 2);
    const azimuth  = (this.hour / 24) * Math.PI * 2;
    const phi   = Math.PI / 2 - this.elevation * Math.PI / 2;
    const theta = azimuth;
    this.sun.setFromSphericalCoords(1, phi, theta);

    const el = this.elevation;
    const sunUp = el > 0;
    const sunI = sunUp ? Math.max(0, el) : 0;

    // Sky shader
    const skyU = this.sky.material.uniforms;
    skyU['sunPosition'].value.copy(this.sun);
    skyU['turbidity'].value      = THREE.MathUtils.lerp(2, 10, Math.max(0, el));
    skyU['rayleigh'].value       = THREE.MathUtils.lerp(0.5, 2, Math.max(0, el));
    skyU['mieCoefficient'].value = THREE.MathUtils.lerp(0.001, 0.005, Math.max(0, el));
    skyU['mieDirectionalG'].value = 0.8;
    this.sky.visible = el > -0.15;

    // Sun light
    this.sunLight.position.copy(this.sun).multiplyScalar(300);
    const sunIntLerp = sunUp
      ? THREE.MathUtils.lerp(0.3, 1.4, Math.min(1, el * 2))
      : 0;
    this.sunLight.intensity = sunIntLerp;
    const warmth = Math.max(0, 1 - Math.abs(el) * 0.5);
    _c1.setHSL(0.08 * warmth, 0.3 + warmth * 0.5, 0.5 + sunI * 0.35);
    this.sunLight.color.copy(_c1);

    // Moon light (opposite sun)
    this.moonLight.position.copy(this.sun).negate().multiplyScalar(300);
    this.moonLight.intensity = sunUp ? 0 : THREE.MathUtils.lerp(0, 0.15, Math.min(1, -el * 3));

    // Ambient — 4-point lerp based on hour (0-24)
    // 0=midnight, 6=dawn, 12=midday, 18=dusk
    const h = this.hour;
    if (h < 5 || h >= 21)       { this.ambientLight.color.copy(NIGHT_AMB); }
    else if (h < 8)             { const t = (h - 5) / 3; lerpColor3(this.ambientLight.color, NIGHT_AMB, DAWN_AMB, MIDDAY_AMB, t); }
    else if (h < 16)            { this.ambientLight.color.copy(MIDDAY_AMB); }
    else if (h < 19)            { const t = (h - 16) / 3; lerpColor3(this.ambientLight.color, MIDDAY_AMB, DUSK_AMB, NIGHT_AMB, t); }
    else                        { const t = (h - 19) / 2; _c1.copy(NIGHT_AMB); this.ambientLight.color.copy(DUSK_AMB).lerp(_c1, Math.min(1, t)); }
    this.ambientLight.intensity = 0.1 + sunI * 0.3;

    // Stars
    this.starField.visible = el < 0.1;
    this.starField.material.opacity = Math.max(0, Math.min(1, (0.1 - el) / 0.25));

    this._elevation = el;
    this._sunIntensity = sunI;
  }

  getSunDirection() { return this.sun.clone().normalize(); }
  getSunColor()     { return this.sunLight.color.clone(); }

  getFogColor() {
    const el = this._elevation;
    const sunUp = el > 0;
    if (sunUp) {
      const t = Math.min(1, el * 2);
      _c1.setHSL(0.58, 0.2 + t * 0.15, 0.4 + t * 0.2);
      // Warm tint at dawn/dusk
      if (el < 0.25) { _c2.set(0xff9060); _c1.lerp(_c2, (0.25 - el) / 0.25 * 0.3); }
      return _c1.clone();
    } else {
      const t = Math.min(1, -el * 3);
      return new THREE.Color().setHSL(0.62, 0.1, 0.12 - t * 0.06);
    }
  }

  getFogDensity(baseDensity) {
    const nightMul = this._elevation < 0 ? 1.5 : 1.0;
    return baseDensity * nightMul;
  }

  getTimeData() {
    return {
      hour: this.hour,
      elevation: this._elevation,
      sunIntensity: this._sunIntensity,
      isNight: this._elevation < -0.05,
    };
  }

  update(cameraPosition) {
    this.sunLight.target.position.copy(cameraPosition);
    this.sunLight.position.copy(this.sun).multiplyScalar(300).add(cameraPosition);
    this.moonLight.position.copy(this.sun).negate().multiplyScalar(300).add(cameraPosition);
    this.starField.position.copy(cameraPosition);
  }
}
