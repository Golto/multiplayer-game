// Plan de la station. Deux secteurs reliés par une navette :
//  - le Spatioport (x ≈ 0) : sas d'amarrage, hall des arrivées, poste de sécurité, quai A ;
//  - l'Habitation (x ≈ 300) : quai B, atrium sur trois niveaux, centre médical, logements, salon panorama.
// Unités : mètres. x vers l'est, z vers le sud, y vers le haut.

import * as THREE from "three";
import { Kit, type MatKey, type Side } from "./kit";
import { Door, Elevator, Screen, Tram } from "./dynamic";
import type { StationAudio } from "./audio";
import * as P from "./props";
import * as T from "./textures";

export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface World {
  kit: Kit;
  tram: Tram;
  elevators: Elevator[];
  spots: Record<string, Spot>;
}

const SPATIO = "#c98a2e";
const TRANSIT = "#5f8f9a";
const HABITAT = "#8aa26a";
const MEDIC = "#b5532f";

/** Yaw pour regarder vers un côté (la caméra regarde vers -z quand yaw = 0). */
const yawFor: Record<Side, number> = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };

function signPlate(kit: Kit, text: string, pos: THREE.Vector3, facing: Side, w: number, h: number, opts: T.SignOptions = {}, glow = 0.7): void {
  kit.plate(T.sign(text, { width: Math.round(256 * (w / h)), height: 256, ...opts }), w, h, pos, facing, glow);
}

function door(kit: Kit, audio: StationAudio, side: Side, fixed: number, at: number, y: number, width = 2.4, height = 2.7): void {
  kit.updatables.push(new Door(kit, audio, { side, fixed, at, width, y, height }));
}

export function buildWorld(audio: StationAudio): World {
  const kit = new Kit();
  const elevators: Elevator[] = [];

  // ================================================================ SPATIOPORT

  // --- Sas d'amarrage : là où l'on débarque de la navette spatiale.
  kit.room({
    x0: -27,
    x1: -17,
    z0: -4,
    z1: 4,
    y: 0,
    h: 3.6,
    wall: "hullDark",
    floorMat: "grate",
    openings: [
      { side: "e", at: 0, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: "w", at: 0, width: 3.5, bottom: 0.9, top: 2.6, kind: "window" },
    ],
  });
  door(kit, audio, "e", -17, 0, 0);
  kit.area({ name: "Sas d'amarrage", sub: "Spatioport · Quai 3", x0: -27, x1: -17, z0: -4, z1: 4, y0: -1, y1: 4, zone: SPATIO });
  P.ceilingPanel(kit, -22, 3.6, -1.5, 1.2, 0.5, "lampRed", 0xff3020, 3.5, 9);
  P.ceilingPanel(kit, -22, 3.6, 1.5, 1.2, 0.5, "lampCold", 0xdfeaff, 3, 9, 0.6);
  P.lockers(kit, -22, 0, -3.65, "s", 6);
  P.crates(kit, -24.5, 0, 2.6, 4, 7);
  P.terminal(kit, -18.2, 0, 3.4, "n", "SAS 3 - PRESSURISATION", ["PRESSION ... 101.2 kPa", "O2 ......... 20.9 %", "TEMP ....... 18.4 C", "PORTE EXT .. VERROUILLEE", "BIENVENUE A SEBASTOPOL"], 3);
  signPlate(kit, "SAS 3", new THREE.Vector3(-17.05, 3.05, 0), "w", 1.4, 0.45, { fg: "#ffcf6b", border: "#ffcf6b" });
  signPlate(kit, "ATTENTION — VIDE SPATIAL", new THREE.Vector3(-26.95, 2.95, 0), "e", 2.6, 0.32, { fg: "#151515", bg: "#d8a21c" }, 0.4);

  // --- Couloir vers le hall.
  kit.corridor({ axis: "x", c: 0, a: -17, b: -15, y: 0, ribs: false });

  // --- Hall des arrivées : grande salle, baie panoramique au nord.
  kit.room({
    x0: -15,
    x1: 15,
    z0: -12,
    z1: 12,
    y: 0,
    h: 9,
    wall: "hull",
    floorMat: "tiles",
    openings: [
      { side: "n", at: 0, width: 26, bottom: 1.0, top: 7.6, kind: "window" },
      { side: "w", at: 0, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: "e", at: 0, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: "s", at: 0, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
    ],
  });
  door(kit, audio, "w", -15, 0, 0);
  door(kit, audio, "e", 15, 0, 0);
  door(kit, audio, "s", 12, 0, 0);
  kit.area({ name: "Hall des arrivées", sub: "Spatioport", x0: -15, x1: 15, z0: -12, z1: 12, y0: -1, y1: 9, zone: SPATIO });
  for (const px of [-7.5, 7.5]) for (const pz of [-4, 5]) P.pillar(kit, px, 0, pz, 9);
  for (const hx of [-9, 0, 9]) for (const hz of [-6, 3]) P.hangingLamp(kit, hx, 9, hz, 2.6, 0xffc27a, 6, 15);
  // Rangées de banquettes face à la baie.
  for (const bx of [-10, -3.5, 3.5, 10]) {
    P.bench(kit, bx, 0, -7.2, "n", 4);
    P.bench(kit, bx, 0, -3.2, "n", 4);
  }
  P.planter(kit, -12.5, 0, -10.5, 1.2);
  P.planter(kit, 12.5, 0, -10.5, 1.2);
  P.planter(kit, -12.5, 0, 9.5, 1);
  P.planter(kit, 12.5, 0, 9.5, 1);
  P.vending(kit, -14.4, 0, 7, "e");
  P.vending(kit, -14.4, 0, 8.4, "e", "lampAmber");
  P.kiosk(kit, 4, 0, 8.5, "n", "INFORMATIONS", ["SPATIOPORT ..... NIV 1", "TRANSIT ........ SUD", "SECURITE ....... EST", "HABITATION ..... LIGNE A", "MEDICAL ........ LIGNE A", "", "BON SEJOUR !"], 4);
  // Tableau des départs au-dessus de la porte sud.
  kit.box(-6, 3.4, 11.6, 6, 6.2, 12, "hullDark");
  new Screen(kit, {
    pos: new THREE.Vector3(0, 4.8, 11.58),
    facing: "n",
    w: 5.6,
    h: 2.4,
    title: "DEPARTS  /  ARRIVEES",
    lines: ["CARGO KOVAC-7    QUAI 1  RETARDE", "NAVETTE TORRENS  QUAI 3  A QUAI", "MINEUR ASH-12    QUAI 2  ANNULE", "TRANSIT LIGNE A  QUAI T  A L'HEURE", "NAVETTE ODIN     QUAI 4  --:--", "", "STATION SEBASTOPOL  -  BIENVENUE"],
    color: "#ffb347",
    seed: 9,
  });
  signPlate(kit, "SÉBASTOPOL", new THREE.Vector3(0, 8.1, -11.6), "s", 8, 0.9, { fg: "#e9e2cf", sub: "STATION ORBITALE · SPATIOPORT", bg: "#202220" }, 0.6);
  signPlate(kit, "TRANSIT", new THREE.Vector3(0, 3.15, 11.65), "n", 2.6, 0.5, { fg: "#9fd8e0", arrow: "down", bg: "#16201f" });
  signPlate(kit, "SÉCURITÉ", new THREE.Vector3(14.65, 3.15, 0), "w", 2.6, 0.5, { fg: "#e9e2cf", arrow: "right", bg: "#1b1d1b" });
  signPlate(kit, "QUAIS D'AMARRAGE", new THREE.Vector3(-14.65, 3.15, 0), "e", 3.2, 0.5, { fg: "#ffcf6b", arrow: "left", bg: "#1b1d1b" });
  // Bandeaux lumineux au sol, le long des murs.
  kit.box(-14.9, 0, -11.9, 14.9, 0.06, -11.75, "lampAmber");
  kit.light(0, 1.2, -10.5, 0xffa040, 4, 14);

  // --- Couloir et poste de sécurité, à l'est.
  kit.corridor({ axis: "x", c: 0, a: 15, b: 27, y: 0, flicker: 0.5 });
  kit.area({ name: "Coursive est", sub: "Spatioport", x0: 15, x1: 27, z0: -2, z1: 2, y0: -1, y1: 4, zone: SPATIO });
  kit.room({
    x0: 27,
    x1: 37,
    z0: -6,
    z1: 6,
    y: 0,
    h: 3.4,
    wall: "hullDark",
    floorMat: "grate",
    openings: [{ side: "w", at: 0, width: 2.4, bottom: 0, top: 2.7, kind: "door" }],
  });
  door(kit, audio, "w", 27, 0, 0);
  kit.area({ name: "Poste de sécurité", sub: "Spatioport", x0: 27, x1: 37, z0: -6, z1: 6, y0: -1, y1: 4, zone: SPATIO });
  P.monitorBank(kit, 32, 0, -5.3, "s", 4);
  P.lockers(kit, 36.6, 0, 0, "w", 6);
  P.desk(kit, 30, 0, 2.5, "n", "REGISTRE", ["ENTREES ..... 3", "SORTIES ..... 0", "INCIDENTS ... 1", "VOIR RAPPORT 117"], 12);
  P.crates(kit, 35, 0, 4.5, 3, 4);
  P.ceilingPanel(kit, 30, 3.4, -2, 1.4, 0.5, "lampCold", 0xdfeaff, 3.5, 9, 0.8);
  P.ceilingPanel(kit, 34, 3.4, 2, 1.4, 0.5, "lampCold", 0xdfeaff, 3, 9);
  signPlate(kit, "SÉCURITÉ", new THREE.Vector3(27.05, 3.0, 0), "e", 1.8, 0.4, { fg: "#e9e2cf", bg: "#3a1410" });

  // --- Couloir vers le quai de transit A.
  kit.corridor({ axis: "z", c: 0, a: 12, b: 26, y: 0 });
  kit.area({ name: "Coursive sud", sub: "Spatioport", x0: -2, x1: 2, z0: 12, z1: 26, y0: -1, y1: 4, zone: SPATIO });

  // ================================================================ TRANSIT

  const TRACK_Z = 34;
  const tramCar = buildTramCar(kit);
  platform(kit, audio, 0, "Quai de transit A", "Spatioport", "HABITATION", "e");
  platform(kit, audio, 300, "Quai de transit B", "Habitation", "SPATIOPORT", "w");
  const tram = new Tram(kit, tramCar, audio, { z: TRACK_Z, y: 0, stops: [{ name: "le Spatioport", x: 0 }, { name: "l'Habitation", x: 300 }], doorSide: "n" });

  // Tunnel entre les deux quais.
  const t0 = 10;
  const t1 = 290;
  kit.box(t0, -1.6, TRACK_Z - 2.4, t1, -1.3, TRACK_Z + 2.4, "grate");
  kit.box(t0, -1.6, TRACK_Z - 2.6, t1, 4.2, TRACK_Z - 2.4, "hullDark");
  kit.box(t0, -1.6, TRACK_Z + 2.4, t1, 4.2, TRACK_Z + 2.6, "hullDark");
  kit.box(t0, 4.2, TRACK_Z - 2.6, t1, 4.4, TRACK_Z + 2.6, "hullDark");
  for (const rz of [TRACK_Z - 0.8, TRACK_Z + 0.8]) kit.box(t0 - 20, -1.3, rz - 0.06, t1 + 20, -1.15, rz + 0.06, "metal");
  for (let x = t0 + 6; x < t1; x += 12) {
    kit.box(x - 0.6, 3.6, TRACK_Z - 2.39, x + 0.6, 3.75, TRACK_Z - 2.3, x % 36 < 12 ? "lampAmber" : "lampCold");
    kit.box(x - 0.15, -1.2, TRACK_Z + 2.3, x + 0.15, 3.6, TRACK_Z + 2.4, "trim");
  }
  for (let x = t0 + 18; x < t1; x += 36) kit.light(x, 3.2, TRACK_Z - 1.8, 0xffa040, 4, 12);
  kit.area({ name: "Tunnel de transit", sub: "Ligne A", x0: t0, x1: t1, z0: TRACK_Z - 2.4, z1: TRACK_Z + 2.4, y0: -2, y1: 5, zone: TRANSIT });

  // ================================================================ HABITATION

  const AX = 300;
  // --- Couloir du quai B vers l'atrium.
  kit.corridor({ axis: "z", c: AX, a: 10, b: 26, y: 0, wall: "hullCream" });
  kit.area({ name: "Coursive de l'atrium", sub: "Habitation · Niveau 1", x0: AX - 2, x1: AX + 2, z0: 10, z1: 26, y0: -1, y1: 4, zone: HABITAT });

  // --- Atrium : trois niveaux autour d'un vide central.
  const L = [0, 6, 12];
  kit.room({
    x0: AX - 10,
    x1: AX + 10,
    z0: -10,
    z1: 10,
    y: 0,
    h: 18,
    wall: "hullCream",
    floorMat: "tiles",
    openings: [
      { side: "s", at: AX, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: "w", at: 0, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: "e", at: 0, width: 2.4, bottom: L[1]!, top: L[1]! + 2.7, kind: "door" },
      { side: "n", at: AX, width: 2.4, bottom: L[2]!, top: L[2]! + 2.7, kind: "door" },
      { side: "n", at: AX - 6, width: 4, bottom: 1.4, top: 4.6, kind: "window" },
      { side: "n", at: AX + 6, width: 4, bottom: 1.4, top: 4.6, kind: "window" },
    ],
  });
  door(kit, audio, "s", 10, AX, 0);
  door(kit, audio, "w", AX - 10, 0, 0);
  door(kit, audio, "e", AX + 10, 0, L[1]!);
  door(kit, audio, "n", -10, AX, L[2]!);
  const levelNames = ["niveau 1", "niveau 2", "niveau 3"];
  L.forEach((y, i) => {
    kit.area({ name: "Atrium", sub: `Habitation · Niveau ${i + 1}`, x0: AX - 10, x1: AX + 10, z0: -10, z1: 10, y0: y - 1, y1: y + 5.5, zone: HABITAT });
  });

  // Balcons des niveaux 2 et 3.
  const V0 = AX - 6;
  const V1 = AX + 6;
  for (const y of [L[1]!, L[2]!]) {
    kit.slab(AX - 10, -10, AX + 10, -6, y, "tiles");
    kit.slab(AX - 10, 6, AX + 10, 10, y, "tiles");
    kit.slab(AX - 10, -6, V0, 6, y, "tiles");
    kit.slab(V1, -6, AX + 10, 6, y, "tiles");
    // Néons ambrés sous les bords des balcons.
    kit.box(V0, y - 0.48, -6.05, V1, y - 0.44, -5.95, "lampAmber");
    kit.box(V0, y - 0.48, 5.95, V1, y - 0.44, 6.05, "lampAmber");
    kit.box(V0 - 0.05, y - 0.48, -6, V0 + 0.05, y - 0.44, 6, "lampAmber");
    kit.box(V1 - 0.05, y - 0.48, -6, V1 + 0.05, y - 0.44, 6, "lampAmber");
    // Lumières sous les balcons, pour le niveau d'en dessous.
    for (const [lx, lz] of [
      [AX - 8, -8],
      [AX + 8, -8],
      [AX - 8, 8],
      [AX + 8, 8],
      [AX, -8],
      [AX, 8],
    ] as const) {
      P.ceilingPanel(kit, lx, y - 0.4, lz, 1, 0.5, "lampWarm", 0xffc27a, 3.5, 9);
    }
  }
  // Garde-corps, avec les passages pour les escaliers et les passerelles d'ascenseur.
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number) => kit.railing(x0, z0, x1, z1, y);
  // Niveau 2.
  rail(V0 + 2, -6, AX - 1, -6, L[1]!);
  rail(AX + 1, -6, V1 - 2, -6, L[1]!);
  rail(V0, 6, V1, 6, L[1]!);
  rail(V0, -6, V0, 6, L[1]!);
  rail(V1, -6, V1, 6, L[1]!);
  // Niveau 3.
  rail(V0, -6, AX - 1, -6, L[2]!);
  rail(AX + 1, -6, V1, -6, L[2]!);
  rail(V0 + 2, 6, V1, 6, L[2]!);
  rail(V0, -6, V0, 6, L[2]!);
  rail(V1, -6, V1, 6, L[2]!);

  // Escaliers : du sol au niveau 2 côté est, du niveau 2 au niveau 3 côté ouest.
  kit.stairs({ axis: "z", c0: V1 - 2, c1: V1, a: 6, b: -6, y0: 0, y1: L[1]! });
  kit.stairs({ axis: "z", c0: V0, c1: V0 + 2, a: -6, b: 6, y0: L[1]!, y1: L[2]! });

  // Ascenseur vitré au centre, relié aux balcons nord par des passerelles.
  const elevator = new Elevator(kit, audio, { x0: AX - 1.5, x1: AX + 1.5, z0: -1.5, z1: 1.5, levels: L, entry: "n", name: "Atrium", levelNames });
  elevators.push(elevator);
  for (const y of [L[1]!, L[2]!]) {
    kit.slab(AX - 1, -6, AX + 1, -1.5, y, "grate", 0.3);
    rail(AX - 1, -6, AX - 1, -1.6, y);
    rail(AX + 1, -6, AX + 1, -1.6, y);
  }

  // Décor de l'atrium.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) P.ceilingPanel(kit, AX - 7.5 + i * 5, 18, -7.5 + j * 5, 2.2, 2.2, "lampCold", 0xdfeaff, 6, 18);
  }
  P.planter(kit, AX - 4, 0, 4, 1.4);
  P.planter(kit, AX + 2.5, 0, 4, 1.4);
  P.planter(kit, AX - 4, 0, -4, 1.4);
  P.bench(kit, AX - 8.6, 0, 3, "e", 3);
  P.bench(kit, AX - 8.6, 0, -3.5, "e", 3);
  P.bench(kit, AX, 0, 8.6, "n", 3);
  P.kiosk(kit, AX + 7, 0, 7.5, "n", "HABITATION", ["NIV 1 .. MEDICAL  (OUEST)", "NIV 2 .. LOGEMENTS (EST)", "NIV 3 .. SALON PANORAMA", "", "COUVRE-FEU 23H00", "EAU CHAUDE : 6H-8H"], 5);
  P.vending(kit, AX + 9.4, 0, -3, "w");
  P.vending(kit, AX + 9.4, L[1]!, -3, "w", "lampAmber");
  P.vending(kit, AX - 9.4, L[2]!, 3, "e");
  // Grandes bannières suspendues.
  signPlate(kit, "HABITATION", new THREE.Vector3(AX, 16.2, 9.6), "n", 9, 1.3, { fg: "#e9e2cf", sub: "SECTEUR 2 · RÉSIDENCES", bg: "#3b2a1c" }, 0.5);
  signPlate(kit, "MÉDICAL", new THREE.Vector3(AX - 9.62, 3.2, 0), "e", 2.2, 0.5, { fg: "#ffd6c9", arrow: "left", bg: "#5a1f12" });
  signPlate(kit, "LOGEMENTS", new THREE.Vector3(AX + 9.62, L[1]! + 3.2, 0), "w", 2.6, 0.5, { fg: "#e9e2cf", arrow: "right", bg: "#2b2a24" });
  signPlate(kit, "SALON PANORAMA", new THREE.Vector3(AX, L[2]! + 3.2, -9.62), "s", 3.2, 0.5, { fg: "#ffcf6b", arrow: "up", bg: "#2b2a24" });
  signPlate(kit, "TRANSIT", new THREE.Vector3(AX, 3.2, 9.62), "n", 2.2, 0.5, { fg: "#9fd8e0", arrow: "down", bg: "#16201f" });
  for (let i = 0; i < 3; i++) {
    signPlate(kit, `NIVEAU ${i + 1}`, new THREE.Vector3(AX + 1.6, L[i]! + 2.6, -1.55), "n", 1.2, 0.3, { fg: "#ffcf6b", bg: "#1b1d1b" }, 0.6);
  }

  // --- Centre médical, à l'ouest du niveau 1.
  kit.corridor({ axis: "x", c: 0, a: AX - 24, b: AX - 10, y: 0, wall: "hullCream", floorMat: "tilesMed" });
  kit.area({ name: "Coursive médicale", sub: "Habitation · Niveau 1", x0: AX - 24, x1: AX - 10, z0: -2, z1: 2, y0: -1, y1: 4, zone: MEDIC });
  const MX0 = AX - 42;
  const MX1 = AX - 24;
  kit.room({
    x0: MX0,
    x1: MX1,
    z0: -9,
    z1: 9,
    y: 0,
    h: 3.6,
    wall: "hullCream",
    floorMat: "tilesMed",
    openings: [
      { side: "e", at: 0, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: "w", at: 0, width: 8, bottom: 1.1, top: 2.6, kind: "window" },
    ],
  });
  door(kit, audio, "e", MX1, 0, 0);
  kit.area({ name: "Centre médical", sub: "Habitation · Niveau 1", x0: MX0, x1: MX1, z0: -9, z1: 9, y0: -1, y1: 4, zone: MEDIC });
  for (let i = 0; i < 4; i++) {
    const bx = MX0 + 3 + i * 3.4;
    P.medBed(kit, bx, 0, -7.3, "s");
    // Rail de rideau au plafond.
    kit.box(bx - 1.5, 3.3, -8.8, bx - 1.45, 3.35, -5.6, "metal");
    kit.box(bx - 1.5, 3.3, -5.65, bx + 1.5, 3.35, -5.6, "metal");
    P.ceilingPanel(kit, bx, 3.6, -7, 1, 0.5, "lampCold", 0xe8f4ff, 2.6, 7, i === 2 ? 0.9 : 0);
  }
  // Paillasse de laboratoire et négatoscopes.
  kit.box(MX0 + 2, 0, 7.6, MX0 + 12, 0.92, 8.8, "plasticWhite", true);
  kit.box(MX0 + 2, 0.92, 7.5, MX0 + 12, 0.97, 8.85, "metal");
  for (let i = 0; i < 4; i++) {
    kit.box(MX0 + 2.6 + i * 2.4, 1.6, 8.95, MX0 + 4.2 + i * 2.4, 2.6, 8.98, "lampCold");
    kit.box(MX0 + 2.5 + i * 2.4, 1.5, 8.98, MX0 + 4.3 + i * 2.4, 2.7, 9, "trim");
  }
  kit.light(MX0 + 7, 2, 8.2, 0xe8f4ff, 3, 8);
  P.terminal(kit, MX0 + 14.5, 0, 8.2, "n", "DIAGNOSTIC", ["PATIENT ..... ANONYME", "POULS ....... 72", "TENSION ..... 12/8", "ANALYSES .... EN COURS", "RESULTAT .... ???"], 21);
  // Accueil près de l'entrée.
  kit.box(MX1 - 4, 0, 2.2, MX1 - 3.2, 1.1, 6, "hullCream", true);
  kit.box(MX1 - 4.1, 1.1, 2.1, MX1 - 3.1, 1.16, 6.1, "plasticWhite");
  P.desk(kit, MX1 - 5.5, 0, 4, "e", "ACCUEIL", ["RENDEZ-VOUS ... 0", "LITS LIBRES ... 3/4", "DR. ENSIGN ... ABSENT"], 22);
  P.lockers(kit, MX0 + 0.35, 0, 5.5, "e", 4);
  P.planter(kit, MX1 - 1, 0, 7.8, 0.9);
  P.ceilingPanel(kit, MX1 - 6, 3.6, 4, 1.4, 0.5, "lampCold", 0xe8f4ff, 3, 9);
  P.ceilingPanel(kit, MX0 + 6, 3.6, 3, 1.4, 0.5, "lampCold", 0xe8f4ff, 3, 9);
  // Lampe d'opération.
  kit.cylinder(new THREE.Vector3(MX0 + 9, 3.6, 2), new THREE.Vector3(MX0 + 9, 2.6, 2), 0.04, "metal", 6);
  kit.cylinder(new THREE.Vector3(MX0 + 9, 2.6, 2), new THREE.Vector3(MX0 + 9, 2.45, 2), 0.55, "plasticWhite", 20);
  kit.cylinder(new THREE.Vector3(MX0 + 9, 2.44, 2), new THREE.Vector3(MX0 + 9, 2.43, 2), 0.45, "lampCold", 20);
  kit.box(MX0 + 8, 0, 1.2, MX0 + 10, 0.85, 2.8, "plasticWhite", true);
  kit.box(MX0 + 7.9, 0.85, 1.1, MX0 + 10.1, 0.95, 2.9, "tilesMed");
  signPlate(kit, "CENTRE MÉDICAL", new THREE.Vector3(MX1 + 0.05, 3.15, 0), "e", 2.6, 0.45, { fg: "#ffd6c9", bg: "#5a1f12" });

  // --- Logements, à l'est du niveau 2.
  const Y2 = L[1]!;
  kit.corridor({
    axis: "x",
    c: 0,
    a: AX + 10,
    b: AX + 42,
    y: Y2,
    wall: "hullCream",
    floorMat: "carpet",
    flicker: 0.3,
    openings: [
      { side: -1, at: AX + 18, width: 1.6 },
      { side: -1, at: AX + 32, width: 1.6 },
      { side: 1, at: AX + 25, width: 1.6 },
    ],
    caps: ["b"],
  });
  kit.area({ name: "Coursive des logements", sub: "Habitation · Niveau 2", x0: AX + 10, x1: AX + 42, z0: -2, z1: 2, y0: Y2 - 1, y1: Y2 + 4, zone: HABITAT });
  signPlate(kit, "FIN DE SECTION", new THREE.Vector3(AX + 41.95, Y2 + 2.2, 0), "w", 2, 0.4, { fg: "#ff8a6a", bg: "#1b1d1b" });
  kit.box(AX + 41.7, Y2 + 2.6, -0.3, AX + 41.95, Y2 + 2.75, 0.3, "lampRed");
  kit.light(AX + 41, Y2 + 2.5, 0, 0xff3020, 2.5, 7, 0.4);
  apartment(kit, audio, AX + 18, Y2, "n", "A-201", 1);
  apartment(kit, audio, AX + 32, Y2, "n", "A-203", 2);
  apartment(kit, audio, AX + 25, Y2, "s", "A-202", 3);

  // --- Salon panorama, au nord du niveau 3.
  const Y3 = L[2]!;
  kit.corridor({ axis: "z", c: AX, a: -24, b: -10, y: Y3, wall: "hullCream", floorMat: "carpet" });
  kit.area({ name: "Coursive du salon", sub: "Habitation · Niveau 3", x0: AX - 2, x1: AX + 2, z0: -24, z1: -10, y0: Y3 - 1, y1: Y3 + 4, zone: HABITAT });
  kit.room({
    x0: AX - 14,
    x1: AX + 14,
    z0: -40,
    z1: -24,
    y: Y3,
    h: 6,
    wall: "hullCream",
    floorMat: "carpet",
    openings: [
      { side: "s", at: AX, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: "n", at: AX, width: 26, bottom: 0.7, top: 5.4, kind: "window" },
    ],
  });
  door(kit, audio, "s", -24, AX, Y3);
  kit.area({ name: "Salon panorama", sub: "Habitation · Niveau 3", x0: AX - 14, x1: AX + 14, z0: -40, z1: -24, y0: Y3 - 1, y1: Y3 + 6, zone: HABITAT });
  P.bar(kit, AX + 11.5, Y3, -32, "w", 8);
  for (const [sx, sz] of [
    [AX - 8, -35],
    [AX - 2, -35],
    [AX + 4, -35],
  ] as const) {
    P.sofa(kit, sx, Y3, sz, "n", 2.6);
    P.roundTable(kit, sx, Y3, sz - 1.6);
  }
  P.sofa(kit, AX - 11.5, Y3, -30, "e", 2.6);
  P.sofa(kit, AX - 6, Y3, -27.5, "n", 2.6);
  P.roundTable(kit, AX - 9, Y3, -30);
  P.planter(kit, AX - 13, Y3, -38.8, 1.2);
  P.planter(kit, AX + 13, Y3, -38.8, 1.2);
  P.planter(kit, AX - 13, Y3, -25.2, 1);
  // Télescope sur trépied, braqué sur la planète.
  const tx = AX + 6;
  const tz = -38;
  for (const a of [0, 2.1, 4.2]) kit.cylinder(new THREE.Vector3(tx + Math.cos(a) * 0.5, Y3, tz + Math.sin(a) * 0.5), new THREE.Vector3(tx, Y3 + 1.3, tz), 0.03, "metal", 6);
  kit.cylinder(new THREE.Vector3(tx, Y3 + 1.25, tz + 0.5), new THREE.Vector3(tx - 0.2, Y3 + 1.6, tz - 0.6), 0.12, "plasticWhite", 14);
  kit.wall(tx - 0.5, Y3, tz - 0.5, tx + 0.5, Y3 + 1.5, tz + 0.5);
  for (const hx of [AX - 8, AX, AX + 8]) P.hangingLamp(kit, hx, Y3 + 6, -30, 1.6, 0xffb060, 4.5, 13);
  kit.box(AX - 13.9, Y3, -39.9, AX + 13.9, Y3 + 0.05, -39.7, "lampAmber");
  signPlate(kit, "SALON PANORAMA", new THREE.Vector3(AX, Y3 + 4.4, -24.05), "n", 5, 0.8, { fg: "#ff6a4a", bg: "#140806", font: '"Share Tech Mono", monospace' }, 1.4);

  // ================================================================ Points de départ

  const spots: Record<string, Spot> = {
    sas: { x: -25, y: 0, z: 0, yaw: yawFor.e },
    hall: { x: 0, y: 0, z: 6, yaw: yawFor.n },
    securite: { x: 30, y: 0, z: 0, yaw: yawFor.n },
    quaiA: { x: 0, y: 0, z: 29, yaw: yawFor.s },
    quaiB: { x: AX, y: 0, z: 29, yaw: yawFor.s },
    atrium: { x: AX, y: 0, z: 7, yaw: yawFor.n },
    atrium2: { x: AX - 8, y: L[1]!, z: -8, yaw: yawFor.e - 0.5 },
    atrium3: { x: AX + 8, y: L[2]!, z: 8, yaw: yawFor.w + 0.7 },
    medical: { x: MX1 - 2, y: 0, z: -1, yaw: yawFor.w - 0.35 },
    logements: { x: AX + 14, y: Y2, z: 0, yaw: yawFor.e },
    salon: { x: AX, y: Y3, z: -26, yaw: yawFor.n },
    logement: { x: AX + 18.5, y: Y2, z: -3, yaw: yawFor.n + 0.4 },
    navette: { x: -3.5, y: 0, z: 34.3, yaw: yawFor.e },
    vue: { x: AX + 8, y: L[2]!, z: -8.5, yaw: yawFor.w + 0.35 },
  };

  return { kit, tram, elevators, spots };
}

// ---------------------------------------------------------------- quai de transit

function platform(kit: Kit, audio: StationAudio, x: number, name: string, sector: string, dest: string, tunnelSide: "e" | "w"): void {
  const TRACK_Z = 34;
  const edge = TRACK_Z - 1.6;
  kit.room({
    x0: x - 10,
    x1: x + 10,
    z0: 26,
    z1: 38,
    y: 0,
    h: 6,
    wall: "hullDark",
    floorMat: "tiles",
    noFloor: true,
    openings: [
      { side: "n", at: x, width: 2.4, bottom: 0, top: 2.7, kind: "door" },
      { side: tunnelSide, at: TRACK_Z, width: 5, bottom: -1.3, top: 4.2, kind: "gap" },
    ],
  });
  door(kit, audio, "n", 26, x, 0);
  // Quai praticable, voie en contrebas.
  kit.box(x - 10.3, -0.25, 25.7, x + 10.3, 0, edge, "tiles");
  kit.floor(x - 10, 26, x + 10, edge, 0);
  kit.box(x - 10, -0.02, edge - 0.5, x + 10, 0.01, edge, "hazard");
  kit.box(x - 10.3, -1.6, edge, x + 10.3, -1.3, 38.3, "grate");
  kit.box(x - 10.3, -1.3, edge - 0.05, x + 10.3, 0, edge, "hullDark");
  for (const rz of [TRACK_Z - 0.8, TRACK_Z + 0.8]) kit.box(x - 10, -1.3, rz - 0.06, x + 10, -1.15, rz + 0.06, "metal");
  // Parois de la fosse : fond, et extrémité opposée au tunnel.
  kit.box(x - 10.3, -1.6, 38, x + 10.3, 0, 38.3, "hullDark");
  const endX = tunnelSide === "e" ? x - 10.3 : x + 10;
  kit.box(endX, -1.6, edge, endX + 0.3, 0, 38.3, "hullDark");
  kit.box(tunnelSide === "e" ? x - 10 : x + 9.6, -1.3, TRACK_Z - 1.2, tunnelSide === "e" ? x - 9.6 : x + 10, -0.6, TRACK_Z + 1.2, "hazard");
  // Bord du quai hors de la zone de la voiture : toujours fermé.
  kit.wall(x - 10, 0, edge - 0.1, x - 5.6, 1.2, edge + 0.1);
  kit.wall(x + 5.6, 0, edge - 0.1, x + 10, 1.2, edge + 0.1);
  kit.area({ name, sub: `Transit · ${sector}`, x0: x - 10, x1: x + 10, z0: 26, z1: 38, y0: -2, y1: 6, zone: TRANSIT });
  for (const bx of [x - 6.5, x + 6.5]) P.bench(kit, bx, 0, 26.6, "s", 3);
  for (const lx of [x - 6, x, x + 6]) P.ceilingPanel(kit, lx, 6, 29, 2, 0.6, "lampCold", 0xdfeaff, 4.5, 12, lx === x + 6 ? 0.7 : 0);
  kit.light(x, 4.5, TRACK_Z, 0xffa040, 3, 10);
  signPlate(kit, "TRANSIT · LIGNE A", new THREE.Vector3(x, 4.6, 26.05), "s", 6, 0.8, { fg: "#9fd8e0", sub: name.toUpperCase(), bg: "#16201f" }, 0.6);
  signPlate(kit, `VERS ${dest}`, new THREE.Vector3(x, 3.2, 37.95), "n", 4, 0.6, { fg: "#e9e2cf", arrow: tunnelSide === "e" ? "right" : "left", bg: "#1b1d1b" });
  new Screen(kit, {
    pos: new THREE.Vector3(x - 3, 2.3, 26.06),
    facing: "s",
    w: 1.4,
    h: 1,
    title: "LIGNE A",
    lines: ["SPATIOPORT <-> HABITATION", "DUREE ......... 0:15", "FREQUENCE ..... SUR APPEL", "", "APPUYEZ SUR LA BORNE"],
    color: "#9fd8e0",
    seed: x + 31,
  });
  // Borne d'appel au bord du quai.
  kit.box(x + 3, 0, edge - 1.9, x + 3.5, 1.1, edge - 1.4, "hullCream", true);
  kit.box(x + 3.07, 1.0, edge - 1.4, x + 3.43, 1.08, edge - 1.38, "lampAmber");
}

// ---------------------------------------------------------------- logement

function apartment(kit: Kit, audio: StationAudio, x: number, y: number, side: "n" | "s", label: string, seed: number): void {
  const n = side === "n";
  // La salle commence juste derrière la paroi de la coursive (épaisse de 30 cm).
  const z0 = n ? -8 : 2.3;
  const z1 = n ? -2.3 : 8;
  const x0 = x - 3.5;
  const x1 = x + 3.5;
  kit.room({
    x0,
    x1,
    z0,
    z1,
    y,
    h: 2.8,
    wall: "hullCream",
    floorMat: "carpet",
    openings: [
      { side: n ? "s" : "n", at: x, width: 1.6, bottom: 0, top: 2.3, kind: "gap" },
      { side: n ? "n" : "s", at: x + 1.5, width: 2, bottom: 1.2, top: 2.1, kind: "window" },
    ],
  });
  kit.updatables.push(new Door(kit, audio, { side: n ? "n" : "s", fixed: n ? -2 : 2, at: x, width: 1.6, y, height: 2.3 }));
  kit.area({ name: `Logement ${label}`, sub: "Habitation · Niveau 2", x0, x1, z0, z1, y0: y - 1, y1: y + 3, zone: HABITAT });
  const back: Side = n ? "s" : "n";
  const wallZ = n ? z0 + 0.5 : z1 - 0.5;
  P.bunk(kit, x0 + 1.2, y, n ? z0 + 2.2 : z1 - 2.2, "e");
  P.desk(kit, x1 - 1.3, y, wallZ + (n ? 0.1 : -0.1), back, `TERMINAL ${label}`, seed === 2 ? ["MESSAGES ...... 3", "> MAMAN : APPELLE-MOI", "> SECURITE : RAPPEL", "> ??? : ILS SAVENT"] : ["MESSAGES ...... 0", "SOLDE ......... 412 CR", "LOYER ......... PAYE"], 30 + seed);
  P.lockers(kit, x1 - 0.35, y, n ? z1 - 1.6 : z0 + 1.6, "w", 2);
  P.ceilingPanel(kit, x, y + 2.8, (z0 + z1) / 2, 1, 0.5, "lampWarm", 0xffc27a, 2.6, 7, seed === 3 ? 0.9 : 0);
  if (seed === 1) P.crates(kit, x - 0.5, y, n ? z0 + 1.2 : z1 - 1.2, 2, 11);
  if (seed === 3) P.planter(kit, x0 + 0.6, y, n ? z1 - 0.8 : z0 + 0.8, 0.7);
  signPlate(kit, label, new THREE.Vector3(x + 1.3, y + 2.0, n ? -1.95 : 1.95), n ? "s" : "n", 0.7, 0.25, { fg: "#ffcf6b", bg: "#1b1d1b" }, 0.5);
}

// ---------------------------------------------------------------- navette

function buildTramCar(world: Kit): THREE.Group {
  const k = new Kit(world.mats);
  const L = 5.5;
  const W = 1.6;
  const H = 2.9;
  const mat = (m: MatKey) => m;
  // Caisse : plancher, toit, parois avec bandeau vitré, porte côté nord.
  k.box(-L, -0.5, -W, L, 0, W, mat("grate"));
  k.box(-L, -1.1, -W + 0.2, L, -0.5, W - 0.2, mat("hullDark"));
  k.box(-L - 0.2, H, -W - 0.1, L + 0.2, H + 0.35, W + 0.1, mat("hullCream"));
  // Paroi sud.
  k.box(-L, 0, W - 0.1, L, 1.0, W + 0.1, mat("hullCream"));
  k.box(-L, 2.2, W - 0.1, L, H, W + 0.1, mat("hullCream"));
  for (let x = -L; x <= L + 0.01; x += 2.2) k.box(x - 0.08, 1.0, W - 0.1, x + 0.08, 2.2, W + 0.1, mat("trim"));
  // Paroi nord avec la porte au milieu.
  k.box(-L, 0, -W - 0.1, -1.5, 1.0, -W + 0.1, mat("hullCream"));
  k.box(1.5, 0, -W - 0.1, L, 1.0, -W + 0.1, mat("hullCream"));
  k.box(-L, 2.2, -W - 0.1, L, H, -W + 0.1, mat("hullCream"));
  for (const x of [-L, -3.3, -1.5, 1.5, 3.3, L]) k.box(x - 0.08, 0, -W - 0.1, x + 0.08, 2.2, -W + 0.1, mat("trim"));
  // Bandeau orange de la compagnie.
  k.box(-L - 0.01, 0.75, -W - 0.13, L + 0.01, 0.9, -W - 0.1, mat("plasticOrange"));
  k.box(-L - 0.01, 0.75, W + 0.1, L + 0.01, 0.9, W + 0.13, mat("plasticOrange"));
  // Extrémités vitrées.
  for (const x of [-L, L]) {
    k.box(x - 0.1, 0, -W, x + 0.1, 1.0, W, mat("hullCream"));
    k.box(x - 0.1, 2.2, -W, x + 0.1, H, W, mat("hullCream"));
  }
  // Vitres.
  const glass = (g: THREE.BufferGeometry) => k.add(g, "glass");
  const side = new THREE.PlaneGeometry(2 * L, 1.2);
  glass(side.clone().translate(0, 1.6, W));
  glass(new THREE.PlaneGeometry(L - 1.5, 1.2).translate(-(L + 1.5) / 2, 1.6, -W));
  glass(new THREE.PlaneGeometry(L - 1.5, 1.2).translate((L + 1.5) / 2, 1.6, -W));
  for (const x of [-L, L]) glass(new THREE.PlaneGeometry(2 * W, 1.2).rotateY(Math.PI / 2).translate(x, 1.6, 0));
  // Banquettes et barres de maintien.
  k.box(-L + 0.4, 0.4, W - 0.6, -1.8, 0.5, W - 0.1, mat("leather"));
  k.box(1.8, 0.4, W - 0.6, L - 0.4, 0.5, W - 0.1, mat("leather"));
  k.box(-L + 0.4, 0, W - 0.55, -1.8, 0.4, W - 0.15, mat("hullDark"));
  k.box(1.8, 0, W - 0.55, L - 0.4, 0.4, W - 0.15, mat("hullDark"));
  k.cylinder(new THREE.Vector3(-L + 0.3, 2.3, 0), new THREE.Vector3(L - 0.3, 2.3, 0), 0.03, "metal", 6);
  for (const x of [-2.5, 2.5]) k.cylinder(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 2.3, 0), 0.03, "metal", 6);
  // Plafonnier.
  k.box(-L + 0.5, H - 0.05, -0.3, L - 0.5, H - 0.02, 0.3, mat("lampWarm"));
  // Console de bord.
  k.box(-0.4, 0, W - 0.5, 0.4, 1.1, W - 0.1, mat("hullDark"));
  k.box(-0.3, 1.1, W - 0.45, 0.3, 1.13, W - 0.15, mat("lampAmber"));
  const group = k.build();
  const light = new THREE.PointLight(0xffc27a, 20, 9, 2);
  light.position.set(0, H - 0.5, 0);
  group.add(light);
  return group;
}
