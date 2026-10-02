// Mobilier et accessoires, posés avec une orientation : bancs, consoles, lits, casiers, bar…
// Chaque accessoire est décrit dans un repère local (x vers la droite, z vers l'avant, y vers le haut)
// puis tourné vers `facing`, la direction vers laquelle il regarde.

import * as THREE from "three";
import type { Kit, MatKey, Side } from "./kit";
import { Screen } from "./dynamic";

export class Prop {
  constructor(
    private readonly kit: Kit,
    private readonly x: number,
    private readonly y: number,
    private readonly z: number,
    private readonly facing: Side,
  ) {}

  private map(lx: number, lz: number): [number, number] {
    switch (this.facing) {
      case "s":
        return [this.x + lx, this.z + lz];
      case "n":
        return [this.x - lx, this.z - lz];
      case "e":
        return [this.x + lz, this.z - lx];
      case "w":
        return [this.x - lz, this.z + lx];
    }
  }

  box(lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: MatKey, collide = false): this {
    const [ax, az] = this.map(lx0, lz0);
    const [bx, bz] = this.map(lx1, lz1);
    this.kit.box(Math.min(ax, bx), this.y + ly0, Math.min(az, bz), Math.max(ax, bx), this.y + ly1, Math.max(az, bz), mat, collide);
    return this;
  }

  cyl(lx: number, ly0: number, lz: number, ly1: number, r: number, mat: MatKey): this {
    const [x, z] = this.map(lx, lz);
    this.kit.cylinder(new THREE.Vector3(x, this.y + ly0, z), new THREE.Vector3(x, this.y + ly1, z), r, mat, 12);
    return this;
  }

  point(lx: number, ly: number, lz: number): THREE.Vector3 {
    const [x, z] = this.map(lx, lz);
    return new THREE.Vector3(x, this.y + ly, z);
  }

  /** Côté vers lequel regarde l'avant de l'accessoire. */
  get front(): Side {
    return this.facing;
  }
}

export function bench(kit: Kit, x: number, y: number, z: number, facing: Side, len = 3): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-len / 2, 0.38, -0.25, len / 2, 0.48, 0.25, "leather", true);
  p.box(-len / 2, 0.48, -0.3, len / 2, 0.95, -0.2, "leather");
  for (const lx of [-len / 2 + 0.2, len / 2 - 0.2]) p.box(lx - 0.05, 0, -0.25, lx + 0.05, 0.38, 0.2, "metal");
}

/** Console murale avec écran cathodique animé. */
export function terminal(kit: Kit, x: number, y: number, z: number, facing: Side, title: string, lines: string[], seed = 1, color?: string): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-0.6, 0, -0.45, 0.6, 0.9, 0.25, "hullDark", true);
  p.box(-0.62, 0.9, -0.45, 0.62, 0.97, 0.32, "trim");
  // Clavier.
  p.box(-0.4, 0.97, 0.0, 0.4, 1.02, 0.25, "plasticWhite");
  for (let i = 0; i < 6; i++) p.box(-0.35 + i * 0.12, 1.02, 0.05, -0.27 + i * 0.12, 1.04, 0.12, "trim");
  // Boîtier de l'écran.
  p.box(-0.4, 0.97, -0.45, 0.4, 1.6, -0.05, "plasticWhite");
  const screenPos = p.point(0, 1.3, -0.04);
  new Screen(kit, { pos: screenPos, facing, title, lines, seed, color, w: 0.6, h: 0.44 });
  // Voyants.
  p.box(0.45, 0.75, 0.26, 0.5, 0.8, 0.27, "lampRed");
  p.box(0.35, 0.75, 0.26, 0.4, 0.8, 0.27, "lampGreen");
}

/** Bureau simple avec moniteur. */
export function desk(kit: Kit, x: number, y: number, z: number, facing: Side, title: string, lines: string[], seed = 2): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-0.9, 0.72, -0.4, 0.9, 0.78, 0.4, "wood", true);
  p.box(-0.88, 0, -0.38, -0.8, 0.72, 0.38, "metal");
  p.box(0.8, 0, -0.38, 0.88, 0.72, 0.38, "metal");
  p.box(-0.3, 0.78, -0.35, 0.3, 1.25, 0.0, "plasticWhite");
  new Screen(kit, { pos: p.point(0, 1.02, 0.01), facing, title, lines, seed, w: 0.42, h: 0.32 });
  // Chaise.
  p.box(-0.25, 0.42, 0.6, 0.25, 0.48, 1.05, "leather");
  p.box(-0.25, 0.48, 1.0, 0.25, 0.95, 1.06, "leather");
  p.cyl(0, 0, 0.82, 0.42, 0.04, "metal");
}

export function medBed(kit: Kit, x: number, y: number, z: number, facing: Side): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-0.5, 0.55, -1.1, 0.5, 0.7, 1.1, "plasticWhite", true);
  p.box(-0.45, 0.7, -1.05, 0.45, 0.8, 1.05, "tilesMed");
  p.box(-0.35, 0.8, -1.0, 0.35, 0.9, -0.65, "plasticWhite");
  for (const [lx, lz] of [
    [-0.45, -1.0],
    [0.45, -1.0],
    [-0.45, 1.0],
    [0.45, 1.0],
  ] as const) {
    p.cyl(lx, 0, lz, 0.55, 0.03, "metal");
  }
  // Moniteur de chevet.
  p.cyl(0.75, 0, -1.0, 1.5, 0.03, "metal");
  p.box(0.55, 1.5, -1.12, 0.95, 1.8, -0.9, "hullDark");
  p.box(0.6, 1.55, -0.9, 0.9, 1.75, -0.89, "lampGreen");
}

export function bunk(kit: Kit, x: number, y: number, z: number, facing: Side): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-1.0, 0, -0.45, 1.0, 0.45, 0.45, "hullDark", true);
  p.box(-0.95, 0.45, -0.42, 0.95, 0.6, 0.42, "plasticOrange");
  p.box(-0.95, 0.6, -0.4, -0.6, 0.7, 0.4, "plasticWhite");
  p.box(-1.0, 1.4, -0.45, 1.0, 1.5, 0.45, "hullDark");
  p.box(-0.95, 1.5, -0.42, 0.95, 1.62, 0.42, "plasticOrange");
  for (const lx of [-1.0, 0.95]) p.box(lx, 0, -0.45, lx + 0.05, 1.9, 0.45, "metal");
  // Petite liseuse.
  p.box(0.6, 1.25, -0.45, 0.8, 1.3, -0.35, "lampWarm");
}

export function lockers(kit: Kit, x: number, y: number, z: number, facing: Side, count = 4): void {
  const p = new Prop(kit, x, y, z, facing);
  const w = 0.5;
  for (let i = 0; i < count; i++) {
    const lx = -((count * w) / 2) + i * w;
    p.box(lx + 0.01, 0, -0.3, lx + w - 0.01, 1.9, 0.25, i % 3 === 1 ? "hullCream" : "hullDark", true);
    p.box(lx + 0.06, 1.55, 0.25, lx + w - 0.06, 1.6, 0.27, "trim");
    p.box(lx + 0.06, 1.65, 0.25, lx + w - 0.06, 1.7, 0.27, "trim");
    p.box(lx + w - 0.12, 0.9, 0.25, lx + w - 0.08, 1.05, 0.29, "metal");
  }
}

export function planter(kit: Kit, x: number, y: number, z: number, size = 1): void {
  const p = new Prop(kit, x, y, z, "s");
  p.box(-0.5 * size, 0, -0.5 * size, 0.5 * size, 0.6, 0.5 * size, "hullDark", true);
  p.box(-0.45 * size, 0.6, -0.45 * size, 0.45 * size, 0.65, 0.45 * size, "rubber");
  // Une plante qui a connu des jours meilleurs.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = 0.18 * size;
    const top = p.point(Math.cos(a) * r * 2.2, 0.65 + 0.7 * size + (i % 2) * 0.3, Math.sin(a) * r * 2.2);
    kit.cylinder(p.point(Math.cos(a) * r * 0.4, 0.65, Math.sin(a) * r * 0.4), top, 0.03, "plant", 5);
    const g = new THREE.ConeGeometry(0.16 * size, 0.5 * size, 5);
    g.rotateZ(Math.PI);
    g.translate(top.x, top.y - 0.1, top.z);
    kit.add(g, "plant");
  }
}

export function pillar(kit: Kit, x: number, y: number, z: number, h: number, lamp = true): void {
  kit.cylinder(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h, z), 0.55, "hullCream", 16);
  kit.cylinder(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 0.3, z), 0.62, "trim", 16);
  kit.cylinder(new THREE.Vector3(x, y + h - 0.4, z), new THREE.Vector3(x, y + h, z), 0.68, "trim", 16);
  if (lamp) {
    kit.cylinder(new THREE.Vector3(x, y + 2.6, z), new THREE.Vector3(x, y + 2.75, z), 0.58, "lampWarm", 16);
    kit.light(x, y + 2.7, z, 0xffc27a, 3, 8);
  }
  kit.wall(x - 0.55, y, z - 0.55, x + 0.55, y + h, z + 0.55);
}

export function vending(kit: Kit, x: number, y: number, z: number, facing: Side, mat: MatKey = "lampBlue"): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-0.5, 0, -0.4, 0.5, 2.0, 0.4, "plasticOrange", true);
  p.box(-0.4, 0.9, 0.4, 0.15, 1.85, 0.41, mat);
  p.box(0.22, 1.2, 0.4, 0.42, 1.7, 0.42, "trim");
  p.box(-0.4, 0.15, 0.4, 0.4, 0.5, 0.42, "rubber");
  const l = p.point(0, 1.4, 0.8);
  kit.light(l.x, l.y, l.z, 0x6fb7ff, 1.6, 4);
}

export function crates(kit: Kit, x: number, y: number, z: number, n = 3, seed = 1): void {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const w = 0.6 + r() * 0.5;
    const ox = (r() - 0.5) * 1.6;
    const oz = (r() - 0.5) * 1.6;
    const stack = i > 0 && r() > 0.6 ? 0.7 : 0;
    kit.box(x + ox - w / 2, y + stack, z + oz - w / 2, x + ox + w / 2, y + stack + w * 0.9, z + oz + w / 2, r() > 0.5 ? "hullCream" : "plasticOrange", true);
    kit.box(x + ox - w / 2 - 0.01, y + stack + w * 0.4, z + oz - w / 2 - 0.01, x + ox + w / 2 + 0.01, y + stack + w * 0.5, z + oz + w / 2 + 0.01, "hazard");
  }
}

/** Plafonnier circulaire suspendu, avec son point de lumière. */
export function hangingLamp(kit: Kit, x: number, ceilingY: number, z: number, drop = 2, color = 0xffc27a, intensity = 7, distance = 16): void {
  kit.cylinder(new THREE.Vector3(x, ceilingY, z), new THREE.Vector3(x, ceilingY - drop, z), 0.02, "metal", 4);
  kit.cylinder(new THREE.Vector3(x, ceilingY - drop, z), new THREE.Vector3(x, ceilingY - drop - 0.25, z), 0.9, "hullDark", 20);
  kit.cylinder(new THREE.Vector3(x, ceilingY - drop - 0.26, z), new THREE.Vector3(x, ceilingY - drop - 0.25, z), 0.8, color === 0xffc27a ? "lampWarm" : "lampCold", 20);
  kit.light(x, ceilingY - drop - 0.8, z, color, intensity, distance);
}

/** Panneau lumineux encastré au plafond. */
export function ceilingPanel(kit: Kit, x: number, ceilingY: number, z: number, w = 1.2, d = 0.6, mat: MatKey = "lampCold", color = 0xdfeaff, intensity = 4, distance = 10, flicker = 0): void {
  kit.box(x - w / 2 - 0.05, ceilingY - 0.08, z - d / 2 - 0.05, x + w / 2 + 0.05, ceilingY, z + d / 2 + 0.05, "trim");
  kit.box(x - w / 2, ceilingY - 0.1, z - d / 2, x + w / 2, ceilingY - 0.08, z + d / 2, mat);
  kit.light(x, ceilingY - 0.6, z, color, intensity, distance, flicker);
}

export function sofa(kit: Kit, x: number, y: number, z: number, facing: Side, len = 2.4): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-len / 2, 0, -0.45, len / 2, 0.42, 0.45, "leather", true);
  p.box(-len / 2, 0.42, -0.45, len / 2, 0.95, -0.2, "leather");
  p.box(-len / 2, 0.42, -0.45, -len / 2 + 0.2, 0.7, 0.45, "leather");
  p.box(len / 2 - 0.2, 0.42, -0.45, len / 2, 0.7, 0.45, "leather");
}

export function roundTable(kit: Kit, x: number, y: number, z: number): void {
  kit.cylinder(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 0.04, z), 0.35, "metal", 16);
  kit.cylinder(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 0.7, z), 0.05, "metal", 8);
  kit.cylinder(new THREE.Vector3(x, y + 0.7, z), new THREE.Vector3(x, y + 0.75, z), 0.5, "plasticWhite", 20);
  kit.wall(x - 0.5, y, z - 0.5, x + 0.5, y + 0.75, z + 0.5);
}

export function stool(kit: Kit, x: number, y: number, z: number): void {
  kit.cylinder(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 0.75, z), 0.04, "metal", 8);
  kit.cylinder(new THREE.Vector3(x, y + 0.75, z), new THREE.Vector3(x, y + 0.82, z), 0.22, "leather", 14);
}

/** Comptoir de bar avec étagère rétroéclairée et bouteilles. */
export function bar(kit: Kit, x: number, y: number, z: number, facing: Side, len = 6): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-len / 2, 0, -0.35, len / 2, 1.05, 0.35, "wood", true);
  p.box(-len / 2 - 0.05, 1.05, -0.4, len / 2 + 0.05, 1.12, 0.45, "plasticWhite");
  p.box(-len / 2, 0.1, 0.35, len / 2, 0.16, 0.37, "lampAmber");
  // Étagère murale derrière le comptoir.
  p.box(-len / 2, 1.2, -1.6, len / 2, 2.6, -1.5, "hullDark");
  for (const ly of [1.45, 1.95]) {
    p.box(-len / 2 + 0.1, ly, -1.5, len / 2 - 0.1, ly + 0.04, -1.3, "lampAmber");
    for (let i = 0; i < Math.floor(len / 0.3); i++) {
      const lx = -len / 2 + 0.25 + i * 0.3;
      if ((i * 7) % 5 === 0) continue;
      p.cyl(lx, ly + 0.04, -1.4, ly + 0.3 + ((i * 3) % 4) * 0.04, 0.04, i % 3 === 0 ? "glass" : i % 3 === 1 ? "plasticOrange" : "plant");
    }
  }
  const l = p.point(0, 2.2, -1.0);
  kit.light(l.x, l.y, l.z, 0xffa040, 3.5, 8);
  for (let i = 0; i < Math.floor(len / 1.2); i++) stool(kit, ...p.point(-len / 2 + 0.6 + i * 1.2, 0, 0.8).toArray());
}

/** Kiosque d'information : colonne avec écran incliné. */
export function kiosk(kit: Kit, x: number, y: number, z: number, facing: Side, title: string, lines: string[], seed = 3): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-0.35, 0, -0.3, 0.35, 1.1, 0.3, "hullCream", true);
  p.box(-0.45, 1.1, -0.35, 0.45, 1.75, 0.15, "hullDark");
  new Screen(kit, { pos: p.point(0, 1.42, 0.16), facing, title, lines, seed, w: 0.66, h: 0.5 });
  p.box(-0.45, 1.75, -0.35, 0.45, 1.85, 0.2, "lampAmber");
}

/** Banc d'écrans de surveillance. */
export function monitorBank(kit: Kit, x: number, y: number, z: number, facing: Side, n = 4): void {
  const p = new Prop(kit, x, y, z, facing);
  p.box(-n * 0.35 - 0.1, 0, -0.5, n * 0.35 + 0.1, 0.85, 0.3, "hullDark", true);
  p.box(-n * 0.35 - 0.1, 0.85, -0.5, n * 0.35 + 0.1, 0.9, 0.4, "trim");
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      const lx = -n * 0.35 + 0.35 + i * 0.7;
      const ly = 1.2 + row * 0.55;
      p.box(lx - 0.33, ly - 0.25, -0.5, lx + 0.33, ly + 0.25, -0.2, "plasticWhite");
      new Screen(kit, {
        pos: p.point(lx, ly, -0.19),
        facing,
        title: `CAM ${String(row * n + i + 1).padStart(2, "0")}`,
        lines: ["SECTEUR " + "ABCDEFGH"[(row * n + i) % 8], "SIGNAL ... OK", "MOUVEMENT : AUCUN", "ENREG. 24H"],
        seed: 50 + row * n + i,
        w: 0.56,
        h: 0.42,
      });
    }
  }
}
