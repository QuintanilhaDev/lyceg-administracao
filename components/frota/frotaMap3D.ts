/**
 * Mapa 3D da frota: um relevo de colunas hexagonais que se eleva perto dos postos
 * (quanto mais veículos, mais alto), faróis mostarda pulsando em cada posto e um
 * feixe de sonar varrendo a área. Arraste para girar, role ou faça pinça para zoom,
 * toque num farol para abrir o posto.
 *
 * Só é carregado quando a aba Mapa abre (o three.js não pesa nas outras telas).
 */
import * as THREE from 'three';

export interface MapPosto {
  id: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
}

interface Options {
  onPick: (id: string | null) => void;
  reduced?: boolean;
}

const HEX_R = 0.3;
const GRID = 30; // hexágonos por lado (900 colunas, uma única malha instanciada)

function palette(light: boolean) {
  return light
    ? { low: new THREE.Color('#c9d2ec'), high: new THREE.Color('#2546c9'), beacon: new THREE.Color('#b8860b'), sel: new THREE.Color('#0b0b0d'), sweep: new THREE.Color('#2546c9'), label: '#ffffff', labelBg: 'rgba(11,11,13,0.82)', ring: new THREE.Color('#b8860b'), fog: new THREE.Color('#eef0f6') }
    : { low: new THREE.Color('#14161f'), high: new THREE.Color('#3d6bff'), beacon: new THREE.Color('#e3a92f'), sel: new THREE.Color('#ffffff'), sweep: new THREE.Color('#4c7dff'), label: '#0b0b0d', labelBg: 'rgba(227,169,47,0.95)', ring: new THREE.Color('#e3a92f'), fog: new THREE.Color('#0b0b0d') };
}

function labelSprite(text: string, bg: string, fg: string): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '700 34px "Sora", "Plus Jakarta Sans", system-ui, sans-serif';
  g.font = font;
  const w = Math.min(560, Math.ceil(g.measureText(text).width) + 44);
  c.width = w;
  c.height = 64;
  g.font = font;
  g.fillStyle = bg;
  const r = 20;
  g.beginPath();
  g.moveTo(r, 4);
  g.arcTo(w - 2, 4, w - 2, 60, r);
  g.arcTo(w - 2, 60, 2, 60, r);
  g.arcTo(2, 60, 2, 4, r);
  g.arcTo(2, 4, w - 2, 4, r);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set((w / 64) * 0.55, 0.55, 1);
  s.renderOrder = 10;
  return s;
}

export function createFrotaMap(host: HTMLElement, opts: Options) {
  const light = () => document.documentElement.dataset.theme === 'light';
  let pal = palette(light());
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'fr-map-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(pal.fog, 18, 40);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x0b0b0d, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x4c7dff, 0.9);
  rim.position.set(-8, 4, -6);
  scene.add(rim);

  /* ---------- relevo hexagonal ---------- */
  const world = new THREE.Group();
  scene.add(world);
  const hexGeo = new THREE.CylinderGeometry(HEX_R * 0.94, HEX_R * 0.94, 1, 6, 1);
  hexGeo.translate(0, 0.5, 0);
  const hexMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.35, vertexColors: false });
  const hexes = new THREE.InstancedMesh(hexGeo, hexMat, GRID * GRID);
  hexes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(hexes);
  const cells: { x: number; z: number; base: number; infl: number; phase: number }[] = [];
  const dx = HEX_R * Math.sqrt(3);
  const dz = HEX_R * 1.5;
  for (let r = 0; r < GRID; r++)
    for (let q = 0; q < GRID; q++) {
      const x = (q - GRID / 2) * dx + (r % 2 ? dx / 2 : 0);
      const z = (r - GRID / 2) * dz;
      cells.push({ x, z, base: 0.06 + Math.random() * 0.05, infl: 0, phase: Math.random() * Math.PI * 2 });
    }
  // borda do disco: colunas fora do raio somem (o relevo fica redondo, como uma mesa de sonar)
  const RADIUS = (GRID / 2) * dz * 0.98;

  /* ---------- sonar ---------- */
  const sweepGeo = new THREE.CircleGeometry(RADIUS, 64, 0, Math.PI / 5);
  const sweepMat = new THREE.MeshBasicMaterial({ color: pal.sweep, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const sweep = new THREE.Mesh(sweepGeo, sweepMat);
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = 0.02;
  world.add(sweep);
  const rings: THREE.Mesh[] = [];
  for (let i = 1; i <= 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(RADIUS * (i / 3) - 0.015, RADIUS * (i / 3) + 0.015, 128), new THREE.MeshBasicMaterial({ color: pal.sweep, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    world.add(ring);
    rings.push(ring);
  }

  /* ---------- faróis dos postos ---------- */
  type Beacon = { id: string; g: THREE.Group; col: THREE.Mesh; top: THREE.Mesh; ring: THREE.Mesh; hit: THREE.Mesh; label: THREE.Sprite; h: number; x: number; z: number };
  let beacons: Beacon[] = [];
  const beaconMat = () => new THREE.MeshStandardMaterial({ color: pal.beacon, emissive: pal.beacon, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4 });
  const colGeo = new THREE.CylinderGeometry(0.09, 0.14, 1, 20);
  colGeo.translate(0, 0.5, 0);
  const topGeo = new THREE.OctahedronGeometry(0.26, 0);
  const ringGeo = new THREE.RingGeometry(0.26, 0.34, 48);
  const hitGeo = new THREE.SphereGeometry(0.45, 8, 8);
  let selected: string | null = null;

  function clearBeacons() {
    for (const b of beacons) {
      world.remove(b.g);
      (b.col.material as THREE.Material).dispose();
      (b.top.material as THREE.Material).dispose();
      (b.ring.material as THREE.Material).dispose();
      b.label.material.map?.dispose();
      b.label.material.dispose();
    }
    beacons = [];
  }

  let lastPostos: MapPosto[] = [];
  function setPostos(list: MapPosto[], sel: string | null) {
    lastPostos = list;
    selected = sel;
    clearBeacons();
    for (const c of cells) c.infl = 0;
    if (!list.length) return;
    // enquadra os postos no disco (projeção local; 1 grau de longitude encolhe com a latitude)
    const lat0 = list.reduce((t, p) => t + p.lat, 0) / list.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = list.map((p) => p.lng * k);
    const zs = list.map((p) => -p.lat);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(0.02, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    const scale = (RADIUS * 1.45) / span;
    const maxCount = Math.max(1, ...list.map((p) => p.count));
    for (const p of list) {
      const x = list.length === 1 ? 0 : (p.lng * k - cx) * scale;
      const z = list.length === 1 ? 0 : (-p.lat - cz) * scale;
      const h = 0.9 + (Math.min(p.count, 30) / Math.max(6, maxCount)) * 3.2;
      const on = p.id === sel;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const col = new THREE.Mesh(colGeo, beaconMat());
      col.scale.y = h;
      const top = new THREE.Mesh(topGeo, beaconMat());
      top.position.y = h + 0.3;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: pal.ring, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = h * 0.6;
      hit.scale.set(1, Math.max(1, h * 0.8), 1);
      const label = labelSprite(`${p.label} · ${p.count}`, on ? '#ffffff' : pal.labelBg, on ? '#0b0b0d' : pal.label);
      label.position.y = h + 0.9;
      if (on) {
        (col.material as THREE.MeshStandardMaterial).color.copy(pal.sel);
        (col.material as THREE.MeshStandardMaterial).emissive.set('#4c7dff');
        (top.material as THREE.MeshStandardMaterial).emissive.set('#4c7dff');
        top.scale.setScalar(1.35);
      }
      g.add(col, top, ring, hit, label);
      world.add(g);
      beacons.push({ id: p.id, g, col, top, ring, hit, label, h, x, z });
      // o relevo sobe em volta do posto (influência gaussiana)
      for (const c of cells) {
        const d2 = (c.x - x) ** 2 + (c.z - z) ** 2;
        c.infl = Math.max(c.infl, (0.35 + h * 0.32) * Math.exp(-d2 / 1.6));
      }
    }
  }

  /* ---------- câmera (girar, inclinar, zoom) ---------- */
  let yaw = 0.6;
  let tilt = 0.82;
  let zoom = 1;
  let target = new THREE.Vector3();
  const goal = new THREE.Vector3();
  let drag: { x: number; y: number } | null = null;
  let moved = 0;
  let idleAt = performance.now();
  const pinch = new Map<number, { x: number; y: number }>();
  let pinchD = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const onDown = (e: PointerEvent) => {
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
    drag = { x: e.clientX, y: e.clientY };
    moved = 0;
    idleAt = performance.now();
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) zoom = Math.max(0.45, Math.min(1.8, zoom * (pinchD / d)));
      pinchD = d;
      moved += 10;
      return;
    }
    if (!drag) return;
    const dxp = e.clientX - drag.x;
    const dyp = e.clientY - drag.y;
    moved += Math.abs(dxp) + Math.abs(dyp);
    yaw -= dxp * 0.006;
    tilt = Math.max(0.32, Math.min(1.32, tilt + dyp * 0.004));
    drag = { x: e.clientX, y: e.clientY };
    idleAt = performance.now();
  };
  const onUp = (e: PointerEvent) => {
    pinch.delete(e.pointerId);
    if (pinch.size < 2) pinchD = 0;
    if (drag && moved < 6) pick(e);
    drag = null;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom = Math.max(0.45, Math.min(1.8, zoom * (1 + e.deltaY * 0.0011)));
    idleAt = performance.now();
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  function pick(e: PointerEvent) {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(beacons.map((b) => b.hit), false);
    const b = hits.length ? beacons.find((x) => x.hit === hits[0].object) : null;
    opts.onPick(b ? b.id : null);
  }

  /** leva a câmera até o posto */
  function focus(id: string | null) {
    const b = id ? beacons.find((x) => x.id === id) : null;
    goal.set(b ? b.x : 0, 0, b ? b.z : 0);
    if (b) zoom = Math.min(zoom, 0.8);
  }

  /* ---------- tamanho e laço de desenho ---------- */
  let w = 0;
  let h = 0;
  const resize = () => {
    w = host.clientWidth;
    h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let visible = true;
  const io = new IntersectionObserver((en) => {
    visible = en[0]?.isIntersecting ?? true;
  });
  io.observe(host);

  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const col = new THREE.Color();
  let raf = 0;
  let last = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    if (now - last < (opts.reduced ? 250 : 16)) return;
    last = now;
    const t = (now - t0) / 1000;
    // giro automático lento quando ninguém mexe
    if (!drag && now - idleAt > 2500 && !opts.reduced) yaw += 0.0016;
    target.lerp(goal, 0.06);
    const dist = 19.5 * zoom;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(tilt) * dist, Math.sin(tilt) * dist, target.z + Math.cos(yaw) * Math.cos(tilt) * dist);
    camera.lookAt(target);

    // relevo respirando (onda que atravessa o disco)
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const rr = Math.hypot(c.x, c.z);
      const edge = rr > RADIUS ? 0 : 1 - Math.pow(rr / RADIUS, 6);
      const wave = opts.reduced ? 0 : 0.05 * Math.sin(t * 1.4 - rr * 0.9 + c.phase * 0.2);
      const hh = Math.max(0.001, (c.base + c.infl + wave) * edge);
      v3.set(c.x, 0, c.z);
      s3.set(edge ? 1 : 0.0001, hh, edge ? 1 : 0.0001);
      m4.compose(v3, q4, s3);
      hexes.setMatrixAt(i, m4);
      const k = Math.min(1, c.infl / 1.2 + 0.08 + wave * 0.6);
      col.copy(pal.low).lerp(pal.high, k);
      hexes.setColorAt(i, col);
    }
    hexes.instanceMatrix.needsUpdate = true;
    if (hexes.instanceColor) hexes.instanceColor.needsUpdate = true;

    sweep.rotation.z = -t * 0.9;
    for (const b of beacons) {
      const on = b.id === selected;
      b.top.rotation.y = t * (on ? 2.4 : 1.2);
      b.top.position.y = b.h + 0.3 + Math.sin(t * 2 + b.x) * 0.08;
      const p = (t * 0.8 + b.x * 0.13) % 1;
      const s = 1 + p * (on ? 4.5 : 3);
      b.ring.scale.set(s, s, 1);
      (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - p);
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  /** troca de tema: recolore sem recriar a cena */
  const onTheme = () => {
    pal = palette(light());
    (scene.fog as THREE.Fog).color.copy(pal.fog);
    sweepMat.color.copy(pal.sweep);
    rings.forEach((r) => (r.material as THREE.MeshBasicMaterial).color.copy(pal.sweep));
    setPostos(lastPostos, selected);
  };
  window.addEventListener('lyceg:theme', onTheme);

  return {
    setPostos,
    focus,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('lyceg:theme', onTheme);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      clearBeacons();
      hexGeo.dispose();
      hexMat.dispose();
      sweepGeo.dispose();
      sweepMat.dispose();
      rings.forEach((r) => {
        r.geometry.dispose();
        (r.material as THREE.Material).dispose();
      });
      colGeo.dispose();
      topGeo.dispose();
      ringGeo.dispose();
      hitGeo.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
export type FrotaMap = ReturnType<typeof createFrotaMap>;
