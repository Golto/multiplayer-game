// Sébastopol : une station à explorer en vue subjective. Point d'entrée de la page /station.

import * as THREE from "three";
import { StationAudio } from "./audio";
import type { Area } from "./kit";
import { LightPool } from "./lights";
import { Player } from "./player";
import { Post } from "./post";
import { createSky } from "./sky";
import { buildWorld } from "./world";
import "./station.css";

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------- rendu

const canvas = $<HTMLCanvasElement>("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x080b0a, 0.014);
scene.add(new THREE.HemisphereLight(0x93a39b, 0x1a130d, 0.9));

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 20000);
const post = new Post(renderer, scene, camera);

let quality: "haute" | "basse" = params.get("q") === "basse" ? "basse" : "haute";
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ratio = quality === "haute" ? Math.min(window.devicePixelRatio, 1.5) : 0.7;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  post.setSize(w, h, ratio);
  post.setQuality(quality === "haute");
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------- monde

const audio = new StationAudio();
const world = buildWorld(audio);
const { kit, tram, elevators, spots } = world;
scene.add(kit.build());
const sky = createSky();
scene.add(sky);
const lights = new LightPool(scene, kit.lights);
const player = new Player(camera, kit.walls, kit.floors);
const start = spots[params.get("spot") ?? "sas"] ?? spots.sas!;
player.place(start.x, start.y, start.z, start.yaw);

// ---------------------------------------------------------------- interface

const overlay = $("overlay");
const enter = $<HTMLButtonElement>("enter");
const banner = $("banner");
const prompt = $("prompt");
const ride = $("ride");
const mapPanel = $("map");
const mapCanvas = $<HTMLCanvasElement>("map-canvas");
const qualityBtn = $<HTMLButtonElement>("quality");
const soundBtn = $<HTMLButtonElement>("sound");
const status = $("status");

status.textContent = `${kit.areas.length} zones · ${kit.lights.length} sources lumineuses · prêt`;
enter.disabled = false;
enter.textContent = "Entrer dans la station";
qualityBtn.textContent = `Qualité : ${quality}`;

let locked = false;
let started = false;
let mapOpen = false;

function setOverlay(show: boolean): void {
  overlay.classList.toggle("is-hidden", !show);
  enter.textContent = started ? "Reprendre l'exploration" : "Entrer dans la station";
}

enter.addEventListener("click", () => {
  audio.start();
  started = true;
  canvas.requestPointerLock?.();
  // Sans verrouillage du pointeur (tests, navigateurs restrictifs), on joue quand même.
  setTimeout(() => {
    if (!locked) setOverlay(false);
  }, 300);
});
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  setOverlay(!locked);
});
qualityBtn.addEventListener("click", () => {
  quality = quality === "haute" ? "basse" : "haute";
  qualityBtn.textContent = `Qualité : ${quality}`;
  resize();
});
soundBtn.addEventListener("click", () => {
  audio.setMuted(!audio.muted);
  soundBtn.textContent = audio.muted ? "Son : coupé" : "Son : actif";
});

document.addEventListener("mousemove", (e) => {
  if (locked) player.look(e.movementX, e.movementY);
  else if (started && e.buttons === 1 && overlay.classList.contains("is-hidden")) player.look(e.movementX, e.movementY);
});

function interact(): void {
  const target = nearestInteractable();
  if (target) {
    audio.blip();
    target.act();
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyE") return interact();
  if (e.code === "KeyM" || e.code === "Tab") {
    e.preventDefault();
    mapOpen = !mapOpen;
    mapPanel.classList.toggle("is-hidden", !mapOpen);
    return;
  }
  // Chiffres : choisir directement un niveau depuis la cabine d'ascenseur.
  const digit = Number(e.key);
  if (digit >= 1 && digit <= 9) {
    for (const el of elevators) if (el.contains(player.pos) && digit <= el.o.levels.length) el.go(digit - 1);
  }
  // Les flèches gauche/droite tournent, haut/bas avancent : jouable sans souris.
  if (e.code.startsWith("Arrow")) e.preventDefault();
  player.keys.add(e.code);
});
window.addEventListener("keyup", (e) => player.keys.delete(e.code));
window.addEventListener("blur", () => player.keys.clear());

function nearestInteractable() {
  let best: (typeof kit.interactables)[number] | null = null;
  let bestD = Infinity;
  const eye = camera.position;
  const look = new THREE.Vector3();
  camera.getWorldDirection(look);
  for (const it of kit.interactables) {
    const d = it.pos.distanceTo(player.pos.clone().setY(player.pos.y + 1.2));
    if (d > it.radius || d >= bestD) continue;
    // À peu près dans le champ de vision, sauf si on est dessus.
    const to = it.pos.clone().sub(eye).normalize();
    if (d > 1.2 && to.dot(look) < 0.25) continue;
    if (!it.label()) continue;
    best = it;
    bestD = d;
  }
  return best;
}

let currentArea: Area | null = null;
let bannerTimer = 0;
function areaAt(p: THREE.Vector3): Area | null {
  // La plus petite zone qui contient le joueur : une salle gagne sur le tunnel qui la traverse.
  let best: Area | null = null;
  let bestSize = Infinity;
  for (const a of kit.areas) {
    if (p.x < a.x0 || p.x > a.x1 || p.z < a.z0 || p.z > a.z1 || p.y < a.y0 || p.y > a.y1) continue;
    const size = (a.x1 - a.x0) * (a.z1 - a.z0);
    if (size < bestSize) {
      best = a;
      bestSize = size;
    }
  }
  return best;
}

function showBanner(a: Area): void {
  banner.innerHTML = `<span class="banner-name"></span><span class="banner-sub"></span>`;
  (banner.firstChild as HTMLElement).textContent = a.name;
  (banner.lastChild as HTMLElement).textContent = a.sub;
  banner.style.setProperty("--zone", a.zone);
  banner.classList.remove("is-shown");
  void banner.offsetWidth;
  banner.classList.add("is-shown");
  bannerTimer = 4.5;
}

function drawMap(): void {
  const g = mapCanvas.getContext("2d")!;
  const W = (mapCanvas.width = mapCanvas.clientWidth * devicePixelRatio);
  const H = (mapCanvas.height = mapCanvas.clientHeight * devicePixelRatio);
  g.clearRect(0, 0, W, H);
  const p = player.pos;
  const sector = p.x < 150;
  const shown = kit.areas.filter((a) => (sector ? a.x1 < 150 : a.x0 > 150) || a.name === "Tunnel de transit");
  const inLevel = (a: Area) => p.y >= a.y0 - 0.5 && p.y <= a.y1;
  const xs = shown.flatMap((a) => [a.x0, a.x1]).filter((x) => (sector ? x < 60 : x > 240));
  const zs = shown.flatMap((a) => [a.z0, a.z1]);
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  const minZ = Math.min(...zs) - 4;
  const maxZ = Math.max(...zs) + 4;
  const scale = Math.min(W / (maxX - minX), H / (maxZ - minZ));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oz = (H - (maxZ - minZ) * scale) / 2;
  const tx = (x: number) => ox + (x - minX) * scale;
  const tz = (z: number) => oz + (z - minZ) * scale;
  g.lineWidth = 2 * devicePixelRatio;
  g.font = `${11 * devicePixelRatio}px "Share Tech Mono", monospace`;
  // Les zones des autres niveaux d'abord, en retrait.
  const sorted = [...shown].sort((a, b) => Number(inLevel(a)) - Number(inLevel(b)));
  for (const a of sorted) {
    const active = inLevel(a);
    const x0 = Math.max(tx(a.x0), 0);
    const x1 = Math.min(tx(a.x1), W);
    g.globalAlpha = active ? 1 : 0.25;
    g.fillStyle = a.zone + "33";
    g.strokeStyle = a.zone;
    g.fillRect(x0, tz(a.z0), x1 - x0, tz(a.z1) - tz(a.z0));
    g.strokeRect(x0, tz(a.z0), x1 - x0, tz(a.z1) - tz(a.z0));
    if (active && (a.x1 - a.x0) * (a.z1 - a.z0) > 60) {
      g.fillStyle = "#e9e2cf";
      g.fillText(a.name.toUpperCase(), x0 + 6 * devicePixelRatio, tz(a.z0) + 16 * devicePixelRatio, x1 - x0 - 10);
    }
  }
  g.globalAlpha = 1;
  // Le joueur.
  const px = tx(p.x);
  const pz = tz(p.z);
  g.save();
  g.translate(px, pz);
  g.rotate(-player.yaw);
  g.fillStyle = "#ffcf6b";
  g.beginPath();
  g.moveTo(0, -12 * devicePixelRatio);
  g.lineTo(7 * devicePixelRatio, 8 * devicePixelRatio);
  g.lineTo(-7 * devicePixelRatio, 8 * devicePixelRatio);
  g.closePath();
  g.fill();
  g.restore();
  $("map-title").textContent = sector ? "SECTEUR 1 · SPATIOPORT" : "SECTEUR 2 · HABITATION";
  $("map-level").textContent = currentArea ? currentArea.sub.toUpperCase() : "";
}

// ---------------------------------------------------------------- boucle

const clock = new THREE.Clock();
let time = 0;
let mapTimer = 0;

player.onStep = (run) => {
  const soft = !!currentArea && /Logement|Salon|logements/.test(currentArea.name);
  audio.footstep(soft, run);
};

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  // Tourner aux flèches, sans souris.
  const turn = (player.keys.has("ArrowLeft") ? 1 : 0) - (player.keys.has("ArrowRight") ? 1 : 0);
  if (turn) player.look(-turn * dt * 900, 0);

  tram.board(player.pos);
  for (const u of kit.updatables) u.update(dt, { player: player.pos, time });

  const riding = tram.moving && tram.rider !== null;
  if (riding) player.pos.copy(tram.position).add(tram.rider!);
  player.locked = riding || elevators.some((el) => el.moving && el.contains(player.pos));
  player.update(dt);
  ride.classList.toggle("is-hidden", !riding);
  if (riding) ride.textContent = `NAVETTE LIGNE A — EN ROUTE VERS ${tram.o.stops[tram.at]!.name.toUpperCase()}`;

  lights.update(dt, camera.position);
  (sky.userData.tick as (t: number) => void)(time);

  const area = areaAt(player.pos);
  if (area && area !== currentArea && !(currentArea && currentArea.name === area.name && currentArea.sub === area.sub)) showBanner(area);
  currentArea = area ?? currentArea;
  const openness = area ? Math.min(1, ((area.x1 - area.x0) * (area.z1 - area.z0)) / 600) : 0.3;
  audio.update(dt, camera.position, openness);
  bannerTimer -= dt;
  if (bannerTimer <= 0) banner.classList.remove("is-shown");

  const target = nearestInteractable();
  const label = target?.label();
  prompt.classList.toggle("is-hidden", !label);
  if (label) prompt.innerHTML = `<kbd>E</kbd> ${label}`;

  if (mapOpen) {
    mapTimer -= dt;
    if (mapTimer <= 0) {
      drawMap();
      mapTimer = 0.1;
    }
  }

  post.render(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès pour les tests et le débogage.
(window as unknown as { __station: unknown }).__station = {
  player,
  tram,
  elevators,
  spots,
  go(name: string) {
    const s = spots[name];
    if (s) player.place(s.x, s.y, s.z, s.yaw);
  },
  enter() {
    started = true;
    audio.start();
    setOverlay(false);
  },
  area: () => currentArea?.name,
};
