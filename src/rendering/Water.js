import * as THREE from 'three';

export class WaterSystem {
  constructor(scene) {
    this.scene = scene;

    const size = 5000;
    const segs = 128;
    this.geometry = new THREE.PlaneGeometry(size, size, segs, segs);
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshStandardMaterial({
      color: 0x1a6fa8,
      opacity: 0.75,
      transparent: true,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.y = 0;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    // Cache rest-state Y for every vertex so wave offsets are additive
    const posAttr = this.geometry.getAttribute('position');
    this._baseY = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      this._baseY[i] = posAttr.getY(i);
    }
  }

  setTimeColors(elevation) {
    const DAY   = new THREE.Color(0x1a6fa8);
    const DUSK  = new THREE.Color(0x8B3A3A);
    const NIGHT = new THREE.Color(0x0a0a2a);

    const el = elevation;
    if (el > 0.2)       { this.material.color.copy(DAY); }
    else if (el > 0)    { this.material.color.copy(DUSK).lerp(DAY, el / 0.2); }
    else if (el > -0.2) { this.material.color.copy(NIGHT).lerp(DUSK, (el + 0.2) / 0.2); }
    else                { this.material.color.copy(NIGHT); }
  }

  update(time, _sunDir, _sunColor, _fogColor, cameraPos) {
    this.mesh.position.x = cameraPos.x;
    this.mesh.position.z = cameraPos.z;

    const posAttr = this.geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const wave = Math.sin(x * 0.02 + time * 0.8) * Math.cos(z * 0.015 + time * 0.6) * 0.4
                 + Math.sin(x * 0.04 + time * 1.2) * Math.cos(z * 0.03  + time * 0.9) * 0.15;
      posAttr.setY(i, this._baseY[i] + wave);
    }
    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
