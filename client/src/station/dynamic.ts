// Ce qui bouge : portes automatiques, ascenseurs, navette de transit, écrans animés.

import * as THREE from "three";
import type { Kit, Side, Updatable } from "./kit";
import { CrtScreen } from "./textures";
import type { StationAudio } from "./audio";

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------------------------------------------------------------- porte

/** Porte coulissante à deux battants qui s'ouvre quand on approche. */
export class Door implements Updatable {
  open = 0;
  private target = 0;
  private left: THREE.Mesh;
  private right: THREE.Mesh;
  private center: THREE.Vector3;
  private horizontal: boolean;

  constructor(
    kit: Kit,
    private readonly audio: StationAudio,
    o: { side: Side; fixed: number; at: number; width: number; y: number; height: number; locked?: boolean },
  ) {
    this.horizontal = o.side === "n" || o.side === "s";
    const half = o.width / 2;
    const depth = 0.12;
    const panel = new THREE.BoxGeometry(this.horizontal ? half : depth, o.height, this.horizontal ? depth : half);
    const mat = [kit.mats.hullDark.material, kit.mats.hullDark.material, kit.mats.hullDark.material, kit.mats.hullDark.material, kit.mats.hullCream.material, kit.mats.hullCream.material];
    this.left = new THREE.Mesh(panel, mat);
    this.right = new THREE.Mesh(panel, mat);
    // Bande à rayures sur chaque battant.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(this.horizontal ? half : depth + 0.02, 0.25, this.horizontal ? depth + 0.02 : half), kit.mats.hazard.material);
    stripe.position.y = -o.height * 0.15;
    this.left.add(stripe.clone());
    this.right.add(stripe);
    const wallMid = o.fixed + (o.side === "n" || o.side === "w" ? -0.15 : 0.15);
    this.center = this.horizontal ? new THREE.Vector3(o.at, o.y + o.height / 2, wallMid) : new THREE.Vector3(wallMid, o.y + o.height / 2, o.at);
    this.left.position.copy(this.center);
    this.right.position.copy(this.center);
    kit.dynamic.add(this.left, this.right);
    // Petit voyant au-dessus de la porte.
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), kit.mats.lampGreen.material);
    lamp.position.copy(this.center).setY(o.y + o.height + 0.35);
    kit.dynamic.add(lamp);
    this.layout();

    const a = o.at - half;
    const b = o.at + half;
    if (this.horizontal) kit.wall(a, o.y, wallMid - 0.15, b, o.y + o.height, wallMid + 0.15, () => this.open < 0.75);
    else kit.wall(wallMid - 0.15, o.y, a, wallMid + 0.15, o.y + o.height, b, () => this.open < 0.75);
    this.halfWidth = half;
  }

  private halfWidth = 1.2;

  private layout(): void {
    const off = this.halfWidth / 2 + this.open * this.halfWidth * 0.95;
    if (this.horizontal) {
      this.left.position.x = this.center.x - off;
      this.right.position.x = this.center.x + off;
    } else {
      this.left.position.z = this.center.z - off;
      this.right.position.z = this.center.z + off;
    }
  }

  update(dt: number, ctx: { player: THREE.Vector3 }): void {
    const dx = ctx.player.x - this.center.x;
    const dz = ctx.player.z - this.center.z;
    const near = dx * dx + dz * dz < 3.4 * 3.4 && Math.abs(ctx.player.y - this.center.y) < 2.6;
    const target = near ? 1 : 0;
    if (target !== this.target) {
      this.target = target;
      this.audio.door(this.center, target === 1);
    }
    const before = this.open;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * 2.4);
    if (before !== this.open) this.layout();
  }
}

// ---------------------------------------------------------------- ascenseur

/** Cabine vitrée qui dessert plusieurs niveaux, côté entrée orienté vers `entry`. */
export class Elevator implements Updatable {
  y: number;
  level = 0;
  moving = false;
  private from = 0;
  private to = 0;
  private t = 0;
  private cabin = new THREE.Group();
  private light: THREE.PointLight;

  constructor(
    private readonly kit: Kit,
    private readonly audio: StationAudio,
    readonly o: { x0: number; x1: number; z0: number; z1: number; levels: number[]; entry: Side; name: string; levelNames: string[] },
  ) {
    this.y = o.levels[0]!;
    const { x0, x1, z0, z1 } = o;
    const w = x1 - x0;
    const d = z1 - z0;
    const H = 2.8;
    const mats = kit.mats;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mats.grate.material);
    floor.position.set(0, -0.1, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.5, d + 0.2), mats.hullDark.material);
    base.position.set(0, -0.45, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), mats.hullDark.material);
    roof.position.set(0, H + 0.15, 0);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.04, d * 0.6), mats.lampWarm.material);
    lamp.position.set(0, H - 0.02, 0);
    this.cabin.add(floor, base, roof, lamp);
    // Montants et vitres sur trois côtés.
    for (const [px, pz] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
    ] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 0.12), mats.trim.material);
      post.position.set(px, H / 2, pz);
      this.cabin.add(post);
    }
    const glassSides: Side[] = (["n", "s", "e", "w"] as Side[]).filter((s) => s !== o.entry);
    for (const s of glassSides) {
      const horizontal = s === "n" || s === "s";
      const g = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? w : d, H - 0.1), mats.glass.material);
      g.position.set(s === "e" ? w / 2 : s === "w" ? -w / 2 : 0, H / 2, s === "s" ? d / 2 : s === "n" ? -d / 2 : 0);
      if (!horizontal) g.rotation.y = Math.PI / 2;
      this.cabin.add(g);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? w : 0.06, 0.06, horizontal ? 0.06 : d), mats.metal.material);
      rail.position.set(g.position.x, 1.0, g.position.z);
      this.cabin.add(rail);
    }
    // Panneau de commande.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.06), mats.lampAmber.material);
    const back = glassSides.includes("n") ? "n" : glassSides[0]!;
    panel.position.set(back === "e" ? w / 2 - 0.1 : back === "w" ? -w / 2 + 0.1 : w / 2 - 0.4, 1.3, back === "n" ? -d / 2 + 0.1 : back === "s" ? d / 2 - 0.1 : 0);
    this.cabin.add(panel);
    this.light = new THREE.PointLight(0xffc27a, 22, 6, 2);
    this.light.position.set(0, H - 0.4, 0);
    this.cabin.add(this.light);
    this.cabin.position.set((x0 + x1) / 2, this.y, (z0 + z1) / 2);
    kit.dynamic.add(this.cabin);

    // Gaine : rails de guidage et machinerie en haut.
    const top = o.levels[o.levels.length - 1]! + 4;
    const bottom = o.levels[0]! - 0.8;
    for (const [px, pz] of [
      [x0 - 0.15, z0 - 0.15],
      [x1 + 0.15, z0 - 0.15],
      [x0 - 0.15, z1 + 0.15],
      [x1 + 0.15, z1 + 0.15],
    ] as const) {
      kit.box(px - 0.1, bottom, pz - 0.1, px + 0.1, top, pz + 0.1, "metal");
    }
    kit.box(x0 - 0.4, top, z0 - 0.4, x1 + 0.4, top + 0.6, z1 + 0.4, "hullDark");
    kit.cylinder(new THREE.Vector3((x0 + x1) / 2, top, (z0 + z1) / 2), new THREE.Vector3((x0 + x1) / 2, bottom + 1, (z0 + z1) / 2), 0.03, "metal", 4);

    // Collisions : trois côtés vitrés sur toute la hauteur, l'entrée fermée si la cabine n'est pas là.
    const ymin = bottom;
    const ymax = top;
    const side = (s: Side, active?: () => boolean) => {
      if (s === "n") kit.wall(x0, ymin, z0 - 0.1, x1, ymax, z0 + 0.05, active);
      if (s === "s") kit.wall(x0, ymin, z1 - 0.05, x1, ymax, z1 + 0.1, active);
      if (s === "w") kit.wall(x0 - 0.1, ymin, z0, x0 + 0.05, ymax, z1, active);
      if (s === "e") kit.wall(x1 - 0.05, ymin, z0, x1 + 0.1, ymax, z1, active);
    };
    for (const s of glassSides) side(s);
    o.levels.forEach((ly) => {
      const gate = () => this.moving || Math.abs(this.y - ly) > 0.05;
      if (o.entry === "n") kit.wall(x0, ly, z0 - 0.1, x1, ly + 2.5, z0 + 0.05, gate);
      if (o.entry === "s") kit.wall(x0, ly, z1 - 0.05, x1, ly + 2.5, z1 + 0.1, gate);
      if (o.entry === "w") kit.wall(x0 - 0.1, ly, z0, x0 + 0.05, ly + 2.5, z1, gate);
      if (o.entry === "e") kit.wall(x1 - 0.05, ly, z0, x1 + 0.1, ly + 2.5, z1, gate);
    });
    kit.floor(x0, z0, x1, z1, () => this.y);

    // Boutons d'appel sur chaque palier, et commande dans la cabine.
    const mid = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const out = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[o.entry];
    o.levels.forEach((ly, i) => {
      const pos = new THREE.Vector3(mid.x + out[0]! * (w / 2 + 1.2), ly + 1.2, mid.z + out[1]! * (d / 2 + 1.2));
      kit.interactables.push({
        pos,
        radius: 1.8,
        label: () => (this.moving ? null : this.level === i ? null : `Appeler l'ascenseur (${o.levelNames[i]})`),
        act: () => this.go(i),
      });
    });
    kit.interactables.push({
      pos: new THREE.Vector3(mid.x, 0, mid.z),
      radius: Math.max(w, d) * 0.7,
      label: () => {
        if (this.moving) return null;
        return `Aller au ${this.o.levelNames[this.next()]}`;
      },
      act: () => this.go(this.next()),
    });
    // L'interaction de cabine suit la hauteur de la cabine.
    const inside = kit.interactables[kit.interactables.length - 1]!;
    this.insideMarker = inside.pos;
    kit.updatables.push(this);
  }

  private insideMarker: THREE.Vector3;

  /** Le joueur est-il dans la cabine ? */
  contains(p: THREE.Vector3): boolean {
    return p.x > this.o.x0 && p.x < this.o.x1 && p.z > this.o.z0 && p.z < this.o.z1 && Math.abs(p.y - this.y) < 2.5;
  }

  /** Niveau suivant : on monte jusqu'en haut, puis on redescend. */
  next(): number {
    const n = this.o.levels.length;
    return this.level === n - 1 ? 0 : this.level + 1;
  }

  go(level: number): void {
    if (this.moving || level === this.level) return;
    this.from = this.y;
    this.to = this.o.levels[level]!;
    this.level = level;
    this.t = 0;
    this.moving = true;
    this.audio.elevatorStart(this.cabin.position);
  }

  update(dt: number): void {
    this.insideMarker.y = this.y + 1.2;
    if (!this.moving) return;
    const dist = Math.abs(this.to - this.from);
    this.t = Math.min(1, this.t + dt / Math.max(1.5, dist / 2.2));
    this.y = this.from + (this.to - this.from) * ease(this.t);
    this.cabin.position.y = this.y;
    this.audio.elevatorMove(this.cabin.position);
    if (this.t >= 1) {
      this.moving = false;
      this.audio.elevatorArrive(this.cabin.position);
    }
  }
}

// ---------------------------------------------------------------- navette

export interface TramStop {
  name: string;
  /** Position du centre de la voiture à quai. */
  x: number;
}

/**
 * Navette sur rail entre deux quais, le long de l'axe x. Pendant le trajet, le joueur est emporté
 * avec la voiture (on ne marche pas dans une navette lancée à 25 m/s).
 */
export class Tram implements Updatable {
  x: number;
  at = 0;
  moving = false;
  private from = 0;
  private to = 0;
  private t = 0;
  private car: THREE.Group;
  readonly length = 11;
  readonly width = 3.2;
  /** Décalage du joueur dans la voiture pendant un trajet. */
  rider: THREE.Vector3 | null = null;

  constructor(
    kit: Kit,
    carGroup: THREE.Group,
    private readonly audio: StationAudio,
    readonly o: { z: number; y: number; stops: TramStop[]; doorSide: "n" | "s" },
  ) {
    this.car = carGroup;
    this.x = o.stops[0]!.x;
    this.car.position.set(this.x, o.y, o.z);
    kit.dynamic.add(this.car);
    const L = this.length / 2;
    const W = this.width / 2;
    o.stops.forEach((stop, i) => {
      const docked = () => !this.moving && this.at === i;
      const away = () => !docked();
      // Plancher et parois de la voiture quand elle est à quai.
      kit.floor(stop.x - L, o.z - W, stop.x + L, o.z + W, o.y, docked);
      const far = o.doorSide === "n" ? o.z + W : o.z - W;
      kit.wall(stop.x - L, o.y, Math.min(far, far + (o.doorSide === "n" ? 0.2 : -0.2)), stop.x + L, o.y + 3, Math.max(far, far + (o.doorSide === "n" ? 0.2 : -0.2)), docked);
      kit.wall(stop.x - L - 0.2, o.y, o.z - W, stop.x - L, o.y + 3, o.z + W, docked);
      kit.wall(stop.x + L, o.y, o.z - W, stop.x + L + 0.2, o.y + 3, o.z + W, docked);
      // Bord de quai : on ne tombe pas sur la voie quand la navette est partie.
      const edge = o.doorSide === "n" ? o.z - W : o.z + W;
      kit.wall(stop.x - L, o.y, edge - 0.1, stop.x + L, o.y + 1.2, edge + 0.1, away);
      // Appel depuis le quai.
      kit.interactables.push({
        pos: new THREE.Vector3(stop.x + 3.25, o.y + 1.2, edge + (o.doorSide === "n" ? -1.5 : 1.5)),
        radius: 2.2,
        label: () => (this.moving || this.at === i ? null : "Appeler la navette"),
        act: () => this.go(i, false),
      });
      // Départ depuis l'intérieur.
      kit.interactables.push({
        pos: new THREE.Vector3(stop.x, o.y + 1.2, o.z),
        radius: 3.5,
        label: () => {
          if (this.moving || this.at !== i) return null;
          const dest = o.stops[(i + 1) % o.stops.length]!;
          return `Partir vers ${dest.name}`;
        },
        act: () => this.go((i + 1) % o.stops.length, true),
      });
    });
    kit.updatables.push(this);
  }

  /** Le joueur est-il dans la voiture à quai ? */
  contains(p: THREE.Vector3): boolean {
    return Math.abs(p.x - this.x) < this.length / 2 && Math.abs(p.z - this.o.z) < this.width / 2 && Math.abs(p.y - this.o.y) < 2.5;
  }

  private pendingRider = false;

  go(stop: number, withPlayer: boolean): void {
    if (this.moving) return;
    this.from = this.x;
    this.to = this.o.stops[stop]!.x;
    this.at = stop;
    this.t = 0;
    this.moving = true;
    this.pendingRider = withPlayer;
    this.audio.tramStart();
  }

  /** Appelé par la boucle principale : capture la place du joueur au départ. */
  board(player: THREE.Vector3): void {
    if (this.pendingRider) {
      this.rider = new THREE.Vector3(player.x - this.x, player.y - this.o.y, player.z - this.o.z);
      this.pendingRider = false;
    }
  }

  get position(): THREE.Vector3 {
    return this.car.position;
  }

  update(dt: number): void {
    if (!this.moving) return;
    const dist = Math.abs(this.to - this.from);
    this.t = Math.min(1, this.t + dt / Math.max(4, dist / 22));
    this.x = this.from + (this.to - this.from) * ease(this.t);
    this.car.position.x = this.x;
    this.audio.tramMove(Math.sin(this.t * Math.PI));
    if (this.t >= 1) {
      this.moving = false;
      this.rider = null;
      this.audio.tramStop();
    }
  }
}

// ---------------------------------------------------------------- écrans

/** Écran cathodique posé dans le décor, animé quand on est assez près. */
export class Screen implements Updatable {
  private crt: CrtScreen;
  private pos: THREE.Vector3;

  constructor(kit: Kit, o: { pos: THREE.Vector3; facing: Side; w?: number; h?: number; title: string; lines: string[]; color?: string; seed?: number }) {
    this.crt = new CrtScreen(o.title, o.lines, o.color, o.seed);
    this.pos = o.pos;
    kit.plate(this.crt.texture, o.w ?? 0.56, o.h ?? 0.42, o.pos, o.facing, 1.1);
    kit.light(o.pos.x, o.pos.y, o.pos.z, 0x58ff8a, 0.6, 3);
    kit.updatables.push(this);
  }

  update(dt: number, ctx: { player: THREE.Vector3 }): void {
    if (ctx.player.distanceToSquared(this.pos) < 30 * 30) this.crt.update(dt);
  }
}
