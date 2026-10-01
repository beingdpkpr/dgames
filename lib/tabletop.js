/* dgames tabletop kit — the Penfight look for 3D board games, shared by every 3D tabletop game.
 *
 * Load after three.js r128:   <script src="../lib/three.min.js"></script>
 *                             <script src="../lib/tabletop.js"></script>
 * A plain script, not a module, so a game opened over file:// works too. One global: `Tabletop`.
 *
 * Units are centimetres, y is up, the desk top is the plane y = 0 (Penfight's convention).
 *
 * ---- API ----
 * Tabletop.supported()                         -> true if a WebGL context can be made at all
 * Tabletop.create({ canvas | container, quality: 'low'|'high'|'auto', onTap(hit, ev) })
 *     -> { ok:false, reason }  when three.js is missing, ?no3d is in the URL, or WebGL fails: fall back to 2D.
 *     -> kit { ok:true, THREE, renderer, scene, camera, canvas, quality, Q, reducedMotion,
 *              setDesk({ w, d }), rig, pick, tween, hop, drop, shake, makeDie,
 *              board({ w, d, h, draw, px, radius, side }), add(obj), invalidate(), onFrame(fn) -> off,
 *              resize(), info(), dispose() }
 *   Rendering is on demand: a frame is drawn only while a tween, a camera move or a gesture is running, or
 *   after invalidate(). A board game is still most of the time, and a still frame costs nothing — that is
 *   the single biggest saving on a phone. Rendering also stops while the tab is hidden.
 * kit.rig: setView('angled'|'top', { instant }), view, fit({ w, d, h, cx, cz }), setYaw(rad), orbit(dx,dy),
 *          zoom(f), snap(). One-finger drag orbits within limits, pinch / wheel zooms; a press that does not
 *          move more than a few pixels is a TAP, so orbiting and tapping a piece can never be confused.
 * kit.pick: add(object3d, data) -> remove(), at(clientX, clientY, { filter, radius }) -> data | null.
 *          A ray hit wins; failing that, the nearest pickable whose centre is within `radius` CSS px
 *          (default: max(26, 5% of the canvas's short side)), so a 20px piece on a phone is still tappable.
 * kit.tween({ ms, ease, update(k), done }) -> { cancel, promise }   (ease: a name in Tabletop.ease)
 * kit.hop(obj, points[[x,y,z]...], { height, stepMs, squash }) -> promise   hops square by square, arc + squash
 * kit.drop(obj, { from, to, ms }) -> promise                         falls and bounces to rest
 * kit.shake(obj, { amp, ms }) -> promise
 * kit.fly(obj, [x,y,z], { height, ms }) -> promise              one long arc (a captured piece going home)
 * kit.finishAll()  jumps every running animation to its last frame; kit.busy() -> any running
 * kit.makeDie({ size, color, pip, baseY }) -> die { mesh, show(face), roll(face, { from:[x,z], to:[x,z], ms }) -> promise }
 *          The game's simulation decides the face; the die only animates to it.
 * Tabletop.mat.{lacquer, plastic, paintedWood, paper, felt, metal, glass}(color, extra) — Penfight's recipes.
 * Tabletop.col(hex)             sRGB hex -> the linear THREE.Color three r128 needs (see "Colour" below)
 * Tabletop.PALETTE              Penfight's room / desk / ink colours
 * Tabletop.geo.{roundedBox, slab, merge}    small geometry helpers (merge = fewer draw calls)
 * Tabletop.math                 the pure parts (easing, arcs, path sampling, die faces, pick radius);
 *                               no three.js needed, tested by lib/test/*.js under node.
 *
 * ---- Colour, and why the numbers look different from Penfight's source ----
 * Penfight inlines three r158; this kit runs on r128. r158 converts every hex colour from sRGB to linear
 * and treats light intensity physically (no hidden x PI). To get Penfight's picture from r128 the kit
 * (1) sets renderer.physicallyCorrectLights = true, which is r128's name for the same lighting maths, so
 * Penfight's intensities (hemisphere 1.0, sun 1.9) carry over unchanged, and (2) converts every colour it
 * hands to a material, light or fog through col(), and tags canvas textures sRGBEncoding. The clear colour
 * is the one thing r128 does not encode, so the background takes the raw hex.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- pure maths (no three.js)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    // Falls and bounces twice, settling at exactly 1. Used for a dropped piece and a landing die.
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  // Height of a hop at u in [0,1]: a parabola peaking at `h` half way, zero at both feet.
  const arc = (u, h) => 4 * h * u * (1 - u);
  // Vertical squash of a landing piece: 0 in the air, dipping to -amt right at touchdown and recovering.
  // Only the last 22% of a hop and the first moment after it squash, so the piece reads as landing.
  function squashAt(u, amt) {
    if (u < 0.78) return 0;
    const k = (u - 0.78) / 0.22;          // 0..1 over the landing
    return -amt * Math.sin(k * Math.PI);
  }
  // Position along a hop-by-hop path at time fraction t in [0,1]. points: [[x,y,z], ...], first = start.
  // Every hop takes the same time, the way a counted move does. Returns { x, y, z, i, u, sq } where i is
  // the hop being made, u its own fraction, and sq the landing squash (a scale offset, <= 0).
  function hopSample(points, t, height, squash) {
    const n = points.length - 1;
    if (n <= 0) { const p = points[0]; return { x: p[0], y: p[1], z: p[2], i: 0, u: 1, sq: 0 }; }
    t = clamp(t, 0, 1);
    const f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
    const a = points[i], b = points[i + 1];
    return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u) + arc(u, height), z: lerp(a[2], b[2], u), i, u, sq: squashAt(u, squash || 0) };
  }
  // A single long arc from a to b (a captured piece flying home): height scales with the distance.
  function flightSample(a, b, t, height) {
    t = clamp(t, 0, 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t) + arc(t, height), lerp(a[2], b[2], t)];
  }

  // Die faces. The die is built with value v on the face whose outward normal is DIE_NORMAL[v] in its own
  // space (opposite faces sum to 7, as on a real die). DIE_TILT[v] is the [x, z] rotation, applied in
  // Euler order 'YXZ' after a free yaw, that turns that face to +Y (up). Whole extra turns on x and z
  // leave the final pose unchanged — that is what makes the die tumble instead of snapping.
  const DIE_NORMAL = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
  const DIE_TILT = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };
  function dieEuler(face, yaw, spinsX, spinsZ) {
    const t = DIE_TILT[face];
    if (!t) throw new Error('die face must be 1..6, got ' + face);
    return { x: t[0] + 2 * Math.PI * (spinsX | 0), y: yaw || 0, z: t[1] + 2 * Math.PI * (spinsZ | 0), order: 'YXZ' };
  }
  // Rotate vector v by Euler (x, y, z) in order 'YXZ' (R = Ry * Rx * Rz), the convention three.js uses.
  function rotateYXZ(v, e) {
    let [x, y, z] = v;
    let c = Math.cos(e.z), s = Math.sin(e.z); [x, y] = [x * c - y * s, x * s + y * c];           // Rz
    c = Math.cos(e.x); s = Math.sin(e.x); [y, z] = [y * c - z * s, y * s + z * c];                 // Rx
    c = Math.cos(e.y); s = Math.sin(e.y); [x, z] = [x * c + z * s, -x * s + z * c];                // Ry
    return [x, y, z];
  }
  // Which face is up for a pose: the face whose rotated normal has the largest y.
  function faceUp(e) {
    let best = 0, by = -Infinity;
    for (let f = 1; f <= 6; f++) { const y = rotateYXZ(DIE_NORMAL[f], e)[1]; if (y > by) { by = y; best = f; } }
    return best;
  }

  // Generous touch radius in CSS px: never below 26 (a 52px target, past the 44px guideline), and growing
  // with the canvas so a big desktop board is not stingy either.
  const pickRadius = (w, h, min) => Math.max(min || 26, 0.05 * Math.min(w, h));
  // Nearest of pts [{ x, y, ... }] to (px, py) within r; null if none. Ties go to the earlier point.
  function nearestWithin(pts, px, py, r) {
    let best = null, bd = r * r;
    for (const p of pts) {
      const d = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
      if (d <= bd && (best === null || d < bd)) { best = p; bd = d; }
    }
    return best;
  }
  // A drag that stays inside this many CSS px is a tap. Fingers wobble; 9px is more than a steady tap and
  // much less than an intended orbit.
  const TAP_SLOP = 9;
  const isTap = (dx, dy, slop) => dx * dx + dy * dy <= (slop || TAP_SLOP) * (slop || TAP_SLOP);

  // Shortest signed angle from a to b.
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // Frame-rate independent smoothing factor (Penfight's camera uses rate 7).
  const damp = (dt, rate) => 1 - Math.exp(-dt * rate);

  const math = { clamp, lerp, ease, arc, squashAt, hopSample, flightSample, DIE_NORMAL, DIE_TILT, dieEuler,
    rotateYXZ, faceUp, pickRadius, nearestWithin, isTap, TAP_SLOP, wrapAngle, damp };

  // ---------------------------------------------------------------- Penfight's look
  // Every value below is read out of penfight/index.html (createStage, drawDeskTexture, penMaterials).
  const PALETTE = {
    room: '#D9DCF0', ink: '#2B2F5C', paper: '#FBFAF5', desk: '#F2DCBB', deskGrain: [190, 146, 98],
    deskEdge: '#E6C39A', frame: '#B9B3DF', foot: '#8E88B8', floorA: '#EAE5F4', floorB: '#F4F0FA',
    metal: '#CDD1DE', gold: '#E8C77E', clear: '#E7F1FB',
    pink: '#F4A3B5', mint: '#8FD8C0', lemon: '#FFE07A', coral: '#FF8E7E', sky: '#A9CBF2', lilac: '#CDBDF2',
  };
  const TABLE_H = 74;            // desk height, cm
  // Quality presets. dpr caps follow Penfight (2) at high; low is the phone budget.
  const QUALITY = {
    low: { dpr: 1.25, shadows: true, shadowMap: 1024, soft: false, boardPx: 1024, segs: 0.6 },
    high: { dpr: 2, shadows: true, shadowMap: 2048, soft: true, boardPx: 2048, segs: 1 },
  };

  let T = null;                  // THREE, bound by create()
  const three = () => (T = T || root.THREE);
  const col = (hex) => new (three().Color)(hex).convertSRGBToLinear();

  function rng32(seed) {        // Penfight's mulberry32
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Penfight's std() helper: MeshStandardMaterial, roughness .55, envMapIntensity .55 unless overridden.
  function std(color, o) {
    three();
    const m = new T.MeshStandardMaterial(Object.assign({ roughness: 0.55, metalness: 0, envMapIntensity: 0.55 }, o || {}));
    if (color != null) m.color = col(color);
    return m;
  }
  const mat = {
    // Penfight's glossy barrel (body, gloss: roughness .2) pushed a little further for a lacquered piece.
    lacquer: (c, o) => std(c, Object.assign({ roughness: 0.16, envMapIntensity: 0.95 }, o)),
    plastic: (c, o) => std(c, Object.assign({ roughness: 0.42 }, o)),
    paintedWood: (c, o) => std(c, Object.assign({ roughness: 0.6, envMapIntensity: 0.45 }, o)),
    // The desk top recipe (roughness .7, env .2), for a printed board face or a card.
    paper: (c, o) => std(c == null ? '#ffffff' : c, Object.assign({ roughness: 0.78, envMapIntensity: 0.2 }, o)),
    felt: (c, o) => std(c, Object.assign({ roughness: 1, envMapIntensity: 0.1 }, o)),
    metal: (c, o) => std(c == null ? PALETTE.metal : c, Object.assign({ metalness: 0.85, roughness: 0.26, envMapIntensity: 1.1 }, o)),
    glass: (c, o) => std(c == null ? PALETTE.clear : c, Object.assign({ roughness: 0.08, transparent: true, opacity: 0.42, depthWrite: false }, o)),
  };

  // ---------------------------------------------------------------- geometry helpers
  function roundRectShape(w, d, r) {           // Penfight's roundRectShape
    three();
    const s = new T.Shape(), hw = w / 2, hd = d / 2;
    s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
    s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd); s.lineTo(-hw + r, hd);
    s.quadraticCurveTo(-hw, hd, -hw, hd - r); s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    return s;
  }
  // Rounded slab, base at y = 0, top at y = h, footprint w x d (Penfight's slab). Group 0 = top and bottom
  // caps (UVs in cm: pair with a texture whose repeat is 1/w, 1/d and offset .5), group 1 = the sides.
  function slab(w, d, h, r, bevel) {
    three();
    const geo = new T.ExtrudeGeometry(roundRectShape(w - 2 * bevel, d - 2 * bevel, Math.max(0.01, r - bevel)), {
      depth: Math.max(0.01, h - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 5,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bevel, 0);
    return geo;
  }
  // Box with rounded edges: a subdivided box whose vertices are pulled onto a rounded hull. UVs and the
  // six material groups of BoxGeometry survive, so each face can still take its own material.
  function roundedBox(s, r, seg) {
    three();
    const g = new T.BoxGeometry(s, s, s, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal;
    const inner = s / 2 - r, v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(clamp(v.x, -inner, inner), clamp(v.y, -inner, inner), clamp(v.z, -inner, inner));
      v.sub(c);
      const len = v.length() || 1;
      v.multiplyScalar(r / len);
      n.setXYZ(i, v.x / r, v.y / r, v.z / r);
      v.add(c);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  // Merge geometries (same attributes) into one, so a cluster of static parts costs one draw call.
  // r128 keeps mergeBufferGeometries in examples/, which a plain-script game cannot import.
  function merge(geos) {
    three();
    const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const names = Object.keys(list[0].attributes).filter((k) => list.every((g) => g.attributes[k]));
    const out = new T.BufferGeometry();
    for (const k of names) {
      const size = list[0].attributes[k].itemSize;
      let len = 0; for (const g of list) len += g.attributes[k].array.length;
      const arr = new Float32Array(len); let off = 0;
      for (const g of list) { arr.set(g.attributes[k].array, off); off += g.attributes[k].array.length; }
      out.setAttribute(k, new T.BufferAttribute(arr, size));
    }
    list.forEach((g, i) => { if (g !== geos[i]) g.dispose(); });
    out.computeBoundingSphere();
    return out;
  }

  // ---------------------------------------------------------------- textures
  function canvasTex(c, renderer) {
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  // Penfight's drawDeskTexture without its pen-fight doodles ("no crossing!", the halfway line): the same
  // #F2DCBB base, 150 sine-wave grain strokes from seed 11, and the inset pencil keyline.
  function drawDeskTexture(renderer, W, D, px) {
    const cw = px, ch = Math.round((px * D) / W), ppc = cw / W;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const x = c.getContext('2d');
    const rng = rng32(11), k = cw / 2048;
    x.fillStyle = PALETTE.desk; x.fillRect(0, 0, cw, ch);
    const [gr, gg, gb] = PALETTE.deskGrain;
    for (let i = 0; i < 150; i++) {
      const y0 = rng() * ch, amp = (2 + rng() * 10) * k, freq = (0.002 + rng() * 0.004) / k, ph = rng() * 6;
      x.strokeStyle = `rgba(${gr},${gg},${gb},${0.04 + rng() * 0.08})`;
      x.lineWidth = (1 + rng() * 4) * k;
      x.beginPath();
      for (let pxx = 0; pxx <= cw; pxx += 24 * k) {
        const py = y0 + Math.sin(pxx * freq + ph) * amp;
        pxx ? x.lineTo(pxx, py) : x.moveTo(pxx, py);
      }
      x.stroke();
    }
    x.strokeStyle = 'rgba(150,108,72,0.28)'; x.lineWidth = Math.max(1, 3 * k);
    x.strokeRect(ppc * 0.7, ppc * 0.7, cw - ppc * 1.4, ch - ppc * 1.4);
    const tex = canvasTex(c, renderer);
    tex.repeat.set(1 / W, 1 / D);
    tex.offset.set(0.5, 0.5);
    return tex;
  }

  // ---------------------------------------------------------------- support
  function supported() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  const prefersReducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const isTouch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };

  // ---------------------------------------------------------------- create
  function create(opts) {
    opts = opts || {};
    T = root.THREE;
    if (!T) return { ok: false, reason: 'three.js did not load' };
    try { if (/[?&]no3d\b/.test(location.search)) return { ok: false, reason: 'disabled by ?no3d' }; } catch (e) { /* no location */ }
    if (!supported()) return { ok: false, reason: 'WebGL is not available' };

    let canvas = opts.canvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
      (opts.container || document.body).appendChild(canvas);
    }
    const qName = opts.quality === 'high' || opts.quality === 'low' ? opts.quality : (isTouch() ? 'low' : 'high');
    const Q = QUALITY[qName];

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      if (!opts.canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return { ok: false, reason: 'WebGL context could not be created: ' + (e && e.message) };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
    renderer.outputEncoding = T.sRGBEncoding;      // r158: outputColorSpace = SRGBColorSpace
    renderer.physicallyCorrectLights = true;      // r158: useLegacyLights = false (its default)
    renderer.toneMapping = T.NoToneMapping;        // Penfight sets none
    renderer.shadowMap.enabled = Q.shadows;
    renderer.shadowMap.type = Q.soft ? T.PCFSoftShadowMap : T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;         // re-rendered only on frames that draw
    renderer.info.autoReset = true;

    const scene = new T.Scene();
    scene.background = new T.Color(PALETTE.room);  // clear colour: not encoded by r128, so the raw hex
    scene.fog = new T.Fog(col(PALETTE.room), 360, 1000);
    const camera = new T.PerspectiveCamera(36, 1, 1, 2500);

    // Penfight's environment: a 256x128 pastel gradient with two bright "windows", prefiltered by PMREM.
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 256; envCanvas.height = 128;
    const ec = envCanvas.getContext('2d');
    const eg = ec.createLinearGradient(0, 0, 0, 128);
    eg.addColorStop(0, '#FFFFFF'); eg.addColorStop(0.45, '#E4E3F6'); eg.addColorStop(0.55, '#D6D2E8'); eg.addColorStop(1, '#E9D6BC');
    ec.fillStyle = eg; ec.fillRect(0, 0, 256, 128);
    ec.fillStyle = 'rgba(255,255,255,0.9)'; ec.fillRect(40, 18, 46, 30); ec.fillRect(170, 22, 30, 22);
    const envTex = new T.CanvasTexture(envCanvas);
    envTex.mapping = T.EquirectangularReflectionMapping;
    envTex.encoding = T.sRGBEncoding;
    const pmrem = new T.PMREMGenerator(renderer);
    const envRT = pmrem.fromEquirectangular(envTex);
    scene.environment = envRT.texture;
    envTex.dispose(); pmrem.dispose();

    // Penfight's lights, same colours and intensities (physicallyCorrectLights makes them mean the same).
    const hemi = new T.HemisphereLight(col('#F7F5FF'), col('#D9C6AE'), 1.0);
    const sun = new T.DirectionalLight(col('#FFF5E8'), 1.9);
    sun.position.set(-45, 140, 60);
    sun.castShadow = Q.shadows;
    sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(hemi, sun, sun.target);

    // Penfight's floor tiles: the pastel room the desk stands in.
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const tc = tile.getContext('2d');
    tc.fillStyle = PALETTE.floorA; tc.fillRect(0, 0, 256, 256);
    tc.fillStyle = PALETTE.floorB; tc.fillRect(0, 0, 128, 128); tc.fillRect(128, 128, 128, 128);
    tc.strokeStyle = 'rgba(160,150,190,0.16)'; tc.lineWidth = 3; tc.strokeRect(0, 0, 256, 256);
    tc.beginPath(); tc.moveTo(128, 0); tc.lineTo(128, 256); tc.moveTo(0, 128); tc.lineTo(256, 128); tc.stroke();
    const tileTex = canvasTex(tile, renderer);
    tileTex.wrapS = tileTex.wrapT = T.RepeatWrapping;
    tileTex.repeat.set(1800 / 120, 1800 / 120);
    const floor = new T.Mesh(new T.PlaneGeometry(1800, 1800), std(null, { map: tileTex, roughness: 0.9, envMapIntensity: 0.3 }));
    floor.material.color = new T.Color(1, 1, 1);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TABLE_H;
    floor.receiveShadow = true;
    scene.add(floor);

    const kit = { ok: true, THREE: T, renderer, scene, camera, canvas, quality: qName, Q, reducedMotion: prefersReducedMotion(), TABLE_H };
    try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { kit.reducedMotion = e.matches; }); } catch (e) { /* old Safari */ }

    // ---- desk
    let deskGroup = null, desk = { w: 80, d: 50 };
    kit.setDesk = function (o) {
      const W = o.w, D = o.d;
      desk = { w: W, d: D };
      if (deskGroup) { scene.remove(deskGroup); disposeTree(deskGroup); }
      deskGroup = new T.Group();
      const hw = W / 2, hd = D / 2, depth = 2.2, bev = 0.55;
      const topGeo = new T.ExtrudeGeometry(roundRectShape(W, D, 1.4), { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 6 });
      topGeo.rotateX(-Math.PI / 2);
      topGeo.translate(0, -(depth + bev), 0);
      const topMat = std(null, { map: drawDeskTexture(renderer, W, D, Q.boardPx), roughness: 0.7, envMapIntensity: 0.2 });
      topMat.color = new T.Color(1, 1, 1);
      const top = new T.Mesh(topGeo, [topMat, std(PALETTE.deskEdge, { roughness: 0.55, envMapIntensity: 0.4 })]);
      top.receiveShadow = true; top.castShadow = true;
      deskGroup.add(top);
      // Legs, rails and feet merged into two meshes: eight parts for two draw calls.
      const legH = TABLE_H - 3.3, frame = [], feet = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        frame.push(new T.CylinderGeometry(1.3, 1.1, legH, 18).translate(sx * (hw - 4), -3.3 - legH / 2, sz * (hd - 4)));
        feet.push(new T.CylinderGeometry(1.5, 1.6, 1.2, 18).translate(sx * (hw - 4), -TABLE_H + 0.6, sz * (hd - 4)));
      }
      for (const s of [-1, 1]) {
        frame.push(new T.BoxGeometry(W - 8, 4.5, 1.1).translate(0, -5.8, s * (hd - 4)));
        frame.push(new T.BoxGeometry(1.1, 4.5, D - 8).translate(s * (hw - 4), -5.8, 0));
      }
      const fm = new T.Mesh(merge(frame), std(PALETTE.frame, { roughness: 0.32, metalness: 0.35, envMapIntensity: 0.9 }));
      fm.castShadow = true;
      deskGroup.add(fm, new T.Mesh(merge(feet), std(PALETTE.foot, { roughness: 0.9 })));
      frame.concat(feet).forEach((g) => g.dispose());
      scene.add(deskGroup);
      // Shadow frustum hugs the desk: a tight frustum is a sharper shadow from the same map.
      const ext = Math.max(W, D) / 2 + 6;
      Object.assign(sun.shadow.camera, { near: 20, far: 420, left: -ext, right: ext, top: ext, bottom: -ext });
      sun.shadow.camera.updateProjectionMatrix();
      kit.invalidate();
      return deskGroup;
    };

    // ---- printed board: a thick painted-wood slab with a canvas-printed top face
    kit.board = function (o) {
      const w = o.w, d = o.d, h = o.h || 1.6, px = o.px || Q.boardPx;
      const c = document.createElement('canvas');
      c.width = px; c.height = Math.round((px * d) / w);
      o.draw(c.getContext('2d'), c.width, c.height, c.width / w);
      const tex = canvasTex(c, renderer);
      tex.repeat.set(1 / w, 1 / d);
      tex.offset.set(0.5, 0.5);
      const face = mat.paper('#ffffff', { map: tex });
      const side = o.side || mat.paintedWood(PALETTE.deskEdge);
      const m = new T.Mesh(slab(w, d, h, o.radius == null ? 0.8 : o.radius, o.bevel == null ? 0.25 : o.bevel), [face, side]);
      m.receiveShadow = true; m.castShadow = true;
      m.userData.repaint = () => { o.draw(c.getContext('2d'), c.width, c.height, c.width / w); tex.needsUpdate = true; kit.invalidate(); };
      return m;
    };

    kit.add = (o) => { scene.add(o); kit.invalidate(); return o; };

    // ---- frame loop (on demand)
    let dirty = 2, running = false, raf = 0, last = 0, hidden = document.hidden, clock = 0;
    kit.timeScale = 1;
    const frameFns = new Set(), tweens = new Set();
    kit.invalidate = () => { dirty = Math.max(dirty, 1); wake(); };
    kit.onFrame = (fn) => { frameFns.add(fn); wake(); return () => frameFns.delete(fn); };
    function wake() { if (!running && !hidden && !disposed) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
    let disposed = false;
    function frame(now) {
      raf = 0;
      if (hidden || disposed) { running = false; return; }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      // Tweens run on their own clock: real time (a stalled frame is caught up, up to 250ms) times
      // kit.timeScale, which a test can turn down to photograph a die in mid-air.
      clock += (last ? Math.min(250, now - last) : 16) * kit.timeScale;
      last = now;
      let busy = false;
      for (const tw of Array.from(tweens)) { if (tw.step(clock)) busy = true; }
      for (const fn of Array.from(frameFns)) { if (fn(dt, now)) busy = true; }
      if (rig.step(dt)) busy = true;
      if (busy || dirty > 0) {
        if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
        renderer.render(scene, camera);
        if (dirty > 0) dirty--;
      }
      if (busy || dirty > 0 || tweens.size || gesture.active) raf = requestAnimationFrame(frame);
      else running = false;
    }
    const onVis = () => { hidden = document.hidden; if (!hidden) { dirty = 1; wake(); } };
    document.addEventListener('visibilitychange', onVis);

    // ---- tweens
    kit.tween = function (o) {
      let res; const promise = new Promise((r) => { res = r; });
      const ms = kit.reducedMotion && !o.keepWithReducedMotion ? 0 : (o.ms || 0);
      const fn = typeof o.ease === 'function' ? o.ease : ease[o.ease || 'inOutQuad'];
      let t0 = null, doneFlag = false;
      const tw = {
        step(now) {
          if (t0 === null) t0 = now;
          const k = ms <= 0 ? 1 : clamp((now - t0) / ms, 0, 1);
          if (o.update) o.update(fn(k), k);
          if (k >= 1) finish();
          return true;
        },
      };
      // finish(true) is a fast-forward: the tween is drawn at its last frame before it ends, so a skipped
      // animation still leaves every piece exactly where it was going.
      function finish(jump) {
        if (doneFlag) return; doneFlag = true; tweens.delete(tw);
        if (jump && o.update) o.update(fn(1), 1);
        if (o.done) o.done(); res(); kit.invalidate();
      }
      tw.finish = finish;
      tweens.add(tw); wake();
      return { promise, cancel: () => finish(true), then: (a, b) => promise.then(a, b) };
    };
    // Jump every running tween to its end (a tap that says "get on with it").
    kit.finishAll = () => { for (const tw of Array.from(tweens)) tw.finish(true); };
    kit.busy = () => tweens.size > 0;
    kit.hop = function (obj, points, o) {
      o = o || {};
      const h = o.height == null ? 1.6 : o.height, stepMs = o.stepMs || 170, sq = o.squash == null ? 0.18 : o.squash;
      const s0 = obj.scale.y;
      if (kit.reducedMotion) { const p = points[points.length - 1]; obj.position.set(p[0], p[1], p[2]); kit.invalidate(); return Promise.resolve(); }
      return kit.tween({ ms: stepMs * Math.max(1, points.length - 1), ease: 'linear', update: (k) => {
        const s = hopSample(points, k, h, sq);
        obj.position.set(s.x, s.y, s.z);
        obj.scale.y = s0 * (1 + s.sq);
        obj.scale.x = obj.scale.z = s0 * (1 - s.sq * 0.5);
        if (o.onHop && s.i !== obj.userData._hopI) { obj.userData._hopI = s.i; o.onHop(s.i); }
      }, done: () => { obj.scale.set(s0, s0, s0); obj.userData._hopI = undefined; } }).promise;
    };
    kit.fly = function (obj, to, o) {
      o = o || {};
      const a = [obj.position.x, obj.position.y, obj.position.z];
      const dist = Math.hypot(to[0] - a[0], to[2] - a[2]);
      const h = o.height == null ? Math.max(3, dist * 0.45) : o.height;
      return kit.tween({ ms: o.ms || 520 + dist * 10, ease: 'inOutQuad', update: (k) => {
        const p = flightSample(a, to, k, h); obj.position.set(p[0], p[1], p[2]);
        if (o.spin) obj.rotation.y = k * Math.PI * 2 * o.spin;
      } }).promise;
    };
    kit.drop = function (obj, o) {
      o = o || {};
      const from = o.from == null ? obj.position.y + 6 : o.from, to = o.to == null ? 0 : o.to;
      return kit.tween({ ms: o.ms || 520, ease: 'outBounce', update: (k) => { obj.position.y = lerp(from, to, k); } }).promise;
    };
    kit.shake = function (obj, o) {
      o = o || {};
      if (kit.reducedMotion) return Promise.resolve();
      const amp = o.amp || 0.4, x0 = obj.position.x, z0 = obj.position.z;
      return kit.tween({ ms: o.ms || 320, ease: 'linear', update: (k) => {
        const f = (1 - k) * amp * Math.sin(k * Math.PI * 10);
        obj.position.x = x0 + f; obj.position.z = z0 + f * 0.5;
      }, done: () => { obj.position.x = x0; obj.position.z = z0; } }).promise;
    };

    // ---- die
    kit.makeDie = function (o) {
      o = o || {};
      const s = o.size || 2.4, r = s * 0.16, seg = Math.max(3, Math.round(6 * Q.segs));
      const body = new T.Mesh(roundedBox(s, r, seg), mat.lacquer(o.color || PALETTE.paper, { roughness: 0.28 }));
      // Pips: shallow domes slightly sunk into each face, all 21 merged into one mesh.
      const pr = s * 0.085, pips = [], half = s / 2, off = s * 0.24;
      const LAYOUT = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
      for (let f = 1; f <= 6; f++) {
        const nrm = new T.Vector3().fromArray(DIE_NORMAL[f]);
        // two in-face axes perpendicular to the normal
        const u = Math.abs(nrm.y) > 0.5 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
        const v = new T.Vector3().crossVectors(nrm, u);
        for (const [a, b] of LAYOUT[f]) {
          const g = new T.SphereGeometry(pr, 10, 6);
          const pos = nrm.clone().multiplyScalar(half - pr * 0.3).addScaledVector(u, a * off).addScaledVector(v, b * off);
          // flatten along the normal so it reads as a painted dimple, not a ball
          const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), nrm);
          g.scale(1, 0.45, 1); g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(q)); g.translate(pos.x, pos.y, pos.z);
          pips.push(g);
        }
      }
      const pipMesh = new T.Mesh(merge(pips), std(o.pip || PALETTE.ink, { roughness: 0.3 }));
      pips.forEach((g) => g.dispose());
      const mesh = new T.Group();
      body.castShadow = true; body.receiveShadow = true;
      mesh.add(body, pipMesh);
      mesh.rotation.order = 'YXZ';
      const restY = (o.baseY || 0) + half;   // resting on a board top rather than the desk: pass baseY
      mesh.position.y = restY;
      const die = { mesh, size: s, face: 1, restY };
      die.show = (face, yaw) => {
        const e = dieEuler(face, yaw == null ? mesh.rotation.y : yaw, 0, 0);
        mesh.rotation.set(e.x, e.y, e.z, 'YXZ'); mesh.position.y = restY; die.face = face; kit.invalidate();
      };
      // Thrown from `from` to `to` (desk x, z): flies in a low arc, tumbles whole turns, lands on `face`
      // with two small bounces. The face is decided by the caller; nothing here is random except the look.
      die.roll = (face, ro) => {
        ro = ro || {};
        const to = ro.to || [mesh.position.x, mesh.position.z];
        const from = ro.from || [to[0] - 6, to[1] + 4];
        const yaw = (ro.yaw != null ? ro.yaw : Math.random() * Math.PI * 2);
        die.face = face;
        if (kit.reducedMotion) { mesh.position.set(to[0], restY, to[1]); die.show(face, yaw); return Promise.resolve(); }
        const sx = 2 + (Math.random() * 2 | 0), sz = 1 + (Math.random() * 2 | 0);
        const e1 = dieEuler(face, yaw, sx, sz);
        const e0 = { x: mesh.rotation.x % (2 * Math.PI), y: mesh.rotation.y, z: mesh.rotation.z % (2 * Math.PI) };
        const ms = ro.ms || 900, h = ro.height == null ? s * 2.2 : ro.height;
        if (ro.onStart) ro.onStart();
        return kit.tween({ ms, ease: 'linear', update: (k) => {
          // position: one arc over the first 60%, then the bounce tail settles height
          const kp = Math.min(1, k / 0.6);
          const x = lerp(from[0], to[0], ease.outQuad(kp)), z = lerp(from[1], to[1], ease.outQuad(kp));
          let y;
          if (k < 0.6) y = restY + arc(kp, h) * (1 - kp * 0.5) + (1 - kp) * h * 0.5;
          else { const kb = (k - 0.6) / 0.4; y = restY + (1 - ease.outBounce(kb)) * s * 0.35 * (1 - kb); }
          mesh.position.set(x, y, z);
          const kr = ease.outCubic(k);
          mesh.rotation.set(lerp(e0.x, e1.x, kr), lerp(e0.y, e1.y, kr), lerp(e0.z, e1.z, kr), 'YXZ');
          if (ro.onUpdate) ro.onUpdate(k);
        }, done: () => { mesh.position.set(to[0], restY, to[1]); mesh.rotation.set(e1.x % (2 * Math.PI), e1.y, e1.z % (2 * Math.PI), 'YXZ'); } }).promise;
      };
      die.show(1, 0.5);
      return die;
    };

    // ---- camera rig
    const cam = { yaw: 0, pitch: 0.85, dist: 120, tx: 0, tz: 0 };
    const goal = Object.assign({}, cam);
    // top is 85 degrees, not 90: a plan a phone can count squares on, with a sliver of each piece's side
    // still showing so it reads as standing up rather than as a dot.
    const VIEWS = { angled: 0.86, top: 1.484 };
    let view = 'angled', baseYaw = 0, fitBox = { w: 60, d: 60, h: 4, cx: 0, cz: 0 }, fitDist = 120, moving = true;
    const v3 = new T.Vector3();
    function placeCamera(c, cmr) {
      const cp = Math.cos(c.pitch);
      cmr.position.set(c.tx + c.dist * cp * Math.sin(c.yaw), c.dist * Math.sin(c.pitch), c.tz + c.dist * cp * Math.cos(c.yaw));
      cmr.lookAt(c.tx, 0, c.tz);
      cmr.updateMatrixWorld();
    }
    // Distance at which the fit box just fills the view at (pitch, yaw): measured by projecting its corners
    // with a scratch camera and rescaling, rather than estimated, so a tilted board never clips.
    const scratch = new T.PerspectiveCamera(36, 1, 1, 2500);
    function computeFit(pitch, yaw) {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, b = fitBox, m = b.margin == null ? 0.94 : b.margin;
      scratch.aspect = w / h; scratch.fov = camera.fov; scratch.updateProjectionMatrix();
      const c = { yaw, pitch, dist: 100, tx: b.cx, tz: b.cz };
      // aim at the box centre in screen terms: iterate distance and target shift together
      for (let it = 0; it < 6; it++) {
        placeCamera(c, scratch);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1]) {
          v3.set(b.cx + sx * b.w / 2, sy * b.h, b.cz + sz * b.d / 2).project(scratch);
          x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y);
        }
        const ext = Math.max((x1 - x0) / 2, (y1 - y0) / 2) / m;
        c.dist *= ext;
        // nudge the target along the camera's forward ground direction so the box is vertically centred
        const cy = (y0 + y1) / 2;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const shift = cy * c.dist * 0.8 * Math.tan((camera.fov * Math.PI) / 360) / Math.max(0.3, Math.sin(pitch));
        c.tx += fx * shift; c.tz += fz * shift;
      }
      return c;
    }
    const rig = {
      get view() { return view; },
      get state() { return cam; },
      fit(box) { fitBox = Object.assign({ w: 60, d: 60, h: 4, cx: 0, cz: 0 }, box); rig.setView(view, { keepYaw: true, instant: !!(box && box.instant) }); },
      setYaw(y, instant) { baseYaw = y; rig.setView(view, { instant }); },
      setView(name, o) {
        o = o || {};
        view = VIEWS[name] ? name : 'angled';
        const c = computeFit(VIEWS[view], baseYaw);
        fitDist = c.dist;
        Object.assign(goal, { yaw: baseYaw, pitch: VIEWS[view], dist: c.dist, tx: c.tx, tz: c.tz });
        if (o.instant || kit.reducedMotion) rig.snap();
        moving = true; kit.invalidate();
      },
      // limited orbit: +-0.55 rad of yaw around the view's own, pitch between a low angle and straight down
      orbit(dx, dy) {
        goal.yaw = baseYaw + clamp(wrapAngle(goal.yaw - dx * 0.006 - baseYaw), -0.55, 0.55);
        goal.pitch = clamp(goal.pitch + dy * 0.005, 0.55, 1.565);
        moving = true; kit.invalidate();
      },
      zoom(f) { goal.dist = clamp(goal.dist * f, fitDist * 0.55, fitDist * 1.35); moving = true; kit.invalidate(); },
      reset() { rig.setView(view); },
      snap() { Object.assign(cam, goal); moving = true; kit.invalidate(); },
      step(dt) {
        if (!moving) return false;
        const k = kit.reducedMotion ? 1 : damp(dt, 7);
        cam.yaw += wrapAngle(goal.yaw - cam.yaw) * k;
        cam.pitch += (goal.pitch - cam.pitch) * k;
        cam.dist += (goal.dist - cam.dist) * k;
        cam.tx += (goal.tx - cam.tx) * k; cam.tz += (goal.tz - cam.tz) * k;
        placeCamera(cam, camera);
        const err = Math.abs(wrapAngle(goal.yaw - cam.yaw)) + Math.abs(goal.pitch - cam.pitch) + Math.abs(goal.dist - cam.dist) / 50 + Math.abs(goal.tx - cam.tx) / 50 + Math.abs(goal.tz - cam.tz) / 50;
        if (err < 1e-4) { Object.assign(cam, goal); placeCamera(cam, camera); moving = false; }
        return true;
      },
    };
    kit.rig = rig;

    // ---- picking
    const pickables = new Map();     // object3d -> data
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    kit.pick = {
      add(obj, data) { pickables.set(obj, data === undefined ? obj : data); return () => pickables.delete(obj); },
      clear() { pickables.clear(); },
      at(clientX, clientY, o) {
        o = o || {};
        const filter = o.filter || (() => true);
        const rect = canvas.getBoundingClientRect();
        const cands = [];
        for (const [obj, data] of pickables) if (obj.visible !== false && filter(data, obj)) cands.push([obj, data]);
        if (!cands.length) return null;
        ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObjects(cands.map((c) => c[0]), true);
        if (hits.length) {
          for (let o2 = hits[0].object; o2; o2 = o2.parent) if (pickables.has(o2)) return pickables.get(o2);
        }
        const pts = cands.map(([obj, data]) => {
          obj.getWorldPosition(v3); v3.project(camera);
          return { x: rect.left + ((v3.x + 1) / 2) * rect.width, y: rect.top + ((1 - v3.y) / 2) * rect.height, data };
        });
        const best = nearestWithin(pts, clientX, clientY, o.radius || pickRadius(rect.width, rect.height));
        return best ? best.data : null;
      },
    };

    // ---- gestures: drag = orbit, pinch / wheel = zoom, a still press = tap
    const gesture = { active: false, pts: new Map(), moved: false, x0: 0, y0: 0, pinch0: 0 };
    canvas.style.touchAction = 'none';
    const onDown = (e) => {
      gesture.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ }
      if (gesture.pts.size === 1) { gesture.active = true; gesture.moved = false; gesture.x0 = e.clientX; gesture.y0 = e.clientY; }
      if (gesture.pts.size === 2) { gesture.moved = true; const [a, b] = Array.from(gesture.pts.values()); gesture.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const onMove = (e) => {
      const p = gesture.pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (gesture.pts.size >= 2) {
        const [a, b] = Array.from(gesture.pts.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (gesture.pinch0 > 0 && d > 0) rig.zoom(gesture.pinch0 / d);
        gesture.pinch0 = d;
        return;
      }
      if (!gesture.moved && !isTap(e.clientX - gesture.x0, e.clientY - gesture.y0)) gesture.moved = true;
      if (gesture.moved && opts.orbit !== false) rig.orbit(dx, dy);
    };
    const onUp = (e) => {
      if (!gesture.pts.has(e.pointerId)) return;
      gesture.pts.delete(e.pointerId);
      if (gesture.pts.size === 0) {
        gesture.active = false;
        if (!gesture.moved && e.type === 'pointerup' && opts.onTap) opts.onTap(e.clientX, e.clientY, e);
      }
    };
    const onWheel = (e) => { e.preventDefault(); rig.zoom(Math.exp(e.deltaY * 0.0012)); };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', () => rig.reset());

    // ---- size
    let lastW = 0, lastH = 0;
    kit.resize = function () {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rig.setView(view, { instant: true });
    };
    let ro = null;
    if (root.ResizeObserver) { ro = new ResizeObserver(() => kit.resize()); ro.observe(canvas); }
    const onWinResize = () => kit.resize();
    addEventListener('resize', onWinResize);

    // renderer.info for one drawn frame
    kit.info = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });

    function disposeTree(o) {
      o.traverse((n) => {
        if (n.geometry) n.geometry.dispose();
        const ms = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      });
    }
    kit.disposeTree = disposeTree;
    kit.dispose = function () {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('resize', onWinResize);
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      tweens.clear(); frameFns.clear(); pickables.clear();
      disposeTree(scene);
      envRT.dispose();
      renderer.dispose();
      try { const ext = renderer.getContext().getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* gone already */ }
      if (!opts.canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };

    // A context lost mid-game (a phone reclaiming GPU memory) is reported, so the game can drop to 2D.
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (opts.onLost) opts.onLost(); });

    kit.resize();
    rig.snap();
    return kit;
  }

  const Tabletop = { create, supported, math, ease, PALETTE, QUALITY, TABLE_H, mat, isTouch, prefersReducedMotion,
    col: (h) => col(h), geo: { roundedBox: (...a) => roundedBox(...a), slab: (...a) => slab(...a), merge: (g) => merge(g), roundRectShape: (...a) => roundRectShape(...a) } };
  // mat/geo need THREE; bind lazily so a node test can load the pure parts without it.
  root.Tabletop = Tabletop;
  if (typeof module !== 'undefined' && module.exports) module.exports = Tabletop;
})(typeof window !== 'undefined' ? window : globalThis);
