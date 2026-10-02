// Réserve de lumières : quelques PointLight réattribuées à chaque image aux lampes les plus
// proches du joueur. Le nombre de lumières ne change jamais (pas de recompilation des shaders),
// mais la station peut compter des centaines de points lumineux.

import * as THREE from "three";
import type { LightAnchor } from "./kit";

const POOL = 12;
/** Les intensités du plan sont relatives ; les lumières physiques de Three.js en demandent davantage. */
const GAIN = 6;
const FADE_START = 22;
const FADE_END = 34;

export class LightPool {
  private lights: THREE.PointLight[] = [];
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private readonly anchors: LightAnchor[],
  ) {
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l);
      this.lights.push(l);
    }
  }

  update(dt: number, eye: THREE.Vector3): void {
    this.time += dt;
    const ranked = this.anchors
      .map((a) => ({ a, d: a.pos.distanceTo(eye) }))
      .filter((x) => x.d < FADE_END)
      .sort((x, y) => x.d - y.d)
      .slice(0, POOL);
    this.lights.forEach((l, i) => {
      const item = ranked[i];
      if (!item) {
        l.intensity = 0;
        return;
      }
      const { a, d } = item;
      l.position.copy(a.pos);
      l.color.setHex(a.color);
      l.distance = a.distance;
      const fade = 1 - THREE.MathUtils.smoothstep(d, FADE_START, FADE_END);
      let flicker = 1;
      if (a.flicker) {
        // Néon fatigué : coupures brèves et irrégulières.
        const n = Math.sin(this.time * 23 + a.pos.x * 3.1) + Math.sin(this.time * 7.3 + a.pos.z);
        if (n > 2 - a.flicker * 2) flicker = 0.15;
      }
      l.intensity = a.intensity * GAIN * fade * flicker;
    });
  }
}
