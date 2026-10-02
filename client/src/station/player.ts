// Déplacement en vue subjective : regard à la souris, marche ZQSD/WASD, course, collisions
// contre les murs (cercle contre boîtes), sols praticables (marches, rampes, cabines mobiles).

import * as THREE from "three";
import type { Floor, Wall } from "./kit";

const RADIUS = 0.32;
const EYE = 1.65;
const STEP = 0.55;
const WALK = 3.1;
const RUN = 5.6;
const GRAVITY = 18;

export class Player {
  /** Position des pieds. */
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  private vy = 0;
  private bob = 0;
  private stepClock = 0;
  readonly keys = new Set<string>();
  /** Déplacement bloqué (trajet en navette ou en ascenseur). */
  locked = false;
  onStep: ((run: boolean) => void) | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly walls: Wall[],
    private readonly floors: Floor[],
  ) {}

  place(x: number, y: number, z: number, yaw: number): void {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.vy = 0;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022));
  }

  /** Hauteur du sol sous (x, z), atteignable depuis les pieds actuels, ou null s'il n'y a rien. */
  floorAt(x: number, z: number, feet: number): number | null {
    let best: number | null = null;
    for (const f of this.floors) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      if (f.active && !f.active()) continue;
      const h = f.height(x, z);
      if (h > feet + STEP) continue;
      if (best === null || h > best) best = h;
    }
    return best;
  }

  private collide(x: number, z: number, feet: number): [number, number] {
    const lo = feet + 0.35;
    const hi = feet + 1.75;
    for (let pass = 0; pass < 3; pass++) {
      for (const w of this.walls) {
        if (w.maxY < lo || w.minY > hi) continue;
        if (x + RADIUS < w.minX || x - RADIUS > w.maxX || z + RADIUS < w.minZ || z - RADIUS > w.maxZ) continue;
        if (w.active && !w.active()) continue;
        // Point le plus proche de la boîte, puis on repousse le cercle.
        const cx = Math.max(w.minX, Math.min(x, w.maxX));
        const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
        let dx = x - cx;
        let dz = z - cz;
        let d = Math.hypot(dx, dz);
        if (d < 1e-6) {
          // Centre dans la boîte : sortir par le côté le plus proche.
          const exits = [x - w.minX, w.maxX - x, z - w.minZ, w.maxZ - z];
          const k = exits.indexOf(Math.min(...exits));
          dx = k === 0 ? -1 : k === 1 ? 1 : 0;
          dz = k === 2 ? -1 : k === 3 ? 1 : 0;
          d = 0;
          x += dx * (exits[k]! + RADIUS);
          z += dz * (exits[k]! + RADIUS);
          continue;
        }
        if (d < RADIUS) {
          x += (dx / d) * (RADIUS - d);
          z += (dz / d) * (RADIUS - d);
        }
      }
    }
    return [x, z];
  }

  update(dt: number): void {
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    const forward = k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown");
    const strafe = k("KeyD") - k("KeyA");
    const run = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    let moving = false;

    if (!this.locked && (forward || strafe)) {
      const speed = run ? RUN : WALK;
      const len = Math.hypot(forward, strafe);
      const sx = Math.sin(this.yaw);
      const cz = Math.cos(this.yaw);
      const vx = ((-sx * forward + cz * strafe) / len) * speed * dt;
      const vz = ((-cz * forward - sx * strafe) / len) * speed * dt;
      // Sous-pas : pas de traversée de mur même avec une image lente.
      const n = Math.ceil(Math.hypot(vx, vz) / 0.15);
      for (let i = 0; i < n; i++) {
        let [nx, nz] = this.collide(this.pos.x + vx / n, this.pos.z + vz / n, this.pos.y);
        const ground = this.floorAt(nx, nz, this.pos.y);
        if (ground === null || ground < this.pos.y - 2.5) {
          // Pas de sol (ou un précipice) : on glisse le long de l'axe qui reste valide.
          const gx = this.floorAt(nx, this.pos.z, this.pos.y);
          const gz = this.floorAt(this.pos.x, nz, this.pos.y);
          if (gx !== null && gx >= this.pos.y - 2.5) nz = this.pos.z;
          else if (gz !== null && gz >= this.pos.y - 2.5) nx = this.pos.x;
          else continue;
        }
        this.pos.x = nx;
        this.pos.z = nz;
      }
      moving = true;
    }

    // Gravité et marches.
    const ground = this.floorAt(this.pos.x, this.pos.z, this.pos.y);
    if (ground !== null) {
      if (ground >= this.pos.y - 0.05) {
        this.pos.y = ground;
        this.vy = 0;
      } else {
        this.vy -= GRAVITY * dt;
        this.pos.y = Math.max(ground, this.pos.y + this.vy * dt);
        if (this.pos.y === ground) this.vy = 0;
      }
    }

    // Balancement de tête et bruits de pas.
    if (moving) {
      const rate = run ? 2.6 : 1.9;
      this.bob += dt * rate * Math.PI * 2;
      this.stepClock += dt * rate * 2;
      if (this.stepClock >= 1) {
        this.stepClock -= 1;
        this.onStep?.(run);
      }
    } else {
      this.bob *= Math.pow(0.02, dt);
    }
    const bobY = moving ? Math.sin(this.bob * 2) * (run ? 0.045 : 0.028) : 0;
    const bobX = moving ? Math.cos(this.bob) * (run ? 0.03 : 0.018) : 0;

    this.camera.position.set(this.pos.x + Math.cos(this.yaw) * bobX, this.pos.y + EYE + bobY, this.pos.z - Math.sin(this.yaw) * bobX);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
