import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const WALK_SPEED   = 8;
const SPRINT_SPEED = 18;
const ACCEL_FACTOR = 0.15;
const GRAVITY      = -28;
const JUMP_IMPULSE = 10;
const EYE_HEIGHT   = 1.8;
const BOB_AMP      = 0.06;
const BOB_FREQ     = 8;
const STEP_WALK_INTERVAL   = 0.5;
const STEP_SPRINT_INTERVAL = 0.3;

const BIOME_SOUNDS = {
  0: { freq: 60,  decay: 0.1  }, // ocean
  1: { freq: 60,  decay: 0.1  }, // beach
  2: { freq: 80,  decay: 0.08 }, // plains
  3: { freq: 80,  decay: 0.08 }, // forest
  4: { freq: 200, decay: 0.05 }, // mountain
  5: { freq: 50,  decay: 0.12 }, // snow
};

const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _forward = new THREE.Vector3();
const _right   = new THREE.Vector3();
const _move    = new THREE.Vector3();

export class PlayerController {
  constructor(camera, renderer, scene) {
    this.camera = camera;
    this.scene  = scene;
    this.controls = new PointerLockControls(camera, renderer.domElement);

    this.velocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.onGround = false;
    this.groundY = 0;
    this.waterLevel = 0;
    this.bobPhase = 0;
    this.stepTimer = 0;
    this.currentBiome = 2;

    this.keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
    this._audioCtx = null;

    this._bindKeys();
    this._setupPointerLock(renderer);
  }

  get locked() { return this.controls.isLocked; }

  lock()   { this.controls.lock(); }
  unlock() { this.controls.unlock(); }

  _bindKeys() {
    const handle = (e, val) => {
      switch (e.code) {
        case 'KeyW':     this.keys.w = val; break;
        case 'KeyA':     this.keys.a = val; break;
        case 'KeyS':     this.keys.s = val; break;
        case 'KeyD':     this.keys.d = val; break;
        case 'ShiftLeft': case 'ShiftRight': this.keys.shift = val; break;
        case 'Space':    this.keys.space = val; break;
      }
    };
    window.addEventListener('keydown', e => handle(e, true));
    window.addEventListener('keyup',   e => handle(e, false));
  }

  _setupPointerLock(renderer) {
    document.getElementById('click-to-play')?.addEventListener('click', () => this.lock());
    document.getElementById('pause-overlay')?.addEventListener('click', () => this.lock());

    this.controls.addEventListener('lock', () => {
      document.body.classList.add('pointer-locked');
      document.getElementById('pause-overlay').style.display = 'none';
    });
    this.controls.addEventListener('unlock', () => {
      document.body.classList.remove('pointer-locked');
    });
  }

  setPosition(x, y, z) {
    this.camera.position.set(x, y, z);
    this.groundY = y - EYE_HEIGHT;
  }

  update(dt, terrainMeshes) {
    if (!this.controls.isLocked) return;
    dt = Math.min(dt, 0.05);

    const sprinting = this.keys.shift;
    const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

    this.camera.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();
    _right.crossVectors(_forward, this.camera.up).normalize();

    _move.set(0, 0, 0);
    if (this.keys.w) _move.add(_forward);
    if (this.keys.s) _move.sub(_forward);
    if (this.keys.a) _move.sub(_right);
    if (this.keys.d) _move.add(_right);
    if (_move.lengthSq() > 0) _move.normalize();

    this.targetVelocity.x = _move.x * speed;
    this.targetVelocity.z = _move.z * speed;

    this.velocity.x += (this.targetVelocity.x - this.velocity.x) * ACCEL_FACTOR;
    this.velocity.z += (this.targetVelocity.z - this.velocity.z) * ACCEL_FACTOR;

    // Gravity
    if (!this.onGround) {
      this.velocity.y += GRAVITY * dt;
    } else if (this.keys.space) {
      this.velocity.y = JUMP_IMPULSE;
      this.onGround = false;
    }

    this.camera.position.x += this.velocity.x * dt;
    this.camera.position.z += this.velocity.z * dt;
    this.camera.position.y += this.velocity.y * dt;

    // Terrain raycast
    const origin = this.camera.position.clone();
    origin.y += 5;
    _ray.set(origin, _down);
    _ray.far = 50;
    const hits = _ray.intersectObjects(terrainMeshes, false);
    if (hits.length > 0) {
      const hitY = hits[0].point.y;
      const targetY = hitY + EYE_HEIGHT;
      const minY = this.waterLevel + EYE_HEIGHT;

      if (this.camera.position.y <= targetY + 0.1) {
        this.camera.position.y += (Math.max(targetY, minY) - this.camera.position.y) * 0.3;
        this.velocity.y = Math.max(this.velocity.y, 0);
        this.onGround = true;
        this.groundY = hitY;
      } else {
        this.onGround = false;
      }
    } else {
      const minY = this.waterLevel + EYE_HEIGHT;
      if (this.camera.position.y < minY) {
        this.camera.position.y = minY;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }

    // Head bob
    const moving = Math.abs(this.velocity.x) > 0.5 || Math.abs(this.velocity.z) > 0.5;
    if (moving && this.onGround) {
      this.bobPhase += dt * BOB_FREQ;
      this.camera.position.y += Math.sin(this.bobPhase) * BOB_AMP;
    } else {
      this.bobPhase = 0;
    }

    // Footstep sounds
    if (moving && this.onGround) {
      const interval = sprinting ? STEP_SPRINT_INTERVAL : STEP_WALK_INTERVAL;
      this.stepTimer += dt;
      if (this.stepTimer >= interval) {
        this.stepTimer -= interval;
        this._playStep();
      }
    } else {
      this.stepTimer = 0;
    }
  }

  _playStep() {
    if (!this._audioCtx) {
      try { this._audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { return; }
    }
    const ctx = this._audioCtx;
    const biome = BIOME_SOUNDS[this.currentBiome] || BIOME_SOUNDS[2];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(biome.freq + (Math.random() - 0.5) * 20, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + biome.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + biome.decay);
  }
}
