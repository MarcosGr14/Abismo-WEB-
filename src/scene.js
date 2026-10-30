import {
  WebGLRenderer, Scene, PerspectiveCamera, ShaderMaterial, BufferGeometry,
  Float32BufferAttribute, Points, Mesh, Group, LineSegments, SphereGeometry,
  PlaneGeometry, InstancedBufferGeometry, InstancedBufferAttribute,
  Vector2, Vector3, Clock, AdditiveBlending, DoubleSide
} from 'three';
import { state } from './depth.js';

/* =====================================================================
   SHADERS
   ===================================================================== */

/* ---------- Fondo de agua: caustics, rayos, corrientes, lámpara y viñeta ---------- */
const BG_V = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BG_F = /* glsl */`
uniform float uTime; uniform float uV; uniform vec2 uRes;
varying vec2 vUv;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 3; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
/* Cáusticas de agua (patrón teselable, iteraciones reducidas en móvil) */
float caustic(vec2 uv, float t){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < ITER; n++){
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= float(ITER);
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
void main(){
  float aspect = uRes.x / uRes.y;
  vec2 q = vec2(vUv.x * aspect, vUv.y);
  float t = uTime;
  float v = uV;

  /* Superficie: cáusticas que ondulan */
  float kC = 1.0 - smoothstep(0.02, 0.16, v);
  float cs = 0.0;
  if (kC > 0.01) cs = caustic(q * 0.55 + vec2(t * 0.012, 0.0), t * 0.5 + 23.0) * kC;

  /* Rayos de luz oblicuos que se apagan con la profundidad */
  float kR = 1.0 - smoothstep(0.03, 0.34, v);
  float ang = (vUv.x - 0.5) + (vUv.y - 0.2) * 0.35;
  float rays = noise(vec2(ang * 9.0 + t * 0.05, t * 0.07)) * 0.6
             + noise(vec2(ang * 23.0 - t * 0.08, 3.7)) * 0.4;
  rays = smoothstep(0.35, 0.9, rays) * vUv.y * kR;

  /* Corrientes: bandas de agua turbia que se desplazan en horizontal */
  float cur  = fbm(vec2(q.x * 1.2 - t * 0.035, q.y * 3.4 + sin(q.x * 1.7 + t * 0.1) * 0.18));
  float cur2 = fbm(vec2(q.x * 2.4 - t * 0.07 + 8.0, q.y * 5.5 + cur * 1.6));
  float kM = smoothstep(0.06, 0.5, v);
  float murk = smoothstep(0.34, 0.78, cur * 0.6 + cur2 * 0.55) * kM;

  /* Lámpara del sumergible: cono de luz que aparece al perder la luz del sol */
  vec2 c = (vUv - 0.5) * vec2(aspect, 1.0);
  float lamp = 1.0 - smoothstep(0.0, 0.85, length(c - vec2(0.0, 0.05)));
  float kL = smoothstep(0.22, 0.6, v);

  /* Viñeta creciente */
  float vig = smoothstep(0.35, 1.1, length((vUv - 0.5) * vec2(aspect * 0.9, 1.0)));
  float kV = mix(0.18, 0.7, smoothstep(0.0, 0.8, v));

  /* Capa de luz + capa de oscuridad, combinadas en un único color con alfa */
  float lA = clamp(rays * 0.15 + cs * 0.2 + murk * (0.03 + lamp * kL * 0.10), 0.0, 0.6);
  vec3 lightCol = mix(vec3(0.62, 0.9, 1.0), vec3(0.36, 0.58, 0.72), smoothstep(0.1, 0.5, v));
  float dA = clamp(vig * kV + (1.0 - lamp) * kL * 0.24, 0.0, 0.92);
  vec3 darkCol = vec3(0.0, 0.008, 0.035);

  vec3 pre = lightCol * lA + darkCol * dA * (1.0 - lA);
  float a = lA + dA * (1.0 - lA);
  a += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * (1.5 / 255.0); /* dither anti-banding */
  gl_FragColor = vec4(pre / max(a, 0.0001), clamp(a, 0.0, 1.0));
}`;

/* ---------- Nieve marina (arrastrada por la corriente, más brillante bajo la lámpara) ---------- */
const SNOW_V = /* glsl */`
uniform float uTime; uniform float uFlow; uniform float uSize; uniform float uPR; uniform float uDensity;
uniform float uMinY; uniform float uRange; uniform float uLamp;
attribute float aSeed;
varying float vFog; varying float vA;
void main(){
  vec3 p = position;
  p.y = uMinY + mod(position.y - uMinY - uTime * (0.25 + aSeed * 0.35), uRange);
  p.x = mod(position.x + 25.0 + uFlow * (0.4 + aSeed * 0.6), 50.0) - 25.0;
  p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.3;
  p.z += sin(uTime * 0.2 + aSeed * 17.0) * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 cp = projectionMatrix * mv;
  vec2 n = cp.xy / max(cp.w, 0.001);
  float spot = exp(-dot(n, n) * 1.4);
  float d = max(-mv.z, 0.5);
  vFog = 1.0 - exp(-pow(uDensity * d, 2.0));
  vA = (0.3 + aSeed * 0.7) * (1.0 + uLamp * spot * 2.2);
  gl_PointSize = min(uSize * uPR * 8.0 / d, 40.0);
  gl_Position = cp;
}`;
const SNOW_F = /* glsl */`
varying float vFog; varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float a = min((1.0 - smoothstep(0.0, 0.5, r)) * vA, 1.0) * (1.0 - vFog);
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.78, 0.93, 1.0, a);
}`;

/* ---------- Burbujas sutiles ---------- */
const BUB_V = /* glsl */`
uniform float uTime; uniform float uPR; uniform float uDensity;
uniform float uMinY; uniform float uRange; uniform float uAmt;
attribute vec3 aB;
varying float vA; varying float vFog;
void main(){
  vec3 p = position;
  p.y = uMinY + mod(position.y - uMinY + uTime * aB.y, uRange);
  p.x += sin(uTime * 0.9 * aB.y + aB.x * 30.0) * 0.18 + sin(uTime * 0.35 + aB.x * 9.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 0.5);
  vFog = 1.0 - exp(-pow(uDensity * d, 2.0));
  vA = uAmt * (0.35 + 0.65 * aB.z);
  gl_PointSize = clamp(aB.z * uPR * 70.0 / d, 1.5 * uPR, 34.0);
  gl_Position = projectionMatrix * mv;
}`;
const BUB_F = /* glsl */`
varying float vA; varying float vFog;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float rim = smoothstep(0.7, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
  float body = (1.0 - smoothstep(0.0, 1.0, r)) * 0.06;
  float spec = (1.0 - smoothstep(0.0, 0.28, length(c - vec2(-0.18, 0.18)))) * 0.9;
  float a = (rim * 0.6 + body + spec) * vA * (1.0 - vFog);
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.75, 0.93, 1.0, a);
}`;

/* ---------- Peces pequeños independientes (instanciados, todo el movimiento en GPU) ----------
   Cada pez tiene su propio rumbo, velocidad, vaivén vertical y profundidad (z). Cruza la pantalla
   de lado a lado y reaparece por el otro extremo; su aspecto depende de la profundidad en que vive. */
const FISH_V = /* glsl */`
uniform float uTime; uniform float uDensity; uniform float uSize; uniform float uAsp;
attribute vec4 aA;   /* fase, velocidad, tamaño, sentido (±1) */
attribute vec4 aB;   /* x inicial (0..1), y base (mundo), z base, azar */
attribute vec3 aC;   /* azares para el vaivén */
attribute float aX; attribute float aV;
varying float vX; varying float vV; varying float vFog; varying float vSpot; varying float vZ; varying float vR;
void main(){
  float t = uTime;
  float ph = aA.x * 6.2831;

  /* profundidad (acercarse y alejarse) y anchura visible a esa distancia */
  float fz = 0.08 + aC.z * 0.1;
  float z = aB.z + sin(t * fz + ph) * 1.6;
  float dist = 6.0 - z;
  float halfW = dist * 0.5774 * uAsp + 2.0;
  float W = halfW * 2.0;

  /* avance con aceleraciones y pausas suaves + pequeño bamboleo lateral */
  float warp = t + 0.8 * sin(t * 0.4 + ph);
  float fx = 0.5 * (0.6 + aC.x);
  float xr = aB.x * W + aA.w * aA.y * warp + sin(t * fx + ph * 2.0) * 0.25;
  float x = mod(xr, W) - halfW;

  /* ondulación vertical con dos frecuencias */
  float fy = 0.2 + aC.y * 0.35;
  float amp = 0.5 + aC.y * 0.9;
  float y = aB.y + sin(t * fy + ph) * amp + sin(t * 0.13 + ph * 3.0) * 0.8;

  /* velocidad instantánea -> orientación (guiñada y cabeceo) */
  float dx = aA.w * aA.y * (1.0 + 0.32 * cos(t * 0.4 + ph)) + cos(t * fx + ph * 2.0) * 0.25 * fx;
  float dy = cos(t * fy + ph) * fy * amp + cos(t * 0.13 + ph * 3.0) * 0.13 * 0.8;
  float dz = cos(t * fz + ph) * fz * 1.6 * 2.0;
  float yaw = atan(-dz, dx);
  float pitch = clamp(atan(dy, abs(dx)), -0.5, 0.5);
  float cy = cos(yaw); float sy = sin(yaw);
  float cp = cos(pitch); float sp = sin(pitch);

  /* tamaño según profundidad (más grandes y espaciados abajo) */
  float zf = clamp(-aB.y / 80.0, 0.0, 1.0);
  float size = uSize * aA.z * mix(1.0, 1.35, zf);

  vec3 lp = position * size;
  float tail = pow(1.0 - aX, 1.5);
  lp.z += sin(t * (6.0 + aA.y * 3.0) + ph * 3.0 - aX * 5.0) * 0.2 * tail * size;
  vec3 pr = vec3(lp.x * cp - lp.y * sp, lp.x * sp + lp.y * cp, lp.z);
  vec3 w = vec3(pr.x * cy + pr.z * sy, pr.y, -pr.x * sy + pr.z * cy);

  vec3 world = vec3(x, y, z) + w;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  vec4 cpos = projectionMatrix * mv;
  vec2 n = cpos.xy / max(cpos.w, 0.001);
  vSpot = exp(-dot(n, n) * 1.4);
  vFog = 1.0 - exp(-pow(uDensity * max(-mv.z, 0.5), 2.0));
  vX = aX; vV = aV; vZ = zf; vR = aB.w;
  gl_Position = cpos;
}`;
const FISH_F = /* glsl */`
uniform float uLamp;
varying float vX; varying float vV; varying float vFog; varying float vSpot; varying float vZ; varying float vR;
void main(){
  /* especie según profundidad: plateados arriba -> linternas con fotóforos -> oscuros y tenues abajo */
  vec3 back  = mix(vec3(0.06, 0.17, 0.28), vec3(0.01, 0.02, 0.05), smoothstep(0.0, 0.8, vZ));
  vec3 belly = mix(vec3(0.80, 0.92, 0.98), vec3(0.12, 0.20, 0.30), smoothstep(0.1, 0.95, vZ));
  belly *= 0.85 + vR * 0.3;
  float glow = smoothstep(0.2, 0.42, vZ);
  vec3 gcol = mix(vec3(0.3, 0.95, 1.0), vec3(1.0, 0.3, 0.9), smoothstep(0.45, 0.95, vZ));
  vec3 col = mix(back, belly, smoothstep(0.25, 0.9, vV));
  /* fotóforos: puntitos a lo largo del vientre */
  float dots = (1.0 - smoothstep(0.0, 0.2, abs(fract(vX * 9.0) - 0.5)))
             * smoothstep(0.55, 0.85, vV) * step(0.2, vX) * step(vX, 0.9);
  col += gcol * (dots * 2.2 + 0.14) * glow;
  col *= 1.0 + vSpot * uLamp * 0.9;
  float a = mix(0.85, 0.7, smoothstep(0.0, 0.9, vZ)) * (1.0 - vFog) * mix(0.55, 1.0, smoothstep(0.08, 0.2, vX));
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

/* ---------- Medusas ---------- */
const BELL_V = /* glsl */`
uniform float uTime; uniform float uSeed; uniform float uDensity;
varying vec3 vN; varying vec3 vV; varying float vFog; varying float vH;
void main(){
  vec3 p = position;
  float pulse = sin(uTime * 1.5 + uSeed * 6.2831);
  float up = clamp(p.y, 0.0, 1.0);
  p.xz *= 1.0 + 0.12 * pulse * (1.0 - up);
  p.y *= 1.0 - 0.10 * pulse;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vH = clamp(position.y, 0.0, 1.0);
  vFog = 1.0 - exp(-pow(uDensity * max(-mv.z, 0.5), 2.0));
  gl_Position = projectionMatrix * mv;
}`;
const BELL_F = /* glsl */`
uniform float uTime; uniform float uSeed; uniform vec3 uColA; uniform vec3 uColB;
varying vec3 vN; varying vec3 vV; varying float vFog; varying float vH;
void main(){
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float glow = 0.55 + 0.45 * sin(uTime * 1.5 + uSeed * 6.2831 - vH * 2.5);
  vec3 col = mix(uColB, uColA, vH) * (0.5 + glow) + uColA * fres * 0.8;
  float a = (0.12 + fres * 0.7) * (0.6 + glow * 0.6) * (1.0 - vFog);
  gl_FragColor = vec4(col, a);
}`;
const TENT_V = /* glsl */`
uniform float uTime; uniform float uSeed; uniform float uDensity;
attribute float aT; attribute float aA;
varying float vT; varying float vFog;
void main(){
  vec3 p = position;
  float pulse = sin(uTime * 1.5 + uSeed * 6.2831);
  p.x += sin(uTime * 1.4 + aT * 5.0 + aA * 3.0 + uSeed * 6.0) * 0.18 * aT;
  p.z += cos(uTime * 1.1 + aT * 4.0 + aA * 2.0) * 0.18 * aT;
  p.xz *= 1.0 + 0.12 * pulse * (1.0 - aT);
  p.y += 0.12 * pulse * aT;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vT = aT;
  vFog = 1.0 - exp(-pow(uDensity * max(-mv.z, 0.5), 2.0));
  gl_Position = projectionMatrix * mv;
}`;
const TENT_F = /* glsl */`
uniform vec3 uColA; uniform vec3 uColB;
varying float vT; varying float vFog;
void main(){
  vec3 c = mix(uColA, uColB, vT);
  float a = ((1.0 - vT) * 0.75 + 0.05) * (1.0 - vFog);
  gl_FragColor = vec4(c, a);
}`;

/* =====================================================================
   GEOMETRÍAS Y DATOS
   ===================================================================== */
const hex = (h) => new Vector3((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255);
const CYAN = hex(0x4df3ff);
const VIOLET = hex(0x7a5cff);
const MAGENTA = hex(0xff3df0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function tentacleGeometry(n, seg, len, rad) {
  const pos = []; const T = []; const A = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = rad * (0.55 + 0.45 * ((i * 7) % 5) / 4);
    const L = len * (0.6 + 0.4 * ((i * 3) % 4) / 3);
    for (let j = 0; j < seg; j++) {
      for (const jj of [j, j + 1]) {
        const t = jj / seg;
        const k = 1 - t * 0.3;
        pos.push(Math.cos(a) * r * k, -0.15 - t * L, Math.sin(a) * r * k);
        T.push(t); A.push(a);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new Float32BufferAttribute(T, 1));
  g.setAttribute('aA', new Float32BufferAttribute(A, 1));
  return g;
}

/* Silueta de pez: tira de triángulos con cola, cuerpo fusiforme y cabeza afilada (x: cola 0 → cabeza 1) */
const PROFILE = [[0, 0.14], [0.06, 0.09], [0.16, 0.035], [0.3, 0.1], [0.5, 0.16], [0.7, 0.15], [0.88, 0.09], [1, 0.005]];
function fishGeometry(count) {
  const pos = []; const aX = []; const aV = []; const idx = [];
  PROFILE.forEach(([t, h]) => {
    pos.push(t - 0.5, h, 0, t - 0.5, -h * 0.85, 0);
    aX.push(t, t); aV.push(0, 1);
  });
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const base = new BufferGeometry();
  base.setIndex(idx);
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aX', new Float32BufferAttribute(aX, 1));
  g.setAttribute('aV', new Float32BufferAttribute(aV, 1));

  const A = new Float32Array(count * 4); const B = new Float32Array(count * 4); const C = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const big = Math.random() < 0.07; /* de vez en cuando uno grande y lento */
    A.set([Math.random(), (0.5 + Math.random()) * (big ? 0.6 : 1), (0.7 + Math.random() * 0.8) * (big ? 1.9 : 1), Math.random() < 0.5 ? -1 : 1], i * 4);
    /* más peces cerca de la superficie, cada vez menos hacia las fosas */
    B.set([Math.random(), 2 - 88 * Math.pow(Math.random(), 1.15), -3 - Math.random() * 10, Math.random()], i * 4);
    C.set([Math.random(), Math.random(), Math.random()], i * 3);
  }
  g.setAttribute('aA', new InstancedBufferAttribute(A, 4));
  g.setAttribute('aB', new InstancedBufferAttribute(B, 4));
  g.setAttribute('aC', new InstancedBufferAttribute(C, 3));
  g.instanceCount = count;
  return g;
}

const PLACE = [
  { x: -3.2, y: -4,  z: -4, s: 0.9 },
  { x: 4.2,  y: -20, z: -7, s: 1.4 },
  { x: -4.5, y: -38, z: -9, s: 1.8 },
  { x: 3.5,  y: -56, z: -6, s: 1.2 },
  { x: -2.5, y: -74, z: -8, s: 2.1 }
];
const CAM_RANGE = 80;

/* =====================================================================
   ESCENA
   ===================================================================== */
export function initScene(canvas) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 768;
  const k = reduce ? 0.5 : small ? 0.55 : 1; /* factor de cantidad de partículas/peces */

  const renderer = new WebGLRenderer({
    canvas, alpha: true, antialias: !small, powerPreference: 'high-performance'
  });
  const pr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.z = 6;

  const U = {
    uTime: { value: 0 }, uFlow: { value: 0 }, uDensity: { value: 0.035 }, uPR: { value: pr },
    uV: { value: 0 }, uLamp: { value: 0 }, uXS: { value: 1 }, uBub: { value: 1 }, uAsp: { value: 1.6 }
  };

  /* Fondo de agua (quad a pantalla completa, detrás de todo) */
  const bg = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: { uTime: U.uTime, uV: U.uV, uRes: { value: new Vector2(1, 1) } },
    defines: { ITER: small ? 3 : 5 },
    vertexShader: BG_V, fragmentShader: BG_F, transparent: true, depthTest: false, depthWrite: false
  }));
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  /* Nieve marina */
  const count = Math.round(4500 * k);
  const RANGE = 115; const MINY = -100;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 50;
    pos[i * 3 + 1] = MINY + Math.random() * RANGE;
    pos[i * 3 + 2] = -35 + Math.random() * 38;
    seed[i] = Math.random();
  }
  const sg = new BufferGeometry();
  sg.setAttribute('position', new Float32BufferAttribute(pos, 3));
  sg.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  const snow = new Points(sg, new ShaderMaterial({
    uniforms: { ...U, uSize: { value: small ? 2.6 : 2.2 }, uMinY: { value: MINY }, uRange: { value: RANGE } },
    vertexShader: SNOW_V, fragmentShader: SNOW_F, transparent: true, depthWrite: false
  }));
  snow.frustumCulled = false;
  scene.add(snow);

  /* Burbujas sutiles: abundan arriba y casi desaparecen en el abismo */
  const bn = Math.round(150 * k);
  const bpos = new Float32Array(bn * 3); const bb = new Float32Array(bn * 3);
  for (let i = 0; i < bn; i++) {
    bpos[i * 3] = (Math.random() - 0.5) * 28;
    bpos[i * 3 + 1] = MINY + Math.random() * RANGE;
    bpos[i * 3 + 2] = -14 + Math.random() * 14;
    bb[i * 3] = Math.random(); bb[i * 3 + 1] = 0.35 + Math.random() * 0.6; bb[i * 3 + 2] = 0.2 + Math.random() * 0.8;
  }
  const bg2 = new BufferGeometry();
  bg2.setAttribute('position', new Float32BufferAttribute(bpos, 3));
  bg2.setAttribute('aB', new Float32BufferAttribute(bb, 3));
  const bubbles = new Points(bg2, new ShaderMaterial({
    uniforms: { uTime: U.uTime, uPR: U.uPR, uDensity: U.uDensity, uAmt: U.uBub, uMinY: { value: MINY }, uRange: { value: RANGE } },
    vertexShader: BUB_V, fragmentShader: BUB_F, transparent: true, depthWrite: false
  }));
  bubbles.frustumCulled = false;
  scene.add(bubbles);

  /* Peces pequeños, cada uno nadando por su cuenta */
  const fish = new Mesh(fishGeometry(Math.max(24, Math.round(110 * k))), new ShaderMaterial({
    uniforms: { uTime: U.uTime, uDensity: U.uDensity, uLamp: U.uLamp, uAsp: U.uAsp, uSize: { value: 0.46 } },
    vertexShader: FISH_V, fragmentShader: FISH_F, transparent: true, depthWrite: false, side: DoubleSide
  }));
  fish.frustumCulled = false;
  scene.add(fish);

  /* Medusas (3 en móvil, 5 en desktop) */
  const bellGeo = new SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const places = PLACE.filter((_, i) => !small || i % 2 === 0);
  const jellies = places.map((p, i) => {
    const t = places.length > 1 ? i / (places.length - 1) : 0;
    const shared = {
      uTime: U.uTime, uDensity: U.uDensity,
      uSeed: { value: i * 0.37 + 0.11 },
      uColA: { value: CYAN.clone().lerp(MAGENTA, t * 0.75) },
      uColB: { value: VIOLET.clone().lerp(MAGENTA, t) }
    };
    const common = { transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide };
    const bell = new Mesh(bellGeo, new ShaderMaterial({ uniforms: { ...shared }, vertexShader: BELL_V, fragmentShader: BELL_F, ...common }));
    const tent = new LineSegments(tentacleGeometry(14, 12, 2.6, 0.85), new ShaderMaterial({ uniforms: { ...shared }, vertexShader: TENT_V, fragmentShader: TENT_F, ...common }));
    const g = new Group();
    g.add(bell, tent);
    g.scale.setScalar(p.s);
    g.position.z = p.z;
    g.userData = { x: p.x, y: p.y, s: shared.uSeed.value };
    scene.add(g);
    return g;
  });

  /* Estado de cámara y entrada */
  const clock = new Clock();
  let sv = state.visual; let mx = 0; let my = 0; let cx = 0; let xs = 1; let flow = 0;

  if (!reduce) {
    addEventListener('pointermove', (e) => {
      mx = (e.clientX / innerWidth - 0.5) * 2;
      my = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  function draw(dt) {
    U.uTime.value += reduce ? 0 : dt;
    const t = U.uTime.value;
    sv += (state.visual - sv) * (reduce ? 1 : Math.min(1, dt * 4));
    cx += (mx - cx) * Math.min(1, dt * 3);
    camera.position.set(cx, -sv * CAM_RANGE - my * 0.5, 6);
    camera.rotation.y = -cx * 0.03;

    /* Todo el "clima" submarino depende de la profundidad visual (0..1) */
    U.uV.value = sv;
    U.uDensity.value = 0.035 + sv * 0.025;
    U.uLamp.value = sstep(0.22, 0.6, sv);
    U.uBub.value = 1 - 0.9 * sstep(0, 0.8, sv);
    flow += dt * (0.2 + 0.5 * Math.sin(Math.PI * Math.min(1, sv * 1.4))); /* corriente más fuerte a media agua */
    U.uFlow.value = flow;

    for (const j of jellies) {
      const d = j.userData;
      j.position.y = d.y + Math.sin(t * 0.4 + d.s * 10) * 0.8;
      j.position.x = d.x * xs + Math.sin(t * 0.25 + d.s * 5) * 0.6;
      j.rotation.y = t * 0.1 + d.s;
      j.rotation.z = Math.sin(t * 0.3 + d.s) * 0.08;
    }
    renderer.render(scene, camera);
  }

  /* Bucle con pausa en pestaña oculta */
  let raf = 0; let running = false;
  function loop() {
    if (!running) return;
    draw(Math.min(clock.getDelta(), 0.05));
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (running || reduce) return; running = true; clock.getDelta(); raf = requestAnimationFrame(loop); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  /* prefers-reduced-motion: sin bucle, se redibuja solo al hacer scroll/resize */
  let pending = false;
  const once = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(0); });
  };
  if (reduce) addEventListener('scroll', once, { passive: true });

  /* Resize (ignora cambios pequeños de alto por la barra del móvil) */
  let w = 0; let h = 0;
  function resize() {
    const nw = innerWidth; const nh = innerHeight;
    if (nw === w && Math.abs(nh - h) < 120) return;
    w = nw; h = nh;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    xs = Math.min(1, camera.aspect);
    U.uXS.value = xs;
    U.uAsp.value = camera.aspect;
    bg.material.uniforms.uRes.value.set(w, h);
    if (reduce) once();
  }
  addEventListener('resize', resize);
  resize();

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    canvas.classList.remove('ready');
    document.documentElement.classList.add('no-webgl');
  });

  draw(0);
  canvas.classList.add('ready');
  start();
}
