// Image : halo des néons (bloom), puis grain, lignes, vignettage, légère aberration chromatique
// et étalonnage vert-ambre, pour l'allure d'une vidéo de 1979.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const RetroShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.06 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.0) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float d = dot(c, c);
      // Aberration chromatique, plus forte sur les bords.
      vec2 off = c * d * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // Étalonnage : ombres vert-bleu, hautes lumières ambrées.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.86, 1.04, 0.98), 1.0 - smoothstep(0.0, 0.5, l));
      col = mix(col, col * vec3(1.08, 1.0, 0.86), smoothstep(0.45, 1.0, l));
      // Grain et lignes très discrètes.
      col += (hash(vUv * resolution) - 0.5) * grain;
      col *= 0.97 + 0.03 * sin(vUv.y * resolution.y * 1.4);
      // Vignettage.
      col *= 1.0 - d * 1.15;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  readonly composer: EffectComposer;
  private retro: ShaderPass;
  private bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    // Halo discret : les néons brillent sans noyer l'image.
    this.bloom = new UnrealBloomPass(size, 0.42, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.retro = new ShaderPass(RetroShader);
    this.composer.addPass(this.retro);
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    (this.retro.uniforms.resolution!.value as THREE.Vector2).set(w * pixelRatio, h * pixelRatio);
  }

  setQuality(high: boolean): void {
    this.bloom.enabled = high;
  }

  render(time: number): void {
    this.retro.uniforms.time!.value = time;
    this.composer.render();
  }
}
