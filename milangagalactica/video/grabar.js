// Graba escenas de Deriva en 9:16 (1080x1920, 30 fps) con un piloto automático.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const FF = '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const V = __dirname;

// Piloto automático: se inyecta en la página.
const AUTOPILOT = `
window.__auto = (() => {
  const t = window.__t;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const pass = (x, y) => { const c = t.cellType(x, y); return !t.SOLID(c) && c !== t.T.SEA; };
  let path = [], i = 0, vmax = 14, stuck = 0, reverse = 0, stopAtEnd = true;
  function plan(pred, minD, maxR, only) {
    const sx = t.toCell(t.player.x), sy = t.toCell(t.player.z);
    const prev = new Map(), q = [[sx, sy]], k0 = sx + ',' + sy;
    prev.set(k0, null);
    let found = null;
    for (let h = 0; h < q.length && !found; h++) {
      const [x, y] = q[h];
      const d = Math.abs(x - sx) + Math.abs(y - sy);
      if (d >= minD && pred(x, y)) { found = [x, y]; break; }
      if (Math.abs(x - sx) > maxR || Math.abs(y - sy) > maxR) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + a, ny = y + b, k = nx + ',' + ny;
        if (prev.has(k) || !pass(nx, ny) || (only && !only(nx, ny))) continue;
        prev.set(k, x + ',' + y); q.push([nx, ny]);
      }
    }
    if (!found) return false;
    const cells = [];
    let k = found[0] + ',' + found[1];
    while (k) { cells.push(k.split(',').map(Number)); k = prev.get(k); }
    cells.reverse();
    path = cells.map(([x, y]) => [t.toWorld(x), t.toWorld(y)]);
    i = 0;
    // Arrancar mirando hacia el camino.
    const n = path[Math.min(1, path.length - 1)];
    if (path.length > 1) t.player.heading = Math.atan2(-(n[1] - t.player.z), n[0] - t.player.x);
    return true;
  }
  function drive() {
    const p = t.player;
    if (!path.length) { t.keys.up = false; t.keys.down = p.speed > 1; t.gyro.steer = 0; return; }
    while (i < path.length - 1 && Math.hypot(path[i][0] - p.x, path[i][1] - p.z) < 7) i++;
    const [tx, tz] = path[Math.min(i + 1, path.length - 1)];
    const desired = Math.atan2(-(tz - p.z), tx - p.x);
    const diff = wrap(desired - p.heading);
    t.gyro.on = true;
    // Si quedó trabado, marcha atrás girando al revés un momento.
    if (reverse > 0) { reverse--; t.keys.up = false; t.keys.down = true; t.gyro.steer = -Math.sign(diff || 1); return; }
    stuck = p.speed < 1.2 ? stuck + 1 : 0;
    if (stuck > 18) { stuck = 0; reverse = 28; }
    t.gyro.steer = Math.max(-1, Math.min(1, diff * 2.4));
    const sharp = Math.abs(diff) > 0.55;
    const last = stopAtEnd && i >= path.length - 1 && Math.hypot(tx - p.x, tz - p.z) < 6;
    t.keys.up = !last && !(sharp && p.speed > 8) && p.speed < vmax;
    t.keys.down = last ? p.speed > 0.5 : (sharp && p.speed > 12);
  }
  return { plan, drive, setMax(v) { vmax = v; }, keepGoing() { stopAtEnd = false; }, done: () => !path.length || (i >= path.length - 1) };
})();
`;

function encoder(out) {
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  ff.stderr.on('data', d => process.stderr.write(d));
  return ff;
}

async function main() {
  const which = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 560, height: 1000 } });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.route('**/three.min.js', r => r.fulfill({ path: V + '/three.min.js', contentType: 'application/javascript' }));
  await p.goto('file://' + V + '/harness.html');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await p.evaluate(AUTOPILOT);

  const scenes = {
    // Laberinto de noche, cámara de atrás.
    laberinto: { secs: 14, setup: `
      const t = __t; t.start(); t.cap(2); t.light(1.7); t.setOpt('view', 'Atrás');
      __auto.setMax(13);
      const city = (x, y) => { const c = t.cellType(x, y); return (c === t.T.STREET || c === t.T.AVENUE || c === t.T.PLAZA) && !t.zoneAt(x, y); };
      __auto.plan(city, 45, 90, city);` },
    // Por el eje de una avenida, desde adentro: las tachas hacia el horizonte.
    avenida: { secs: 11, setup: `
      const t = __t; t.start(); t.cap(2.5); t.light(2.2);
      let x = 0, y = 0, ok = false;
      for (let k = 0; k < 400 && !ok; k++) { x = 26 * Math.floor(k / 20) + 1; y = 22 * (k % 20) + 4;
        ok = true; for (let d = 0; d < 20; d++) if (t.cellType(x, y + d) !== t.T.AVENUE || t.zoneAt(x, y + d)) { ok = false; break; } }
      t.go(t.toWorld(x), t.toWorld(y), -Math.PI / 2); t.setOpt('view', 'Adentro');
      __auto.setMax(18);
      __auto.plan((a, b) => a === x && b === y + 17, 10, 40);` },
    // Rally en el monte, cruzando una montaña.
    monte: { secs: 14, setup: `
      const t = __t; t.start(); t.cap(2); t.light(1.6); t.setOpt('view', 'Atrás');
      // Buscar una montaña con pasto a los dos lados.
      let best = null;
      for (let r = 5; r < 160 && !best; r += 1) for (let a = 0; a < 16 && !best; a++) {
        const cx = Math.round(Math.cos(a / 16 * 6.283) * r), cy = Math.round(Math.sin(a / 16 * 6.283) * r);
        if (t.cellType(cx, cy) !== t.T.MOUNTAIN) continue;
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const ax = cx - dx * 7, ay = cy - dy * 7, bx = cx + dx * 7, by = cy + dy * 7;
          if (t.cellType(ax, ay) === t.T.FOREST && t.cellType(bx, by) === t.T.FOREST) { best = [ax, ay, bx, by]; break; }
        }
      }
      const [ax, ay, bx, by] = best;
      t.go(t.toWorld(ax), t.toWorld(ay), Math.atan2(-(by - ay), bx - ax));
      __auto.setMax(17);
      __auto.plan((x, y) => x === bx && y === by, 4, 30);` },
    // La nada: poca luz, ojos que aparecen, susurros.
    nada: { secs: 16, setup: `
      const t = __t; t.start(); t.cap(2); t.light(0.35); t.setOpt('view', 'Atrás');
      // Una cuadra honda de la nada, lejos de su horizonte.
      let pick = null;
      for (let r = 5; r < 220 && !pick; r++) for (let a = 0; a < 24 && !pick; a++) {
        const cx = Math.round(Math.cos(a / 24 * 6.283) * r), cy = Math.round(Math.sin(a / 24 * 6.283) * r);
        if (t.cellType(cx, cy) !== t.T.VOID) continue;
        let ok = true; for (let b = -3; b <= 3 && ok; b++) for (let c = -3; c <= 3; c++) if (t.cellType(cx + c, cy + b) !== t.T.VOID) { ok = false; break; }
        if (ok && t.monteNoise(cx, cy) < 0.71) pick = [cx, cy];
      }
      t.go(t.toWorld(pick[0]), t.toWorld(pick[1]), 0.7);
      __auto.setMax(5);
      __auto.plan((x, y) => t.cellType(x, y) === t.T.VOID && t.monteNoise(x, y) < 0.715, 12, 40);` },
    // El horizonte de eventos y el final.
    horizonte: { secs: 19, setup: `
      const t = __t; t.start(); t.cap(2); t.light(1.2); t.setOpt('view', 'Atrás');
      let hz = null;
      for (let r = 5; r < 220 && !hz; r += 3) for (let a = 0; a < 24 && !hz; a++) {
        const cx = Math.round(Math.cos(a / 24 * 6.283) * r), cy = Math.round(Math.sin(a / 24 * 6.283) * r);
        if (t.cellType(cx, cy) === t.T.VOID && t.monteNoise(cx, cy) > 0.73) { t.go(t.toWorld(cx), t.toWorld(cy), 0); for (let k = 0; k < 3; k++) t.step(); if (t.beacons.size) hz = 1; }
      }
      let g = null, bd = 1e9; t.beacons.forEach(v => { const d = Math.hypot(v.position.x - t.player.x, v.position.z - t.player.z); if (d < bd) { bd = d; g = v; } });
      const gx = t.toCell(g.position.x), gy = t.toCell(g.position.z);
      // Arrancar a unas 7 cuadras, mirando al haz.
      let sx = gx - 7, sy = gy; for (const [a, b2] of [[-7, 0], [7, 0], [0, -7], [0, 7], [-5, -5], [5, 5]]) if (t.cellType(gx + a, gy + b2) === t.T.VOID) { sx = gx + a; sy = gy + b2; break; }
      t.go(t.toWorld(sx), t.toWorld(sy), Math.atan2(-(gy - sy), gx - sx));
      __auto.setMax(10); __auto.keepGoing();
      __auto.plan((x, y) => x === gx && y === gy, 1, 20);` }
  };

  const list = which ? [which] : Object.keys(scenes);
  for (const name of list) {
    const sc = scenes[name];
    await p.evaluate(() => { __t.newWorld(700); });
    await p.evaluate(sc.setup);
    // Unos cuadros sin grabar para que la cámara y el mundo se acomoden.
    const warm = name === 'nada' ? 240 : 20;
    for (let k = 0; k < warm; k++) await p.evaluate(() => { __auto.drive(); __t.step(); });
    const ff = encoder(V + '/deriva-' + name + '.mp4');
    const frames = sc.secs * 30;
    for (let f = 0; f < frames; f++) {
      const data = await p.evaluate(() => { __auto.drive(); __t.step(); return document.getElementById('game').toDataURL('image/png'); });
      const buf = Buffer.from(data.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 90 === 0) console.log(name, f + '/' + frames, 'zona', await p.evaluate(() => __t.zone()), 'vel', await p.evaluate(() => __t.player.speed.toFixed(1)), 'final', await p.evaluate(() => __t.ending()));
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('listo', name);
  }
  await b.close();
}
main().catch(e => { console.error(e); process.exit(1); });
