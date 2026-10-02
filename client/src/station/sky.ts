// Ce qu'on voit par les baies : étoiles, une géante gazeuse à bandes et ses anneaux, un soleil lointain.

import * as THREE from "three";
import { rng } from "./textures";

/** Direction du soleil, partagée par la planète et ses anneaux. */
const SUN = new THREE.Vector3(0.75, 0.35, 0.45).normalize();

export function createSky(): THREE.Group {
  const group = new THREE.Group();

  // Étoiles.
  const r = rng(404);
  const count = 6000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1;
    const t = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rad = 9000;
    pos.set([s * Math.cos(t) * rad, u * rad, s * Math.sin(t) * rad], i * 3);
    const warm = r();
    const b = 0.4 + r() * 0.6;
    col.set([b * (0.85 + warm * 0.15), b * 0.9, b * (1 - warm * 0.2)], i * 3);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  stars.setAttribute("color", new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(stars, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));

  // Géante gazeuse : bandes, turbulences et terminateur, calculés dans le shader.
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 96, 64),
    new THREE.ShaderMaterial({
      fog: false,
      uniforms: { sun: { value: SUN }, time: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vPos; varying vec3 vView;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vPos = position / 2600.0;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vView = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 sun; uniform float time;
        varying vec3 vNormal; varying vec3 vPos; varying vec3 vView;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; } return v; }
        void main() {
          float lat = vPos.y;
          float swirl = fbm(vPos * 6.0 + vec3(time * 0.002, 0.0, 0.0));
          float bands = sin(lat * 26.0 + swirl * 3.2) * 0.5 + 0.5;
          float fine = sin(lat * 90.0 + swirl * 6.0) * 0.5 + 0.5;
          vec3 cream = vec3(0.86, 0.74, 0.55);
          vec3 rust = vec3(0.62, 0.36, 0.2);
          vec3 teal = vec3(0.33, 0.45, 0.43);
          vec3 c = mix(rust, cream, bands);
          c = mix(c, teal, smoothstep(0.55, 0.9, fine) * 0.35);
          // Une grande tempête ovale.
          vec2 st = vec2(atan(vPos.z, vPos.x), lat);
          float storm = smoothstep(0.16, 0.0, length((st - vec2(0.9, -0.22)) * vec2(1.0, 2.6)));
          c = mix(c, vec3(0.75, 0.3, 0.16), storm * 0.8);
          float light = max(dot(vNormal, sun), 0.0);
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
          vec3 col = c * (0.03 + light * 1.15) + vec3(0.9, 0.7, 0.45) * rim * light * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  planet.position.set(-1400, -900, -7200);
  planet.rotation.z = 0.32;
  group.add(planet);

  // Anneaux : disque translucide à rainures.
  const ringGeo = new THREE.RingGeometry(3300, 5600, 256, 1);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.ShaderMaterial({
      fog: false,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { sun: { value: SUN } },
      vertexShader: `varying vec3 vLocal; void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec3 vLocal;
        float hash(float x) { return fract(sin(x * 91.7) * 43758.5); }
        void main() {
          float r = length(vLocal.xy);
          float t = (r - 3300.0) / 2300.0;
          float grooves = 0.55 + 0.45 * sin(t * 140.0) * sin(t * 37.0 + 1.3);
          float gap = smoothstep(0.58, 0.6, t) * (1.0 - smoothstep(0.64, 0.66, t));
          float a = (0.12 + 0.35 * grooves) * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t)) * (1.0 - gap * 0.9);
          gl_FragColor = vec4(vec3(0.82, 0.72, 0.58) * (0.7 + 0.3 * grooves), a);
        }`,
    }),
  );
  ring.position.copy(planet.position);
  ring.rotation.set(-Math.PI / 2 + 0.28, 0.1, 0.32);
  group.add(ring);

  // Soleil lointain : simple halo.
  const sunTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,250,235,1)");
    grad.addColorStop(0.15, "rgba(255,230,190,0.8)");
    grad.addColorStop(1, "rgba(255,200,140,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  sun.position.copy(SUN).multiplyScalar(8500);
  sun.scale.setScalar(900);
  group.add(sun);

  group.userData.tick = (t: number) => {
    (planet.material as THREE.ShaderMaterial).uniforms.time!.value = t;
    planet.rotation.y = t * 0.002;
  };
  return group;
}
