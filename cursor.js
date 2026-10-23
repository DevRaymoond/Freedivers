// Cursor "blob": um ponto vermelho no mouse e um anel que o persegue com suavização exponencial.
// O anel estica na direção do movimento, ondula devagar, cresce e fica laranja sobre itens clicáveis
// e encolhe ao clicar. Desenhado num canvas acima de tudo, nunca captura cliques.
(() => {
  const cv = document.getElementById('cursorCanvas');
  const ctx = cv.getContext('2d');
  const CLICKABLE = 'button:not(:disabled), .clickable, a[href], label, input, select';

  const mouse = { x: -100, y: -100 };
  const ring = { x: -100, y: -100 };
  let sx = 1, sy = 1, rot = 0;
  let near = 0, nearT = 0;          // contador global de itens clicáveis sob o mouse e sua versão suavizada (0..1)
  let pressed = false, dotR = 3, shrink = 0;
  let started = false, fadeStart = 0, alpha = 0;
  let last = performance.now(), time = 0;
  let enabled = true;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();

  // O navegador só entrega a posição por eventos; guardamos a última e a lemos uma vez por quadro.
  addEventListener('mousemove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!started) { started = true; fadeStart = performance.now(); ring.x = mouse.x; ring.y = mouse.y; }
  }, { passive: true });
  addEventListener('mousedown', () => { pressed = true; });
  addEventListener('mouseup', () => { pressed = false; });
  addEventListener('blur', () => { pressed = false; });

  // "SetNear(true/false)" por item clicável
  const marked = new WeakSet();
  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest(CLICKABLE);
    if (el && !marked.has(el)) { marked.add(el); near++; }
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest && e.target.closest(CLICKABLE);
    if (el && marked.has(el) && !(e.relatedTarget && el.contains(e.relatedTarget))) { marked.delete(el); near = Math.max(0, near - 1); }
  });
  // botões que ficam desabilitados ou somem sob o mouse não geram mouseout: reconta de vez em quando
  setInterval(() => {
    const el = document.elementFromPoint(mouse.x, mouse.y);
    const hit = el && el.closest && el.closest(CLICKABLE);
    near = hit ? 1 : 0;
  }, 200);

  const lerpK = (f, dt) => 1 - Math.pow(1 - f, dt * 60);      // mesmo resultado em qualquer taxa de quadros

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now; time += dt;
    if (!enabled || !started) { ctx.clearRect(0, 0, innerWidth, innerHeight); return; }

    // anel persegue o mouse
    const k = lerpK(0.18, dt);
    ring.x += (mouse.x - ring.x) * k; ring.y += (mouse.y - ring.y) * k;
    const dx = mouse.x - ring.x, dy = mouse.y - ring.y, dist = Math.hypot(dx, dy);
    const h = Math.min(dist / 150, 0.42);
    if (dist > 0.6) rot = Math.atan2(dy, dx);
    const k2 = lerpK(0.2, dt);
    sx += (1 + h - sx) * k2;                 // alonga na direção do movimento
    sy += (1 - h * 0.72 - sy) * k2;          // afina no eixo perpendicular

    nearT += ((near > 0 ? 1 : 0) - nearT) * lerpK(0.25, dt);
    shrink += ((pressed ? 8 : 0) - shrink) * lerpK(0.35, dt);
    dotR += ((pressed ? 5.4 : 3) - dotR) * lerpK(0.4, dt);
    alpha = Math.min(1, (performance.now() - fadeStart) / 350);

    const R = (30 + (52 - 30) * nearT - shrink) / 2;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';

    // contorno orgânico: 64 segmentos
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const th = (i / 64) * Math.PI * 2;
      const r = R * (1 + 0.05 * Math.sin(2 * th + time * 0.9) + 0.035 * Math.sin(3 * th - time * 1.3));
      const px = r * Math.cos(th) * sx, py = r * Math.sin(th) * sy;
      const x = ring.x + px * cos - py * sin, y = ring.y + px * sin + py * cos;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (nearT > 0.01) { ctx.fillStyle = `rgba(242,140,31,${0.10 * nearT})`; ctx.fill(); }
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.stroke();                 // contorno escuro por baixo
    const mix = (a, b) => Math.round(a + (b - a) * nearT);
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${mix(255, 242)},${mix(255, 140)},${mix(255, 31)},${0.62 + 0.38 * nearT})`;
    ctx.stroke();

    // ponto: posição real do clique
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#FF1A14'; ctx.fill();
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);

  window.__cursor = {
    show(v) {
      enabled = v;
      cv.style.display = v ? 'block' : 'none';
      document.documentElement.classList.toggle('nocursor', v);
    },
  };
})();
