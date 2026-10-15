/**
 * O Lyco em 3D: um tubarão de cara séria (empresa de segurança): focinho afilado, olhar
 * firme sob a sobrancelha franzida, meio sorriso com os dentes à mostra, azul escuro
 * com barriga clara e boné preto escrito "Lyceg" em azul. Modelo feito por código
 * (sem arquivo para baixar).
 *
 * Estados:
 *  - repouso: nada devagar, pisca, acompanha o mouse com o olhar;
 *  - ouvindo: vira de lado e encosta uma corneta acústica no ouvido (ondas entrando nela);
 *  - pensando: olha para cima, soltando bolhas;
 *  - falando: a mandíbula abre e fecha no ritmo da fala;
 *  - aviso: põe um megafone na boca (ondas saindo dele).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type SharkState = 'idle' | 'listening' | 'thinking' | 'speaking';

const C = {
  back: new THREE.Color('#0f2766'),
  backDeep: new THREE.Color('#07123a'),
  belly: new THREE.Color('#dfe3ea'),
  ink: new THREE.Color('#05060a'),
  mouth: new THREE.Color('#2a0710'),
  gum: new THREE.Color('#7a1a2c'),
  tooth: new THREE.Color('#f5f3ea'),
  cap: new THREE.Color('#07070a'),
  brass: new THREE.Color('#d9a234'),
  mustard: new THREE.Color('#e3a92f'),
  white: new THREE.Color('#ffffff'),
  royal: new THREE.Color('#2f5bea'),
  iris: new THREE.Color('#e3a92f'),
};

/** perfil do corpo (raio ao longo do eixo, da cauda ao focinho): torpedo com focinho afilado */
const PROFILE: [number, number][] = [
  [-1.62, 0.0],
  [-1.55, 0.05],
  [-1.35, 0.1],
  [-1.05, 0.2],
  [-0.7, 0.33],
  [-0.3, 0.45],
  [0.1, 0.51],
  [0.45, 0.5],
  [0.75, 0.43],
  [1.0, 0.32],
  [1.2, 0.2],
  [1.34, 0.1],
  [1.42, 0.0],
];
const SY = 1.0;
const SX = 0.86; // achatado nas laterais, como um tubarão de verdade

function radiusAt(z: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [z0, r0] = PROFILE[i];
    const [z1, r1] = PROFILE[i + 1];
    if (z >= z0 && z <= z1) {
      const t = (z - z0) / (z1 - z0);
      const s = t * t * (3 - 2 * t);
      return r0 + (r1 - r0) * s;
    }
  }
  return 0;
}
/** ponto na pele numa posição do eixo z, num ângulo a em volta do corpo (0 = lado direito, π/2 = topo) */
function skin(z: number, a: number, lift = 0): THREE.Vector3 {
  const r = radiusAt(z) + lift;
  return new THREE.Vector3(Math.cos(a) * r * SX, Math.sin(a) * r * SY, z);
}

function capTextTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#4c7dff';
    g.font = '800 168px "Sora", "Plus Jakarta Sans", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(76,125,255,0.55)';
    g.shadowBlur = 10;
    g.fillText('Lyceg', c.width / 2, c.height / 2 + 8);
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts
      .load('800 168px "Sora"')
      .then(() => {
        draw();
        tex.needsUpdate = true;
      })
      .catch(() => undefined);
  }
  return tex;
}

function blobShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,0.6)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export function createShark(canvas: HTMLCanvasElement, opts: { reduced?: boolean; pixelRatio?: number } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', premultipliedAlpha: true });
  renderer.setPixelRatio(opts.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5b86ff, 2.2);
  rim.position.set(-4, 2.5, -3);
  scene.add(rim);
  const under = new THREE.PointLight(0xe3a92f, 0.7, 10);
  under.position.set(1.5, -2, 2.5);
  scene.add(under);

  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  const root = new THREE.Group();
  const yawG = new THREE.Group();
  const body = new THREE.Group();
  root.add(yawG);
  yawG.add(body);
  scene.add(root);

  /* ---------------- corpo ---------------- */
  const curve = new THREE.SplineCurve(PROFILE.map(([z, r]) => new THREE.Vector2(r, z)));
  const pts = curve.getPoints(72).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  const bodyGeo = keep(new THREE.LatheGeometry(pts, 72));
  bodyGeo.rotateX(Math.PI / 2); // eixo do corpo vira o eixo Z (focinho para +Z)
  bodyGeo.scale(SX, SY, 1);
  {
    // contra-sombreamento: costas azul-marinho, barriga clara, linha de divisão marcada
    const pos = bodyGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.max(0.0001, radiusAt(z));
      const ny = y / (r * SY);
      const edge = -0.18 + 0.06 * Math.sin(z * 5 + x * 3);
      const t = THREE.MathUtils.smoothstep(ny, edge - 0.06, edge + 0.08);
      col.copy(C.belly).lerp(C.back, t);
      if (ny > 0.35) col.lerp(C.backDeep, Math.min(1, (ny - 0.35) * 1.4));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const skinMat = keep(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.55 }));
  body.add(new THREE.Mesh(bodyGeo, skinMat));

  const finMat = keep(new THREE.MeshPhysicalMaterial({ color: C.back, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.55 }));
  const finDeep = keep(new THREE.MeshPhysicalMaterial({ color: C.backDeep, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.55 }));
  const ext = (shape: THREE.Shape, depth: number) =>
    keep(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.35, bevelSegments: 3, curveSegments: 20 }));

  // barbatana dorsal alta e pontuda
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.22, 0);
  dorsalShape.quadraticCurveTo(0.12, 0.42, -0.24, 0.66);
  dorsalShape.quadraticCurveTo(-0.16, 0.3, -0.36, 0);
  dorsalShape.lineTo(0.22, 0);
  const dorsalGeo = ext(dorsalShape, 0.06);
  dorsalGeo.translate(0, 0, -0.03);
  const dorsal = new THREE.Mesh(dorsalGeo, finDeep);
  dorsal.rotation.y = -Math.PI / 2;
  dorsal.position.set(0, radiusAt(-0.15) * SY - 0.06, -0.15);
  body.add(dorsal);
  const d2 = new THREE.Mesh(dorsalGeo, finDeep);
  d2.rotation.y = -Math.PI / 2;
  d2.scale.setScalar(0.32);
  d2.position.set(0, radiusAt(-1.05) * SY - 0.03, -1.05);
  body.add(d2);

  // cauda em meia-lua (lobo de cima maior)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.0, -1.52);
  body.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.06, 0);
  tailShape.quadraticCurveTo(-0.1, 0.3, -0.42, 0.72);
  tailShape.quadraticCurveTo(-0.26, 0.26, -0.22, 0.02);
  tailShape.quadraticCurveTo(-0.24, -0.2, -0.36, -0.44);
  tailShape.quadraticCurveTo(-0.08, -0.18, 0.06, 0);
  const tailGeo = ext(tailShape, 0.06);
  tailGeo.translate(0, 0, -0.03);
  const tail = new THREE.Mesh(tailGeo, finDeep);
  tail.rotation.y = -Math.PI / 2;
  tailPivot.add(tail);

  // peitorais longas e afiadas (os "braços")
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0.14, 0);
  pecShape.quadraticCurveTo(0.02, 0.18, -0.46, 0.34);
  pecShape.quadraticCurveTo(-0.22, 0.08, -0.2, 0);
  pecShape.lineTo(0.14, 0);
  const makePectoral = (side: 1 | -1) => {
    const pivot = new THREE.Group();
    const at = skin(0.35, -0.75, -0.04);
    at.x = side * Math.abs(at.x);
    pivot.position.copy(at);
    const g = ext(pecShape, 0.035);
    g.translate(0, 0, -0.017);
    const m = new THREE.Mesh(g, finMat);
    m.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
    const holder = new THREE.Group();
    holder.add(m);
    holder.rotation.set(0.25, side * 0.3, side * -0.75);
    pivot.add(holder);
    body.add(pivot);
    return { pivot, holder };
  };
  const finR = makePectoral(1);
  const finL = makePectoral(-1);

  // guelras (cinco fendas de cada lado)
  const gillMat = keep(new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.7 }));
  for (const side of [1, -1] as const) {
    for (let i = 0; i < 5; i++) {
      const z = 0.38 - i * 0.075;
      const pts3 = [-0.55, -0.15, 0.25].map((a) => {
        const q = skin(z - (a + 0.15) * 0.04, a, 0.004);
        q.x *= side;
        return q;
      });
      const g = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3), 12, 0.011, 6, false));
      body.add(new THREE.Mesh(g, gillMat));
    }
  }

  /* ---------------- rosto ---------------- */
  const face = new THREE.Group();
  body.add(face);
  const eyeGeo = keep(new THREE.SphereGeometry(1, 28, 20));
  const eyeMat = keep(new THREE.MeshPhysicalMaterial({ color: C.ink, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 }));
  const irisMat = keep(new THREE.MeshBasicMaterial({ color: C.iris }));
  const glintMat = keep(new THREE.MeshBasicMaterial({ color: C.white }));
  const browMat = keep(new THREE.MeshPhysicalMaterial({ color: C.backDeep, roughness: 0.45, clearcoat: 0.6 }));
  const irisGeo = keep(new THREE.TorusGeometry(0.052, 0.008, 8, 32));
  const eyes: { lid: THREE.Group; pupil: THREE.Group; base: THREE.Vector3 }[] = [];
  const brows: THREE.Group[] = [];
  for (const side of [1, -1] as const) {
    const at = skin(0.86, 0.32, -0.03);
    at.x *= side;
    const g = new THREE.Group();
    g.position.copy(at);
    g.lookAt(at.clone().add(new THREE.Vector3(side * 1, 0.15, 0.55)));
    const lid = new THREE.Group();
    g.add(lid);
    const ball = new THREE.Mesh(eyeGeo, eyeMat);
    ball.scale.set(0.1, 0.082, 0.055);
    lid.add(ball);
    const pupil = new THREE.Group();
    // íris mostarda fininha (um brilho de alerta) + reflexo branco
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.z = 0.05;
    pupil.add(iris);
    const glint = new THREE.Mesh(eyeGeo, glintMat);
    glint.scale.setScalar(0.014);
    glint.position.set(0.022, 0.02, 0.05);
    pupil.add(glint);
    lid.add(pupil);
    face.add(g);
    eyes.push({ lid, pupil, base: pupil.position.clone() });
    // sobrancelha franzida: crista grossa descendo em direção ao focinho, cobrindo o alto do olho
    const brow = new THREE.Group();
    const bA = skin(0.7, 0.5, 0.0);
    const bB = skin(0.86, 0.47, 0.012);
    const bC = skin(1.0, 0.36, 0.0);
    [bA, bB, bC].forEach((q) => (q.x *= side));
    const bGeo = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([bA, bB, bC]), 18, 0.03, 10, false));
    brow.add(new THREE.Mesh(bGeo, browMat));
    face.add(brow);
    brows.push(brow);
  }

  // boca: meio sorriso de lado a lado com dentes triangulares; a mandíbula abre ao falar
  const mouthG = new THREE.Group();
  face.add(mouthG);
  const lipMat = keep(new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.5 }));
  const lipPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    // contorna o focinho por baixo; os cantos sobem pelas laterais (meio sorriso)
    const a = -Math.PI / 2 + (u - 0.5) * 2.75;
    const z = 1.13 - Math.pow(Math.abs(u - 0.5) * 2, 1.4) * 0.36;
    const q = skin(z, a, 0.012);
    lipPts.push(q);
  }
  const lipCurve = new THREE.CatmullRomCurve3(lipPts);
  mouthG.add(new THREE.Mesh(keep(new THREE.TubeGeometry(lipCurve, 48, 0.024, 8, false)), lipMat));
  const toothGeo = keep(new THREE.ConeGeometry(0.03, 0.085, 6));
  const toothMat = keep(new THREE.MeshPhysicalMaterial({ color: C.tooth, roughness: 0.25, clearcoat: 0.8 }));
  for (let i = 1; i < 14; i++) {
    const u = i / 14;
    if (Math.abs(u - 0.5) > 0.45) continue;
    const t = new THREE.Mesh(toothGeo, toothMat);
    { const pt = lipCurve.getPoint(u); const out = new THREE.Vector3(pt.x, pt.y, 0).normalize(); t.position.copy(pt).addScaledVector(out, 0.004).add(new THREE.Vector3(0, -0.036, 0)); }
    t.rotation.x = Math.PI;
    t.scale.setScalar(1 - Math.abs(u - 0.5) * 0.9);
    mouthG.add(t);
  }
  const jawPivot = new THREE.Group();
  jawPivot.position.copy(lipCurve.getPoint(0.5)).add(new THREE.Vector3(0, 0, -0.32));
  mouthG.add(jawPivot);
  const jaw = new THREE.Group();
  jawPivot.add(jaw);
  const inside = new THREE.Mesh(eyeGeo, keep(new THREE.MeshStandardMaterial({ color: C.mouth, roughness: 0.8 })));
  inside.scale.set(0.2, 0.06, 0.18);
  inside.position.set(0, -0.03, 0.2);
  jaw.add(inside);
  const gum = new THREE.Mesh(eyeGeo, keep(new THREE.MeshStandardMaterial({ color: C.gum, roughness: 0.7 })));
  gum.scale.set(0.16, 0.025, 0.14);
  gum.position.set(0, -0.07, 0.2);
  jaw.add(gum);
  for (let i = 1; i < 10; i++) {
    const u = 0.2 + (i / 10) * 0.6;
    const t = new THREE.Mesh(toothGeo, toothMat);
    t.position.copy(lipCurve.getPoint(u)).sub(jawPivot.position).add(new THREE.Vector3(0, -0.05, -0.03));
    t.scale.setScalar(0.75);
    jaw.add(t);
  }
  jaw.visible = false;

  /* ---------------- boné preto com "Lyceg" em azul ---------------- */
  const cap = new THREE.Group();
  const capZ = 0.42;
  cap.position.set(0, radiusAt(capZ) * SY - 0.07, capZ);
  cap.rotation.set(0.14, 0, -0.04); // aba um pouco baixa, sombreando o olhar
  body.add(cap);
  const twill = keep(new THREE.MeshPhysicalMaterial({ color: C.cap, roughness: 0.7, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#30303a'), envMapIntensity: 0.6 }));
  const CX = SX * 1.06;
  const CY = 0.78;
  const CZ = 1.08;
  const crownGeo = keep(new THREE.SphereGeometry(0.4, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2));
  crownGeo.scale(CX, CY, CZ);
  cap.add(new THREE.Mesh(crownGeo, twill));
  // costuras dos gomos
  const seamMat = keep(new THREE.MeshStandardMaterial({ color: '#1c1c24', roughness: 0.6 }));
  for (let k = 0; k < 3; k++) {
    const phi = (k / 3) * Math.PI;
    const sp: THREE.Vector3[] = [];
    for (let j = 0; j <= 10; j++) {
      const th = (j / 10) * (Math.PI / 2);
      sp.push(new THREE.Vector3(-Math.cos(phi) * Math.sin(th) * 0.402 * CX, Math.cos(th) * 0.402 * CY, Math.sin(phi) * Math.sin(th) * 0.402 * CZ));
    }
    cap.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 16, 0.005, 5, false)), seamMat));
    const sp2 = sp.map((v) => new THREE.Vector3(-v.x, v.y, -v.z));
    cap.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp2), 16, 0.005, 5, false)), seamMat));
  }
  const button = new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 16, 10)), keep(new THREE.MeshPhysicalMaterial({ color: C.mustard, roughness: 0.35, clearcoat: 1 })));
  button.position.y = 0.4 * CY;
  cap.add(button);
  // aba curva para a frente
  {
    const s = new THREE.Shape();
    s.moveTo(-0.34, 0);
    s.quadraticCurveTo(-0.36, 0.34, 0, 0.46);
    s.quadraticCurveTo(0.36, 0.34, 0.34, 0);
    s.quadraticCurveTo(0, 0.08, -0.34, 0);
    const bill = keep(new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 }));
    bill.rotateX(Math.PI / 2); // deitada; a ponta (y da forma) vai para +Z
    const pa = bill.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      const z = pa.getZ(i);
      pa.setY(i, pa.getY(i) - x * x * 0.55 - z * 0.12);
    }
    bill.computeVertexNormals();
    const billM = new THREE.Mesh(bill, twill);
    billM.position.set(0, 0.012, 0.3);
    cap.add(billM);
  }
  // letreiro na frente do boné
  const capTex = capTextTexture();
  disposables.push(capTex);
  const decalGeo = keep(new THREE.SphereGeometry(0.406, 48, 16, Math.PI / 2 - 0.85, 1.7, 0.36, 0.72));
  decalGeo.scale(CX, CY, CZ);
  const decal = new THREE.Mesh(decalGeo, keep(new THREE.MeshStandardMaterial({ map: capTex, transparent: true, roughness: 0.45, emissive: new THREE.Color('#2f5bea'), emissiveMap: capTex, emissiveIntensity: 1.1, depthWrite: false })));
  cap.add(decal);

  /* ---------------- corneta acústica (ouvindo) ---------------- */
  const brass = keep(new THREE.MeshPhysicalMaterial({ color: C.brass, metalness: 0.85, roughness: 0.28, clearcoat: 0.6, side: THREE.DoubleSide }));
  const trumpet = new THREE.Group();
  {
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      prof.push(new THREE.Vector2(0.03 + 0.2 * Math.pow(t, 2.6), t * 0.5));
    }
    const horn = new THREE.Mesh(keep(new THREE.LatheGeometry(prof, 40)), brass);
    horn.rotation.z = -Math.PI / 2;
    horn.position.x = 0.16;
    trumpet.add(horn);
    const lipT = new THREE.Mesh(keep(new THREE.TorusGeometry(0.23, 0.018, 10, 40)), brass);
    lipT.rotation.y = Math.PI / 2;
    lipT.position.x = 0.66;
    trumpet.add(lipT);
    trumpet.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.17, 0, 0), new THREE.Vector3(0.08, 0.05, 0), new THREE.Vector3(0, 0, 0)]), 16, 0.028, 10, false)), brass));
    trumpet.add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.045, 16, 12)), brass));
  }
  trumpet.position.copy(skin(0.55, 0.15, 0.0));
  trumpet.rotation.set(0, -0.25, 0.18);
  trumpet.scale.setScalar(0.001);
  body.add(trumpet);
  const waveGeo = keep(new THREE.TorusGeometry(0.2, 0.012, 6, 48, Math.PI * 1.2));
  const inWaves: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(waveGeo, keep(new THREE.MeshBasicMaterial({ color: C.royal, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })));
    w.rotation.set(0, Math.PI / 2, Math.PI * 0.4);
    trumpet.add(w);
    inWaves.push(w);
  }

  /* ---------------- megafone (aviso) ---------------- */
  const megaphone = new THREE.Group();
  {
    const shell = keep(new THREE.MeshPhysicalMaterial({ color: C.mustard, roughness: 0.32, clearcoat: 0.8, side: THREE.DoubleSide }));
    const cone = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.075, 0.27, 0.55, 48, 1, true)), shell);
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = 0.29;
    megaphone.add(cone);
    const rimM = new THREE.Mesh(keep(new THREE.TorusGeometry(0.27, 0.025, 10, 48)), keep(new THREE.MeshPhysicalMaterial({ color: C.white, roughness: 0.3, clearcoat: 1 })));
    rimM.position.z = 0.565;
    megaphone.add(rimM);
    const dark = keep(new THREE.MeshStandardMaterial({ color: C.cap, roughness: 0.5 }));
    const mp = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 32)), dark);
    mp.rotation.x = Math.PI / 2;
    megaphone.add(mp);
    const handle = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.2, 0.08)), dark);
    handle.position.set(0, -0.15, 0.18);
    handle.rotation.x = 0.25;
    megaphone.add(handle);
    const stripe = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 48, 1, true)), keep(new THREE.MeshStandardMaterial({ color: C.royal, roughness: 0.4, side: THREE.DoubleSide })));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.z = 0.3;
    megaphone.add(stripe);
  }
  megaphone.position.copy(lipCurve.getPoint(0.5)).add(new THREE.Vector3(0, -0.02, 0.02));
  megaphone.scale.setScalar(0.001);
  body.add(megaphone);
  const outWaves: THREE.Mesh[] = [];
  const outGeo = keep(new THREE.TorusGeometry(0.3, 0.016, 6, 48, Math.PI * 0.9));
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(outGeo, keep(new THREE.MeshBasicMaterial({ color: C.mustard, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })));
    w.rotation.set(0, 0, Math.PI * 0.05);
    megaphone.add(w);
    outWaves.push(w);
  }

  /* ---------------- bolhas (pensando) ---------------- */
  const bubbleMat = keep(new THREE.MeshPhysicalMaterial({ color: '#cfd9ff', roughness: 0.05, transparent: true, opacity: 0.5, clearcoat: 1 }));
  const bubbleGeo = keep(new THREE.SphereGeometry(1, 16, 12));
  const bubbles = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Mesh(bubbleGeo, bubbleMat);
    m.userData = { phase: i / 6, x: (Math.random() - 0.5) * 0.3, s: 0.035 + Math.random() * 0.04 };
    m.visible = false;
    scene.add(m);
    return m;
  });

  const shadowTex = blobShadowTexture();
  disposables.push(shadowTex);
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.2, 1.1)), keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.0;
  scene.add(shadow);

  /* ---------------- animação ---------------- */
  let state: SharkState = 'idle';
  let alert = false;
  const BASE_DIST = 6.3;
  const p = { yaw: 0.9, roll: 0, pitch: 0, trumpet: 0, mega: 0, mouth: 0, bubbles: 0, dist: BASE_DIST, lift: 0, browUp: 0 };
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  let blinkAt = performance.now() + 1800;
  let blinkStart = -1;
  let talkSeed = Math.random() * 10;
  let last = performance.now();
  const bornAt = last;
  let ema = 1 / 60;
  let slow = false;
  let raf = 0;
  let running = true;
  let visible = true;

  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(240, window.innerWidth * 0.4);
    const dy = (e.clientY - (r.top + r.height / 2)) / Math.max(240, window.innerHeight * 0.4);
    look.tx = Math.max(-1, Math.min(1, dx));
    look.ty = Math.max(-1, Math.min(1, dy));
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  const io = new IntersectionObserver((en) => {
    visible = en[0]?.isIntersecting ?? true;
  });
  io.observe(canvas);

  const tmp = new THREE.Vector3();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!running || !visible || document.hidden) {
      last = now;
      return;
    }
    const busy = state !== 'idle' || alert;
    // aparelho lento: menos quadros e menos pixels (nunca trava a página)
    if (now - last < (slow ? 45 : busy ? 0 : 30)) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ema = ema * 0.92 + dt * 0.08;
    if (!slow && ema > 0.038 && now - bornAt > 3000) {
      slow = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      resize();
    }
    const t = now / 1000;
    const red = opts.reduced;

    const listening = state === 'listening' && !alert;
    const thinking = state === 'thinking' && !alert;
    const speaking = state === 'speaking' && !alert;
    // 3/4 de perfil, focinho para a direita; ouvindo, mostra o lado com a corneta
    const tYaw = alert ? 0.75 : listening ? -1.45 : thinking ? 0.75 : speaking ? 0.7 : 0.9 + (red ? 0 : Math.sin(t * 0.3) * 0.1) + look.x * 0.2;
    const tRoll = listening ? -0.1 : alert ? 0.04 : 0;
    const tPitch = thinking ? -0.22 : alert ? 0.03 : look.y * -0.1;
    p.yaw = damp(p.yaw, tYaw, listening || alert ? 5 : 3.2, dt);
    p.roll = damp(p.roll, tRoll, 4, dt);
    p.pitch = damp(p.pitch, tPitch, 4, dt);
    p.trumpet = damp(p.trumpet, listening ? 1 : 0, listening ? 7 : 10, dt);
    p.mega = damp(p.mega, alert ? 1 : 0, alert ? 8 : 10, dt);
    p.bubbles = damp(p.bubbles, thinking ? 1 : 0, 4, dt);
    p.dist = damp(p.dist, listening ? BASE_DIST + 0.4 : BASE_DIST, 3, dt);
    p.lift = damp(p.lift, thinking ? 0.08 : 0, 3, dt);
    p.browUp = damp(p.browUp, thinking ? 1 : listening ? 0.7 : 0, 5, dt);

    const bob = red ? 0 : Math.sin(t * 1.5) * 0.05;
    root.position.y = bob + p.lift;
    yawG.rotation.set(p.pitch, p.yaw, p.roll);
    body.rotation.y = red ? 0 : Math.sin(t * 1.8) * 0.045;
    body.rotation.z = red ? 0 : Math.sin(t * 1.2) * 0.02;
    tailPivot.rotation.y = red ? 0 : Math.sin(t * (busy ? 4.6 : 3)) * (busy ? 0.4 : 0.28);
    shadow.scale.setScalar(1 - bob * 0.8);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 - bob;
    camera.position.set(0, 0.35, p.dist);
    camera.lookAt(0, 0.14 + p.lift * 0.5, 0);

    const paddle = red ? 0 : Math.sin(t * 2.2) * 0.14;
    finR.holder.rotation.set(0.25 - p.trumpet * 1.1 - p.mega * 0.8, 0.3 + p.trumpet * 0.5 + p.mega * 0.6, -0.75 + paddle + p.trumpet * 0.25 + p.mega * 0.35);
    finL.holder.rotation.set(0.25 - p.mega * 0.5, -0.3 - p.mega * 0.4, 0.75 - paddle + (speaking ? Math.sin(t * 6) * 0.12 : 0));

    trumpet.scale.setScalar(Math.max(0.001, p.trumpet));
    trumpet.visible = p.trumpet > 0.01;
    megaphone.scale.setScalar(Math.max(0.001, p.mega));
    megaphone.visible = p.mega > 0.01;
    megaphone.rotation.set(0.05, 0, Math.sin(t * 9) * 0.02 * p.mega);

    inWaves.forEach((w, i) => {
      const k = (t * 0.9 + i / 3) % 1;
      w.position.x = 1.25 - k * 0.6;
      w.scale.setScalar(1.6 - k * 1.2);
      (w.material as THREE.MeshBasicMaterial).opacity = p.trumpet * Math.sin(k * Math.PI) * 0.75;
    });
    outWaves.forEach((w, i) => {
      const k = (t * 1.3 + i / 3) % 1;
      w.position.z = 0.62 + k * 0.7;
      w.scale.setScalar(0.9 + k * 1.3);
      (w.material as THREE.MeshBasicMaterial).opacity = p.mega * (1 - k) * 0.9;
    });

    look.x = damp(look.x, listening ? -0.5 : look.tx, 6, dt);
    look.y = damp(look.y, thinking ? -0.9 : look.ty, 6, dt);
    for (const e of eyes) e.pupil.position.set(e.base.x + look.x * 0.02, e.base.y - look.y * 0.02, e.base.z);
    if (!red && now > blinkAt) {
      blinkStart = now;
      blinkAt = now + 2600 + Math.random() * 3600;
    }
    const bk = blinkStart < 0 ? 1 : Math.min(1, (now - blinkStart) / 140);
    const lid = 1 - Math.sin(bk * Math.PI) * 0.92;
    for (const e of eyes) e.lid.scale.set(1, lid, 1);
    brows.forEach((b) => (b.position.y = p.browUp * 0.025));

    let open = 0;
    if (speaking) {
      talkSeed += dt * 11;
      const n = Math.sin(talkSeed) * 0.5 + Math.sin(talkSeed * 1.7 + 1.3) * 0.35 + Math.sin(talkSeed * 2.9) * 0.15;
      open = Math.max(0, 0.3 + n * 0.7);
    }
    p.mouth = damp(p.mouth, open, 18, dt);
    jaw.visible = p.mouth > 0.03 && p.mega < 0.5;
    jawPivot.rotation.x = p.mouth * 0.5;
    jaw.scale.set(1, 0.4 + p.mouth * 0.9, 1);

    bubbles.forEach((b) => {
      b.visible = p.bubbles > 0.02;
      if (!b.visible) return;
      const d = b.userData as { phase: number; x: number; s: number };
      const k = (t * 0.35 + d.phase) % 1;
      tmp.set(0.6 + d.x + Math.sin(t * 2 + d.phase * 6) * 0.05, 0.5 + k * 1.1 + p.lift, 0.6);
      b.position.copy(tmp);
      b.scale.setScalar(d.s * (0.6 + k) * p.bubbles);
      (b.material as THREE.MeshPhysicalMaterial).opacity = 0.5 * (1 - k) * p.bubbles;
    });

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setState(s: SharkState, isAlert: boolean) {
      state = s;
      alert = isAlert;
    },
    pause(v: boolean) {
      running = !v;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      bubbles.forEach((b) => scene.remove(b));
      disposables.forEach((d) => d.dispose());
      envTex.dispose();
      renderer.dispose();
    },
  };
}
export type Shark = ReturnType<typeof createShark>;
