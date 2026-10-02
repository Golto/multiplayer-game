// Kit de construction de la station : salles, couloirs, escaliers, rambardes, baies vitrées.
// Toute la géométrie statique est accumulée par matériau puis fusionnée (peu d'appels de dessin).
// Le kit enregistre au passage les collisions, les sols praticables, les points de lumière et les
// zones nommées.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as T from "./textures";

// ---------------------------------------------------------------- matériaux

export type MatKey =
  | "hull"
  | "hullDark"
  | "hullCream"
  | "grate"
  | "tiles"
  | "tilesMed"
  | "carpet"
  | "ceiling"
  | "trim"
  | "metal"
  | "hazard"
  | "glass"
  | "leather"
  | "plasticWhite"
  | "plasticOrange"
  | "wood"
  | "lampCold"
  | "lampWarm"
  | "lampRed"
  | "lampGreen"
  | "lampAmber"
  | "lampBlue"
  | "rubber"
  | "plant";

interface MatDef {
  material: THREE.Material;
  /** Mètres couverts par une répétition de texture (UV calculées dans le monde). */
  uv: number;
}

function standard(params: THREE.MeshStandardMaterialParameters, surface?: T.Surface, bumpScale = 0.6): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  if (surface) {
    m.map = surface.map;
    m.bumpMap = surface.bump;
    m.bumpScale = bumpScale;
  }
  return m;
}

export function createMaterials(): Record<MatKey, MatDef> {
  const emissive = (color: number, intensity: number) =>
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.6 });
  return {
    hull: { material: standard({ roughness: 0.78, metalness: 0.25 }, T.panels({ base: "#8b8a7f", seam: "#3c3b35", cols: 2, rows: 2, seed: 11, accent: "#6f6a52" })), uv: 2.4 },
    hullDark: { material: standard({ roughness: 0.7, metalness: 0.35 }, T.panels({ base: "#4c4e4b", seam: "#1f201e", cols: 2, rows: 3, seed: 23 })), uv: 2.4 },
    hullCream: { material: standard({ roughness: 0.65, metalness: 0.1 }, T.panels({ base: "#c9c0a8", seam: "#7d7563", cols: 1, rows: 2, seed: 37, accent: "#b5532f" })), uv: 2.6 },
    grate: { material: standard({ roughness: 0.6, metalness: 0.7 }, T.grate(5), 0.8), uv: 1.6 },
    tiles: { material: standard({ roughness: 0.5, metalness: 0.05 }, T.tiles({ base: "#a39a85", joint: "#4a463c", n: 4, seed: 41 }), 0.4), uv: 2.4 },
    tilesMed: { material: standard({ roughness: 0.35, metalness: 0.05 }, T.tiles({ base: "#c6cbc2", joint: "#6c7068", n: 6, seed: 43 }), 0.3), uv: 2.4 },
    carpet: { material: standard({ roughness: 0.95 }, T.carpet("#6e3b24", 51), 0.3), uv: 2 },
    ceiling: { material: standard({ roughness: 0.85, metalness: 0.2 }, T.ceiling(61)), uv: 2.4 },
    trim: { material: new THREE.MeshStandardMaterial({ color: 0x2a2b29, roughness: 0.55, metalness: 0.5 }), uv: 1 },
    metal: { material: new THREE.MeshStandardMaterial({ color: 0x77786f, roughness: 0.35, metalness: 0.85 }), uv: 1 },
    hazard: { material: standard({ roughness: 0.7 }, { map: T.hazard(), bump: T.hazard() }, 0.1), uv: 0.8 },
    glass: {
      material: new THREE.MeshPhysicalMaterial({
        color: 0x9fc7c0,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      uv: 1,
    },
    leather: { material: new THREE.MeshStandardMaterial({ color: 0x5a2e1c, roughness: 0.55 }), uv: 1 },
    plasticWhite: { material: new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.45 }), uv: 1 },
    plasticOrange: { material: new THREE.MeshStandardMaterial({ color: 0xb8561f, roughness: 0.5 }), uv: 1 },
    wood: { material: new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.6 }), uv: 1 },
    rubber: { material: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 }), uv: 1 },
    plant: { material: new THREE.MeshStandardMaterial({ color: 0x3b4a2a, roughness: 0.8 }), uv: 1 },
    lampCold: { material: emissive(0xdfeaff, 1.25), uv: 1 },
    lampWarm: { material: emissive(0xffc27a, 1.3), uv: 1 },
    lampRed: { material: emissive(0xff2a1a, 1.8), uv: 1 },
    lampGreen: { material: emissive(0x5dff8a, 1.8), uv: 1 },
    lampAmber: { material: emissive(0xffa020, 1.6), uv: 1 },
    lampBlue: { material: emissive(0x6fb7ff, 1.3), uv: 1 },
  };
}

// ---------------------------------------------------------------- monde physique

export interface Wall {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  /** Collision active (une porte ouverte ne bloque plus). */
  active?: () => boolean;
}

export interface Floor {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: (x: number, z: number) => number;
  active?: () => boolean;
}

export interface LightAnchor {
  pos: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  /** 0 : stable ; plus c'est haut, plus le néon grésille. */
  flicker?: number;
}

export interface Area {
  name: string;
  sub: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  /** Couleur sur le plan. */
  zone: string;
}

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: () => string | null;
  act: () => void;
}

export interface Updatable {
  update(dt: number, ctx: { player: THREE.Vector3; time: number }): void;
}

export type Side = "n" | "s" | "e" | "w";

export interface Opening {
  side: Side;
  /** Centre de l'ouverture, le long du mur. */
  at: number;
  width: number;
  /** Bas et haut de l'ouverture, relatifs au sol de la salle. */
  bottom: number;
  top: number;
  kind: "door" | "window" | "gap";
  /** Porte automatique à poser dans l'ouverture. */
  door?: boolean;
}

export class Kit {
  readonly mats: Record<MatKey, MatDef>;
  readonly walls: Wall[] = [];
  readonly floors: Floor[] = [];
  readonly lights: LightAnchor[] = [];
  readonly areas: Area[] = [];
  readonly interactables: Interactable[] = [];
  readonly updatables: Updatable[] = [];
  readonly dynamic = new THREE.Group();
  private parts = new Map<MatKey, THREE.BufferGeometry[]>();

  /** Les matériaux peuvent être partagés entre plusieurs kits (la navette a le sien). */
  constructor(mats?: Record<MatKey, MatDef>) {
    this.mats = mats ?? createMaterials();
  }

  // ------------------------------------------------------------ bas niveau

  /** Ajoute une géométrie (déjà placée dans le monde) au lot de son matériau. */
  add(geo: THREE.BufferGeometry, mat: MatKey): void {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    g = this.worldUV(g, this.mats[mat].uv);
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  /** UV projetées depuis le monde : les textures gardent la même échelle partout. */
  private worldUV(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
    const pos = g.attributes.position!;
    const nor = g.attributes.normal!;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const nx = Math.abs(nor.getX(i));
      const ny = Math.abs(nor.getY(i));
      const nz = Math.abs(nor.getZ(i));
      let u: number;
      let v: number;
      if (ny >= nx && ny >= nz) {
        u = x;
        v = z;
      } else if (nx >= nz) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      uv[i * 2] = u / scale;
      uv[i * 2 + 1] = v / scale;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MatKey, collide = false): void {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, mat);
    if (collide) this.wall(x0, y0, z0, x1, y1, z1);
  }

  wall(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, active?: () => boolean): void {
    this.walls.push({
      minX: Math.min(x0, x1),
      maxX: Math.max(x0, x1),
      minY: Math.min(y0, y1),
      maxY: Math.max(y0, y1),
      minZ: Math.min(z0, z1),
      maxZ: Math.max(z0, z1),
      active,
    });
  }

  floor(x0: number, z0: number, x1: number, z1: number, height: number | ((x: number, z: number) => number), active?: () => boolean): void {
    this.floors.push({
      minX: Math.min(x0, x1),
      maxX: Math.max(x0, x1),
      minZ: Math.min(z0, z1),
      maxZ: Math.max(z0, z1),
      height: typeof height === "number" ? () => height : height,
      active,
    });
  }

  cylinder(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: MatKey, segments = 10): void {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(radius, radius, len, segments, 1, false);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    this.add(g, mat);
  }

  light(x: number, y: number, z: number, color: number, intensity = 6, distance = 14, flicker = 0): void {
    this.lights.push({ pos: new THREE.Vector3(x, y, z), color, intensity, distance, flicker });
  }

  area(a: Area): void {
    this.areas.push(a);
  }

  /** Panneau plat orienté (enseignes, écrans) : renvoyé tel quel, hors fusion. */
  plate(texture: THREE.Texture, w: number, h: number, pos: THREE.Vector3, facing: Side | "up", emissive = 0.9): THREE.Mesh {
    const m = new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: emissive, roughness: 0.5 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.copy(pos);
    mesh.rotation.y = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2, up: 0 }[facing];
    if (facing === "up") mesh.rotation.x = -Math.PI / 2;
    this.dynamic.add(mesh);
    return mesh;
  }

  // ------------------------------------------------------------ salles

  /**
   * Salle rectangulaire : sol, plafond, quatre murs percés de portes et de fenêtres.
   * Les murs sont posés à l'extérieur du rectangle : l'intérieur fait exactement x0..x1, z0..z1.
   */
  room(r: {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
    y: number;
    h: number;
    wall?: MatKey;
    floorMat?: MatKey;
    ceil?: MatKey | null;
    openings?: Opening[];
    noFloor?: boolean;
    trim?: boolean;
  }): void {
    const { x0, x1, z0, z1, y, h } = r;
    const t = 0.3;
    const wall = r.wall ?? "hull";
    if (!r.noFloor) {
      this.box(x0 - t, y - 0.25, z0 - t, x1 + t, y, z1 + t, r.floorMat ?? "grate");
      this.floor(x0, z0, x1, z1, y);
    }
    if (r.ceil !== null) this.box(x0 - t, y + h, z0 - t, x1 + t, y + h + 0.3, z1 + t, r.ceil ?? "ceiling");
    const openings = r.openings ?? [];
    const sides: { side: Side; a0: number; a1: number; fixed: number; out: number }[] = [
      { side: "n", a0: x0 - t, a1: x1 + t, fixed: z0, out: -t },
      { side: "s", a0: x0 - t, a1: x1 + t, fixed: z1, out: t },
      { side: "w", a0: z0, a1: z1, fixed: x0, out: -t },
      { side: "e", a0: z0, a1: z1, fixed: x1, out: t },
    ];
    for (const s of sides) {
      const ops = openings.filter((o) => o.side === s.side).sort((a, b) => a.at - b.at);
      let cursor = s.a0;
      const piece = (a: number, b: number, yb: number, yt: number, collide: boolean) => {
        if (b - a < 0.01 || yt - yb < 0.01) return;
        if (s.side === "n" || s.side === "s") this.box(a, yb, s.fixed, b, yt, s.fixed + s.out, wall, collide);
        else this.box(s.fixed, yb, a, s.fixed + s.out, yt, b, wall, collide);
      };
      for (const o of ops) {
        const a = o.at - o.width / 2;
        const b = o.at + o.width / 2;
        piece(cursor, a, y, y + h, true);
        piece(a, b, y, y + o.bottom, true);
        piece(a, b, y + o.top, y + h, false);
        if (o.kind === "window") this.windowPane(s.side, s.fixed, a, b, y + o.bottom, y + o.top);
        if (o.kind === "door") this.doorFrame(s.side, s.fixed, s.out, o.at, o.width, y, y + o.top);
        cursor = b;
      }
      piece(cursor, s.a1, y, y + h, true);
    }
    if (r.trim !== false) {
      // Plinthes sombres le long des murs.
      this.box(x0, y, z0, x1, y + 0.18, z0 + 0.05, "trim");
      this.box(x0, y, z1 - 0.05, x1, y + 0.18, z1, "trim");
      this.box(x0, y, z0, x0 + 0.05, y + 0.18, z1, "trim");
      this.box(x1 - 0.05, y, z0, x1, y + 0.18, z1, "trim");
    }
  }

  private windowPane(side: Side, fixed: number, a: number, b: number, y0: number, y1: number): void {
    const horizontal = side === "n" || side === "s";
    const off = side === "n" || side === "w" ? -0.15 : 0.15;
    if (horizontal) {
      const g = new THREE.PlaneGeometry(b - a, y1 - y0);
      g.translate((a + b) / 2, (y0 + y1) / 2, fixed + off);
      this.add(g, "glass");
      this.wall(a, y0 - 1, fixed + off - 0.1, b, y1, fixed + off + 0.1);
      for (let m = a; m <= b + 0.01; m += Math.max(2, (b - a) / Math.max(1, Math.round((b - a) / 3)))) {
        this.box(m - 0.08, y0, fixed + off - 0.12, m + 0.08, y1, fixed + off + 0.12, "trim");
      }
      this.box(a, y0 - 0.12, fixed + off - 0.25, b, y0, fixed + off + 0.25, "trim");
      this.box(a, y1, fixed + off - 0.2, b, y1 + 0.15, fixed + off + 0.2, "trim");
    } else {
      const g = new THREE.PlaneGeometry(b - a, y1 - y0);
      g.rotateY(Math.PI / 2);
      g.translate(fixed + off, (y0 + y1) / 2, (a + b) / 2);
      this.add(g, "glass");
      this.wall(fixed + off - 0.1, y0 - 1, a, fixed + off + 0.1, y1, b);
      for (let m = a; m <= b + 0.01; m += Math.max(2, (b - a) / Math.max(1, Math.round((b - a) / 3)))) {
        this.box(fixed + off - 0.12, y0, m - 0.08, fixed + off + 0.12, y1, m + 0.08, "trim");
      }
      this.box(fixed + off - 0.25, y0 - 0.12, a, fixed + off + 0.25, y0, b, "trim");
      this.box(fixed + off - 0.2, y1, a, fixed + off + 0.2, y1 + 0.15, b, "trim");
    }
  }

  /** Encadrement de porte : montants épais et seuil à rayures. */
  private doorFrame(side: Side, fixed: number, out: number, at: number, width: number, y: number, top: number): void {
    const a = at - width / 2;
    const b = at + width / 2;
    const d0 = Math.min(fixed, fixed + out) - 0.12;
    const d1 = Math.max(fixed, fixed + out) + 0.12;
    if (side === "n" || side === "s") {
      this.box(a - 0.25, y, d0, a, top + 0.25, d1, "trim");
      this.box(b, y, d0, b + 0.25, top + 0.25, d1, "trim");
      this.box(a, top, d0, b, top + 0.25, d1, "trim");
      this.box(a, y, d0, b, y + 0.02, d1, "hazard");
    } else {
      this.box(d0, y, a - 0.25, d1, top + 0.25, a, "trim");
      this.box(d0, y, b, d1, top + 0.25, b + 0.25, "trim");
      this.box(d0, top, a, d1, top + 0.25, b, "trim");
      this.box(d0, y, a, d1, y + 0.02, b, "hazard");
    }
  }

  // ------------------------------------------------------------ couloirs

  /**
   * Couloir au profil chanfreiné (4 m × 3,2 m), avec nervures, conduites et bandeaux lumineux.
   * `axis` donne la direction ; `c` la coordonnée de l'axe central ; de `a` à `b` le long de l'axe.
   */
  corridor(o: {
    axis: "x" | "z";
    c: number;
    a: number;
    b: number;
    y: number;
    floorMat?: MatKey;
    wall?: MatKey;
    light?: number;
    flicker?: number;
    ribs?: boolean;
    /** Portes latérales : côté -1 (nord ou ouest) ou +1 (sud ou est), centre le long du couloir. */
    openings?: { side: -1 | 1; at: number; width: number }[];
    /** Extrémités fermées par une cloison. */
    caps?: ("a" | "b")[];
  }): void {
    const W = 2;
    const H = 3.2;
    const C = 0.7;
    const a = Math.min(o.a, o.b);
    const b = Math.max(o.a, o.b);
    const len = b - a;
    const wall = o.wall ?? "hull";
    // Coupe du couloir dans le plan (u = travers, v = hauteur).
    const profile: [number, number][] = [
      [-W, 0],
      [W, 0],
      [W, H - C],
      [W - C, H],
      [-W + C, H],
      [-W, H - C],
    ];
    const toWorld = (u: number, v: number, s: number) => (o.axis === "x" ? new THREE.Vector3(s, o.y + v, o.c + u) : new THREE.Vector3(o.c + u, o.y + v, s));
    const inside = toWorld(0, H / 2, (a + b) / 2);
    const strips: { i: number; mat: MatKey }[] = [
      { i: 2, mat: "hullDark" },
      { i: 3, mat: "ceiling" },
      { i: 4, mat: "hullDark" },
    ];
    for (const s of strips) {
      const [u0, v0] = profile[s.i]!;
      const [u1, v1] = profile[(s.i + 1) % profile.length]!;
      this.quad(toWorld(u0, v0, a), toWorld(u1, v1, a), toWorld(u1, v1, b), toWorld(u0, v0, b), s.mat, inside);
    }
    // Parois verticales, découpées autour des portes latérales.
    const DOOR_TOP = 2.3;
    const ops = o.openings ?? [];
    for (const side of [-1, 1] as const) {
      const u = side * W;
      const mine = ops.filter((op) => op.side === side).sort((p, q) => p.at - q.at);
      let cursor = a;
      const wallPiece = (s0: number, s1: number, v0: number, v1: number, collide: boolean) => {
        if (s1 - s0 < 0.01) return;
        this.quad(toWorld(u, v0, s0), toWorld(u, v1, s0), toWorld(u, v1, s1), toWorld(u, v0, s1), wall, inside);
        if (!collide) return;
        const p0 = toWorld(u - side * 0.05, 0, s0);
        const p1 = toWorld(u + side * 0.3, 0, s1);
        this.wall(p0.x, o.y + v0, p0.z, p1.x, o.y + v1, p1.z);
      };
      for (const op of mine) {
        wallPiece(cursor, op.at - op.width / 2, 0, H - C, true);
        wallPiece(op.at - op.width / 2, op.at + op.width / 2, DOOR_TOP, H - C, false);
        cursor = op.at + op.width / 2;
      }
      wallPiece(cursor, b, 0, H - C, true);
    }
    for (const cap of o.caps ?? []) {
      const s0 = cap === "a" ? a - 0.3 : b;
      const s1 = cap === "a" ? a : b + 0.3;
      const p0 = toWorld(-W - 0.3, 0, s0);
      const p1 = toWorld(W + 0.3, H + 0.2, s1);
      this.box(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, "hullDark", true);
    }
    // Sol : caillebotis au centre, plaques sur les côtés.
    const fm = o.floorMat ?? "grate";
    if (o.axis === "x") {
      this.box(a, o.y - 0.25, o.c - W, b, o.y, o.c + W, fm);
      this.box(a, o.y, o.c - W, b, o.y + 0.04, o.c - W + 0.6, "hullDark");
      this.box(a, o.y, o.c + W - 0.6, b, o.y + 0.04, o.c + W, "hullDark");
      this.floor(a, o.c - W, b, o.c + W, o.y);
    } else {
      this.box(o.c - W, o.y - 0.25, a, o.c + W, o.y, b, fm);
      this.box(o.c - W, o.y, a, o.c - W + 0.6, o.y + 0.04, b, "hullDark");
      this.box(o.c + W - 0.6, o.y, a, o.c + W, o.y + 0.04, b, "hullDark");
      this.floor(o.c - W, a, o.c + W, b, o.y);
    }
    // Nervures : anneaux qui suivent le profil, tous les 2,5 m.
    if (o.ribs !== false) {
      const ring = new THREE.Shape(profile.map(([u, v]) => new THREE.Vector2(u * 1.04, v * 1.02 - 0.03)));
      const inset = 0.16;
      ring.holes.push(
        new THREE.Path(
          [
            [-W + inset, 0.15],
            [W - inset, 0.15],
            [W - inset, H - C - 0.02],
            [W - C + 0.05, H - inset],
            [-W + C - 0.05, H - inset],
            [-W + inset, H - C - 0.02],
          ].map(([u, v]) => new THREE.Vector2(u!, v!)),
        ),
      );
      const ribGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.22, bevelEnabled: false });
      for (let s = a + 1.25; s < b - 0.3; s += 2.5) {
        if (ops.some((op) => Math.abs(op.at - s) < op.width / 2 + 0.3)) continue;
        const g = ribGeo.clone();
        if (o.axis === "x") {
          g.rotateY(Math.PI / 2);
          g.translate(s - 0.11, o.y, o.c);
        } else {
          g.translate(o.c, o.y, s - 0.11);
        }
        this.add(g, "trim");
      }
    }
    // Conduites le long des chanfreins.
    for (const side of [-1, 1]) {
      for (const k of [0, 1]) {
        const u = side * (W - 0.32 - k * 0.22);
        const v = H - C - 0.05 + k * 0.22;
        this.cylinder(toWorld(u, v, a), toWorld(u, v, b), 0.07 + k * 0.02, k ? "metal" : "hullDark", 8);
      }
    }
    // Bandeaux lumineux au plafond, et un point de lumière tous les 7,5 m.
    const lamp: MatKey = o.light === 0xff2a1a ? "lampRed" : "lampCold";
    for (let s = a + 2.5; s < b - 1; s += 5) {
      const p0 = toWorld(-0.25, H - 0.06, s - 0.8);
      const p1 = toWorld(0.25, H - 0.02, s + 0.8);
      this.box(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, lamp);
    }
    for (let s = a + 3.75; s < b; s += 7.5) {
      const p = toWorld(0, H - 0.4, s);
      this.light(p.x, p.y, p.z, o.light ?? 0xd6e4ff, 5, 11, o.flicker ?? 0);
    }
    void len;
  }

  /** Quadrilatère dont la face regarde vers `inside`. */
  quad(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, mat: MatKey, inside: THREE.Vector3): void {
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p3, p0)).normalize();
    const center = p0.clone().add(p2).multiplyScalar(0.5);
    let pts = [p0, p1, p2, p0, p2, p3];
    if (n.dot(inside.clone().sub(center)) < 0) {
      pts = [p0, p2, p1, p0, p3, p2];
      n.negate();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(pts.flatMap(() => [n.x, n.y, n.z]), 3));
    this.add(g, mat);
  }

  // ------------------------------------------------------------ circulations verticales et garde-corps

  /** Escalier droit le long de z (ou x), praticable, avec son dessous plein. */
  stairs(o: { axis: "x" | "z"; c0: number; c1: number; a: number; b: number; y0: number; y1: number; rails?: boolean }): void {
    const steps = Math.max(2, Math.round((o.y1 - o.y0) / 0.2));
    const run = o.b - o.a;
    const rise = o.y1 - o.y0;
    for (let i = 0; i < steps; i++) {
      const s0 = o.a + (run * i) / steps;
      const s1 = o.a + (run * (i + 1)) / steps;
      const top = o.y0 + (rise * (i + 1)) / steps;
      if (o.axis === "z") {
        this.box(o.c0, top - 0.06, s0, o.c1, top, s1, "grate");
        this.box(o.c0, top - 0.2, s0, o.c1, top - 0.06, Math.min(s0, s1) + 0.04, "hazard");
      } else {
        this.box(s0, top - 0.06, o.c0, s1, top, o.c1, "grate");
      }
    }
    // Limons et dessous de l'escalier.
    const ramp = (t: number) => o.y0 + rise * Math.min(1, Math.max(0, t));
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const s0 = o.a + (run * i) / segs;
      const s1 = o.a + (run * (i + 1)) / segs;
      const h0 = ramp((s0 - o.a) / run);
      const h1 = ramp((s1 - o.a) / run);
      const lo = Math.min(h0, h1);
      if (o.axis === "z") {
        this.box(o.c0 - 0.12, Math.max(o.y0, lo - 0.6), s0, o.c0, Math.max(h0, h1), s1, "trim");
        this.box(o.c1, Math.max(o.y0, lo - 0.6), s0, o.c1 + 0.12, Math.max(h0, h1), s1, "trim");
        // Bloc plein sous les marches, pour ne pas passer dessous.
        if (lo - o.y0 > 1.2) this.wall(o.c0, o.y0, Math.min(s0, s1), o.c1, lo - 0.6, Math.max(s0, s1));
      } else {
        this.box(s0, Math.max(o.y0, lo - 0.6), o.c0 - 0.12, s1, Math.max(h0, h1), o.c0, "trim");
        this.box(s0, Math.max(o.y0, lo - 0.6), o.c1, s1, Math.max(h0, h1), o.c1 + 0.12, "trim");
        if (lo - o.y0 > 1.2) this.wall(Math.min(s0, s1), o.y0, o.c0, Math.max(s0, s1), lo - 0.6, o.c1);
      }
    }
    if (o.axis === "z") this.floor(o.c0, o.a, o.c1, o.b, (_x, z) => ramp((z - o.a) / run));
    else this.floor(o.a, o.c0, o.b, o.c1, (x) => ramp((x - o.a) / run));
    if (o.rails !== false) {
      for (const c of [o.c0, o.c1]) {
        const p0 = o.axis === "z" ? new THREE.Vector3(c, o.y0 + 1, o.a) : new THREE.Vector3(o.a, o.y0 + 1, c);
        const p1 = o.axis === "z" ? new THREE.Vector3(c, o.y1 + 1, o.b) : new THREE.Vector3(o.b, o.y1 + 1, c);
        this.cylinder(p0, p1, 0.035, "metal", 6);
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          const p = p0.clone().lerp(p1, t);
          this.cylinder(p, p.clone().setY(p.y - 1), 0.025, "metal", 6);
        }
        // Garde-corps qu'on ne peut pas enjamber.
        for (let i = 0; i < segs; i++) {
          const s0 = o.a + (run * i) / segs;
          const s1 = o.a + (run * (i + 1)) / segs;
          const hh = ramp((Math.max(s0, s1) - o.a) / run);
          if (o.axis === "z") this.wall(c - 0.06, ramp((s0 - o.a) / run) - 0.3, Math.min(s0, s1), c + 0.06, hh + 1.1, Math.max(s0, s1));
          else this.wall(Math.min(s0, s1), ramp((s0 - o.a) / run) - 0.3, c - 0.06, Math.max(s0, s1), hh + 1.1, c + 0.06);
        }
      }
    }
  }

  /** Garde-corps vitré entre deux points (horizontal), avec sa collision. */
  railing(x0: number, z0: number, x1: number, z1: number, y: number): void {
    const a = new THREE.Vector3(x0, y + 1.05, z0);
    const b = new THREE.Vector3(x1, y + 1.05, z1);
    this.cylinder(a, b, 0.045, "metal", 8);
    this.cylinder(a.clone().setY(y + 0.1), b.clone().setY(y + 0.1), 0.03, "metal", 6);
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      this.cylinder(p.clone().setY(y), p, 0.04, "trim", 6);
    }
    const horizontal = Math.abs(z1 - z0) < Math.abs(x1 - x0);
    if (horizontal) {
      const g = new THREE.PlaneGeometry(len, 0.9);
      g.translate((x0 + x1) / 2, y + 0.55, z0);
      this.add(g, "glass");
      this.wall(Math.min(x0, x1), y - 0.5, z0 - 0.08, Math.max(x0, x1), y + 1.1, z0 + 0.08);
    } else {
      const g = new THREE.PlaneGeometry(len, 0.9);
      g.rotateY(Math.PI / 2);
      g.translate(x0, y + 0.55, (z0 + z1) / 2);
      this.add(g, "glass");
      this.wall(x0 - 0.08, y - 0.5, Math.min(z0, z1), x0 + 0.08, y + 1.1, Math.max(z0, z1));
    }
  }

  /** Dalle praticable (passerelle, balcon). */
  slab(x0: number, z0: number, x1: number, z1: number, y: number, mat: MatKey = "grate", thickness = 0.4): void {
    this.box(x0, y - thickness, z0, x1, y, z1, mat);
    this.box(x0, y - thickness - 0.05, z0, x1, y - thickness, z1, "trim");
    this.floor(x0, z0, x1, z1, y);
  }

  // ------------------------------------------------------------ assemblage

  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.mats[mat].material);
      mesh.matrixAutoUpdate = false;
      if (mat === "glass") mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.parts.clear();
    group.add(this.dynamic);
    return group;
  }
}
