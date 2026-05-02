/* =================================================================
 * NM-ROM slide animations
 * Three modules: Manifold (slide 1), Poisson (slide 2), Heat (slide 3)
 * Shared helpers: viridis colormap, easing, drawing primitives.
 * ================================================================= */

const Animations = (() => {

  /* ===================== shared helpers ===================== */

  const VIRIDIS = [
    [68, 1, 84], [71, 44, 122], [59, 81, 139], [44, 113, 142],
    [33, 144, 141], [39, 173, 129], [92, 200, 99], [170, 220, 50], [253, 231, 37]
  ];

  function viridis(v) {
    v = Math.max(0, Math.min(1, v));
    const idx = v * (VIRIDIS.length - 1);
    const i = Math.floor(idx);
    const f = idx - i;
    if (i >= VIRIDIS.length - 1) return VIRIDIS[VIRIDIS.length - 1];
    const c1 = VIRIDIS[i], c2 = VIRIDIS[i + 1];
    return [
      Math.round(c1[0] + f * (c2[0] - c1[0])),
      Math.round(c1[1] + f * (c2[1] - c1[1])),
      Math.round(c1[2] + f * (c2[2] - c1[2]))
    ];
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function fieldRange(f) {
    let min = Infinity, max = -Infinity;
    for (const v of f) { if (v < min) min = v; if (v > max) max = v; }
    return [min, max];
  }

  function drawHeatmap(ctx, x0, y0, w, h, f, N, opts = {}) {
    const cellW = w / N;
    const cellH = h / N;
    const range = opts.range || fieldRange(f);
    const span = (range[1] - range[0]) || 1;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const v = (f[i * N + j] - range[0]) / span;
        const [r, g, b] = viridis(v);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillRect(x0 + j * cellW, y0 + i * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
    ctx.strokeStyle = opts.borderColor || '#374151';
    ctx.lineWidth = opts.borderWidth || 1.2;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  }

  function drawHeatmapMasked(ctx, x0, y0, w, h, f, N, opts = {}) {
    drawHeatmap(ctx, x0, y0, w, h, f, N, opts);
    const cellW = w / N, cellH = h / N;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === 0 || i === N - 1 || j === 0 || j === N - 1) {
          ctx.fillRect(x0 + j * cellW, y0 + i * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  }

  function drawLatentBars(ctx, x0, y0, w, h, zVals, opts = {}) {
    const k = zVals.length;
    const barW = w / k;
    const cy = y0 + h / 2;
    const maxAmp = (h / 2 - 4) * (opts.scale || 1);
    const range = opts.range || 1;

    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x0 + w, cy);
    ctx.strokeStyle = '#e5e7eb';
    ctx.stroke();

    for (let i = 0; i < k; i++) {
      const v = zVals[i] / range;
      const barH = v * maxAmp;
      ctx.fillStyle = v >= 0 ? '#3b82f6' : '#ef4444';
      const top = v >= 0 ? cy - barH : cy;
      ctx.fillRect(x0 + i * barW + 1.5, top, barW - 3, Math.abs(barH));
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, label, color = '#374151') {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const ah = 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ah * Math.cos(angle - Math.PI / 6), y2 - ah * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - ah * Math.cos(angle + Math.PI / 6), y2 - ah * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = '600 15px "Helvetica Neue", Arial';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 8);
    }
  }

  function drawText(ctx, x, y, text, opts = {}) {
    ctx.font = opts.font || '13px "Helvetica Neue", Arial';
    ctx.fillStyle = opts.color || '#374151';
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.fillText(text, x, y);
  }

  /* ===================== 1. Manifold animation ===================== */

  const Manifold = (() => {
    const N = 32;
    const K = 8;
    let canvas, ctx, field, z;
    let stage = 0;
    let animT = 1;
    let rafId = null;

    function generateField() {
      const f = new Float32Array(N * N);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i === 0 || i === N - 1 || j === 0 || j === N - 1) continue;
          const x = i / (N - 1), y = j / (N - 1);
          f[i * N + j] = Math.sin(2 * Math.PI * x) * Math.sin(Math.PI * y)
                       + 0.5 * Math.sin(Math.PI * x) * Math.sin(2 * Math.PI * y);
        }
      }
      return f;
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;
      const boxSize = 150;
      const yMid = (H - boxSize) / 2;
      const xU = 30;
      const xZ = xU + boxSize + 90;
      const zW = 110, zH = 90;
      const xUhat = xZ + zW + 90;

      drawHeatmap(ctx, xU, yMid, boxSize, boxSize, field, N);
      drawText(ctx, xU + boxSize / 2, yMid - 12, 'u  (FEM state)');
      drawText(ctx, xU + boxSize / 2, yMid + boxSize + 22,
               `N = ${N}×${N} = ${N * N} DoFs`,
               { font: 'italic 12px "Helvetica Neue"', color: '#6b7280' });

      if (stage >= 1) {
        const t = stage === 1 ? animT : 1;
        const ax2 = xU + boxSize + 5 + t * (xZ - 5 - (xU + boxSize + 5));
        drawArrow(ctx, xU + boxSize + 5, yMid + boxSize / 2, ax2, yMid + boxSize / 2,
                  t > 0.6 ? 'ℰ' : '', '#1e40af');
        if (t >= 0.6) {
          drawLatentBars(ctx, xZ, yMid + (boxSize - zH) / 2, zW, zH, z, { scale: (t - 0.6) / 0.4 });
          drawText(ctx, xZ + zW / 2, yMid + (boxSize - zH) / 2 - 10,
                   `z ∈ ℝ^${K}`, { font: 'italic 13px "Helvetica Neue"' });
          drawText(ctx, xZ + zW / 2, yMid + (boxSize - zH) / 2 + zH + 16,
                   `${K} latent coords`,
                   { font: 'italic 11px "Helvetica Neue"', color: '#6b7280' });
        }
      }

      if (stage >= 2) {
        const t = stage === 2 ? animT : 1;
        const ax2 = xZ + zW + 5 + t * (xUhat - 5 - (xZ + zW + 5));
        drawArrow(ctx, xZ + zW + 5, yMid + boxSize / 2, ax2, yMid + boxSize / 2,
                  t > 0.6 ? '\u{1d49f}' : '', '#7c3aed');
        if (t >= 0.6) {
          const a = (t - 0.6) / 0.4;
          if (stage >= 3) {
            drawHeatmapMasked(ctx, xUhat, yMid, boxSize, boxSize, field, N, { alpha: a });
            drawText(ctx, xUhat + boxSize / 2, yMid - 12,
                     'ũ(z) = m ⊙ \u{1d49f}(z) + u_g');
            drawText(ctx, xUhat + boxSize / 2, yMid + boxSize + 22,
                     'boundary forced exactly',
                     { font: 'italic 12px "Helvetica Neue"', color: '#dc2626' });
          } else {
            drawHeatmap(ctx, xUhat, yMid, boxSize, boxSize, field, N, { alpha: a });
            drawText(ctx, xUhat + boxSize / 2, yMid - 12, 'û = \u{1d49f}(z)');
          }
        }
      }
    }

    function animateStep(target, dur = 700) {
      stage = target;
      animT = 0;
      const start = performance.now();
      cancelAnimationFrame(rafId);
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        animT = easeInOut(t);
        render();
        if (t < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    return {
      init() {
        canvas = document.getElementById('manifold-viz');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        field = generateField();
        z = [0.72, -0.45, 0.58, 0.31, -0.62, 0.23, -0.34, 0.49];
        stage = 0; animT = 1;
        render();
      },
      step(name) {
        if (name === 'encode') animateStep(1);
        else if (name === 'decode') animateStep(2);
        else if (name === 'mask') animateStep(3);
      }
    };
  })();

  /* ===================== 2. Poisson Galerkin animation ===================== */

  const Poisson = (() => {
    const N = 32;
    const K = 8;
    const MODES = [[1,1],[2,1],[1,2],[2,2],[3,1],[1,3],[3,2],[2,3]];
    const Z_STAR = [1.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const RATIO = 0.5;          // GN convergence ratio (visual)
    const MAX_ITER = 7;
    const STEP_DUR = 700;       // ms per iteration

    let canvas, ctx;
    let basis = null, target = null, targetRange = null;
    let zCur, iter, residuals, r0;
    let rafId = null;
    let running = false;

    function buildBasis() {
      return MODES.map(([mx, my]) => {
        const f = new Float32Array(N * N);
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            if (i === 0 || i === N - 1 || j === 0 || j === N - 1) continue;
            const x = i / (N - 1), y = j / (N - 1);
            f[i * N + j] = Math.sin(mx * Math.PI * x) * Math.sin(my * Math.PI * y);
          }
        }
        return f;
      });
    }

    function decode(z) {
      const f = new Float32Array(N * N);
      for (let k = 0; k < K; k++) {
        const c = z[k];
        if (c === 0) continue;
        for (let i = 0; i < N * N; i++) f[i] += c * basis[k][i];
      }
      return f;
    }

    function fnorm(v) {
      let s = 0;
      for (const x of v) s += x * x;
      return Math.sqrt(s);
    }

    function diff(a, b) {
      const r = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) r[i] = a[i] - b[i];
      return r;
    }

    function resetState() {
      zCur = new Array(K).fill(0);
      iter = 0;
      residuals = [r0];
    }

    function start() {
      cancelAnimationFrame(rafId);
      running = true;
      resetState();
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min((now - t0) / STEP_DUR, MAX_ITER);
        const k = Math.floor(t);
        const factor = 1 - Math.pow(RATIO, t);
        zCur = Z_STAR.map(v => v * factor);
        while (residuals.length - 1 < k) {
          residuals.push(r0 * Math.pow(RATIO, residuals.length));
        }
        iter = k;
        render();
        if (t < MAX_ITER) {
          rafId = requestAnimationFrame(tick);
        } else {
          running = false;
          zCur = [...Z_STAR];
          iter = MAX_ITER;
          while (residuals.length - 1 < MAX_ITER) {
            residuals.push(r0 * Math.pow(RATIO, residuals.length));
          }
          render();
        }
      };
      rafId = requestAnimationFrame(tick);
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;

      // ---- Header ----
      drawText(ctx, W / 2, 22,
               `Iteration  k = ${iter} / ${MAX_ITER}`,
               { font: '600 16px "Helvetica Neue"', color: '#111827' });

      const curR = residuals[Math.min(iter, residuals.length - 1)];
      const relR = curR / r0;
      drawText(ctx, W / 2, 42,
               `‖r_red‖ / ‖r₀‖ = ${relR.toExponential(2)}`,
               { font: '13px "Helvetica Neue"', color: relR < 0.05 ? '#059669' : '#6b7280' });

      // ---- Top row: z bars | decoded | target ----
      const boxY = 60;
      const boxH = 150;
      const xZ = 30, zW = 130, zH = 130;
      const xUhat = xZ + zW + 30;
      const xStar = xUhat + 150 + 30;

      drawLatentBars(ctx, xZ, boxY, zW, zH, zCur, { range: 1.1 });
      drawText(ctx, xZ + zW / 2, boxY - 8, 'z (latent, k=8)',
               { font: '12px "Helvetica Neue"', color: '#374151' });

      drawArrow(ctx, xZ + zW + 4, boxY + zH / 2, xUhat - 4, boxY + zH / 2,
                '\u{1d49f}', '#7c3aed');

      const decoded = decode(zCur);
      drawHeatmap(ctx, xUhat, boxY, 150, boxH, decoded, N, { range: targetRange });
      drawText(ctx, xUhat + 75, boxY - 8, 'ũ(z) — decoded',
               { font: '12px "Helvetica Neue"', color: '#374151' });

      drawArrow(ctx, xUhat + 150 + 4, boxY + boxH / 2, xStar - 4, boxY + boxH / 2,
                '≈', '#059669');

      drawHeatmap(ctx, xStar, boxY, 150, boxH, target, N, { range: targetRange });
      drawText(ctx, xStar + 75, boxY - 8, 'u* (target)',
               { font: '12px "Helvetica Neue"', color: '#374151' });

      // ---- Residual convergence plot ----
      const plotX = 50, plotY = 260, plotW = W - 80, plotH = 220;

      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(plotX, plotY, plotW, plotH);

      drawText(ctx, plotX + plotW / 2, plotY - 10,
               'Residual convergence  ‖r_red‖   (log scale)',
               { font: '600 13px "Helvetica Neue"', color: '#111827' });

      // Y axis: log10. Range: r0 down to r0 * RATIO^MAX_ITER * 0.5
      const ymin = Math.log10(r0 * Math.pow(RATIO, MAX_ITER) * 0.3);
      const ymax = Math.log10(r0 * 1.4);
      const yspan = ymax - ymin;

      // Gridlines (decades)
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 1;
      for (let d = Math.ceil(ymin); d <= Math.floor(ymax); d++) {
        const y = plotY + plotH - ((d - ymin) / yspan) * plotH;
        ctx.beginPath();
        ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
        drawText(ctx, plotX - 6, y + 4, `10^${d}`,
                 { font: '10px "Helvetica Neue"', color: '#9ca3af', align: 'right' });
      }

      // X axis ticks (iterations)
      for (let k = 0; k <= MAX_ITER; k++) {
        const x = plotX + (k / MAX_ITER) * plotW;
        ctx.strokeStyle = '#e5e7eb';
        ctx.beginPath();
        ctx.moveTo(x, plotY + plotH); ctx.lineTo(x, plotY + plotH + 4);
        ctx.stroke();
        drawText(ctx, x, plotY + plotH + 16, `${k}`,
                 { font: '10px "Helvetica Neue"', color: '#6b7280' });
      }
      drawText(ctx, plotX + plotW / 2, plotY + plotH + 32, 'Gauss-Newton iteration',
               { font: 'italic 11px "Helvetica Neue"', color: '#6b7280' });

      // Plot residual line
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let k = 0; k < residuals.length; k++) {
        const x = plotX + (k / MAX_ITER) * plotW;
        const y = plotY + plotH - ((Math.log10(residuals[k]) - ymin) / yspan) * plotH;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Points
      ctx.fillStyle = '#dc2626';
      for (let k = 0; k < residuals.length; k++) {
        const x = plotX + (k / MAX_ITER) * plotW;
        const y = plotY + plotH - ((Math.log10(residuals[k]) - ymin) / yspan) * plotH;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    return {
      init() {
        canvas = document.getElementById('poisson-viz');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        if (!basis) {
          basis = buildBasis();
          target = decode(Z_STAR);
          targetRange = fieldRange(target);
        }
        r0 = fnorm(diff(target, decode(new Array(K).fill(0))));
        resetState();
        // Wire up replay button (idempotent).
        const btn = document.querySelector('[data-replay="poisson"]');
        if (btn) btn.onclick = () => start();
        render();
      },
      step(name) {
        if (name === 'iterate') start();
      }
    };
  })();

  /* ===================== 2b. PoissonStep — one GN iteration walkthrough ===================== */

  const PoissonStep = (() => {
    const N = 32;
    const K = 8;
    const MODES = [[1,1],[2,1],[1,2],[2,2],[3,1],[1,3],[3,2],[2,3]];
    const Z_STAR = [1.0, 0.5, 0, 0, 0, 0, 0, 0];

    let canvas, ctx;
    let basis = null, target, F, R0, redR, deltaZ;
    let targetRange, R0Range, maxRedR;
    let stage = 0;
    let animT = 1;
    let rafId = null;
    let playing = false;

    function buildBasis() {
      return MODES.map(([m, n]) => {
        const f = new Float32Array(N * N);
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            if (i === 0 || i === N - 1 || j === 0 || j === N - 1) continue;
            const x = i / (N - 1), y = j / (N - 1);
            f[i * N + j] = Math.sin(m * Math.PI * x) * Math.sin(n * Math.PI * y);
          }
        }
        return f;
      });
    }

    function decode(z) {
      const f = new Float32Array(N * N);
      for (let k = 0; k < K; k++) {
        const c = z[k];
        if (c === 0) continue;
        for (let i = 0; i < N * N; i++) f[i] += c * basis[k][i];
      }
      return f;
    }

    function precompute() {
      basis = buildBasis();
      target = decode(Z_STAR);
      targetRange = fieldRange(target);

      // K eigenvalues for sine basis under -∇² with Dirichlet BCs
      const lambdas = MODES.map(([m, n]) => Math.PI * Math.PI * (m * m + n * n));

      // Forcing: F = K · u*  =  Σ z*_k λ_k basis[k]
      F = new Float32Array(N * N);
      for (let k = 0; k < K; k++) {
        const c = Z_STAR[k] * lambdas[k];
        if (c === 0) continue;
        for (let i = 0; i < N * N; i++) F[i] += c * basis[k][i];
      }

      // R⁰ = K · ũ(z=0) − F = −F
      R0 = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) R0[i] = -F[i];
      R0Range = fieldRange(R0);

      // r_red = J^T R⁰  =  ⟨basis[k], R⁰⟩  (one inner product per latent dim)
      redR = [];
      for (let k = 0; k < K; k++) {
        let s = 0;
        for (let i = 0; i < N * N; i++) s += basis[k][i] * R0[i];
        redR.push(s);
      }
      maxRedR = Math.max(...redR.map(Math.abs));

      // Δz = −H⁻¹ r_red.  For our orthogonal eigenbasis, H is diagonal and Δz = z*.
      deltaZ = [...Z_STAR];
    }

    function setStage(target, dur = 600) {
      cancelAnimationFrame(rafId);
      if (target < stage) { stage = target; animT = 1; render(); return; }
      stage = target;
      animT = 0;
      const t0 = performance.now();
      const tick = (now) => {
        animT = Math.min(1, (now - t0) / dur);
        animT = easeInOut(animT);
        render();
        if (animT < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    function playAll() {
      cancelAnimationFrame(rafId);
      playing = true;
      stage = 0; animT = 1; render();
      const order = [1, 2, 3, 4, 5, 6];
      let idx = 0;
      const advance = () => {
        if (!playing || idx >= order.length) { playing = false; return; }
        setStage(order[idx], 500);
        idx++;
        setTimeout(advance, 1100);
      };
      setTimeout(advance, 500);
    }

    /* ----- panel helpers (drawn in absolute coords) ----- */

    const PALETTE = {
      cold:    '#1e3a8a',
      decode:  '#7c3aed',
      resid:   '#dc2626',
      jac:     '#0891b2',
      project: '#dc2626',
      solve:   '#059669',
      update:  '#1e40af'
    };

    function panelLabel(x, y, txt, color) {
      drawText(ctx, x, y, txt,
               { font: 'italic 12px "Helvetica Neue"', color: color || '#1e3a8a' });
    }

    function panelSub(x, y, txt) {
      drawText(ctx, x, y, txt,
               { font: 'italic 10px "Helvetica Neue"', color: '#6b7280' });
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;

      // ========= top banner =========
      const labels = [
        'Initial guess:  cold-start  z⁽⁰⁾ = 0',
        'Decode:  ũ⁽⁰⁾ = m ⊙ 𝒟(z⁽⁰⁾) + u_g',
        'FOM residual:  R⁽⁰⁾ = K ũ⁽⁰⁾ − F   ∈ ℝᴺ',
        'Jacobian (autodiff):  Jᴅ = ∂𝒟/∂z |_{z⁽⁰⁾}   ∈ ℝᴺˣᵏ',
        'Galerkin project:  r_red⁽⁰⁾ = Jᴅᵀ R⁽⁰⁾   ∈ ℝᵏ',
        'Solve:  H Δz = − r_red⁽⁰⁾,    H = Jᴅᵀ K Jᴅ',
        'Update embedding:  z⁽¹⁾ = z⁽⁰⁾ + Δz'
      ];
      ctx.fillStyle = '#eff6ff';
      ctx.fillRect(0, 0, W, 36);
      ctx.strokeStyle = '#bfdbfe';
      ctx.beginPath(); ctx.moveTo(0, 36); ctx.lineTo(W, 36); ctx.stroke();
      drawText(ctx, W / 2, 23, labels[stage],
               { font: '600 13.5px "Helvetica Neue"', color: '#1e3a8a' });

      // ========= row 1: z⁽⁰⁾ → ũ⁽⁰⁾ → R⁽⁰⁾ =========
      const r1y = 55, boxW = 100, boxH = 100;
      const x1 = 35, x2 = 270, x3 = 510;

      panelLabel(x1 + boxW / 2, r1y - 8, 'z⁽⁰⁾ ∈ ℝᵏ', PALETTE.cold);
      drawLatentBars(ctx, x1, r1y, boxW, boxH, [0,0,0,0,0,0,0,0], { range: 1.1 });
      panelSub(x1 + boxW / 2, r1y + boxH + 14, 'cold start');

      if (stage >= 1) {
        const t = stage === 1 ? animT : 1;
        drawArrow(ctx, x1 + boxW + 5, r1y + boxH / 2, x2 - 5, r1y + boxH / 2,
                  t > 0.5 ? '𝒟' : '', PALETTE.decode);
        if (t > 0.5) {
          const a = (t - 0.5) / 0.5;
          panelLabel(x2 + boxW / 2, r1y - 8, 'ũ⁽⁰⁾ ∈ ℝᴺ', PALETTE.decode);
          drawHeatmap(ctx, x2, r1y, boxW, boxH, decode([0,0,0,0,0,0,0,0]), N,
                      { range: targetRange, alpha: a });
          panelSub(x2 + boxW / 2, r1y + boxH + 14, '≡ 0  (z = 0, no boundary lift)');
        }
      }

      if (stage >= 2) {
        const t = stage === 2 ? animT : 1;
        drawArrow(ctx, x2 + boxW + 5, r1y + boxH / 2, x3 - 5, r1y + boxH / 2,
                  t > 0.5 ? 'K · − F' : '', PALETTE.resid);
        if (t > 0.5) {
          const a = (t - 0.5) / 0.5;
          panelLabel(x3 + boxW / 2, r1y - 8, 'R⁽⁰⁾ ∈ ℝᴺ', PALETTE.resid);
          drawHeatmap(ctx, x3, r1y, boxW, boxH, R0, N, { range: R0Range, alpha: a });
          panelSub(x3 + boxW / 2, r1y + boxH + 14, '= − F  (full-mesh residual)');
        }
      }

      // ========= row 2: Jacobian J columns =========
      const r2y = 195;
      if (stage >= 3) {
        const t = stage === 3 ? animT : 1;
        panelLabel(W / 2, r2y - 8, 'Jᴅ ∈ ℝᴺˣᵏ — k columns (one per latent dim)',
                   PALETTE.jac);
        const miniW = 52, miniGap = 7;
        const totalW = K * miniW + (K - 1) * miniGap;
        const xJ = (W - totalW) / 2;
        for (let k = 0; k < K; k++) {
          const x = xJ + k * (miniW + miniGap);
          const kT = Math.max(0, Math.min(1, t * 1.6 - k * 0.06));
          if (kT > 0) {
            drawHeatmap(ctx, x, r2y, miniW, miniW, basis[k], N,
                        { borderColor: '#9ca3af', borderWidth: 0.8, alpha: kT });
            panelSub(x + miniW / 2, r2y + miniW + 14,
                     `(${MODES[k][0]},${MODES[k][1]})`);
          }
        }
      }

      // ========= row 3: r_red → Δz → z⁽¹⁾ =========
      const r3y = 320;

      if (stage >= 4) {
        const t = stage === 4 ? animT : 1;
        ctx.globalAlpha = t;
        panelLabel(x1 + boxW / 2, r3y - 8, 'r_red⁽⁰⁾ ∈ ℝᵏ', PALETTE.project);
        drawLatentBars(ctx, x1, r3y, boxW, boxH, redR, { range: maxRedR * 1.1 });
        panelSub(x1 + boxW / 2, r3y + boxH + 14, 'projected residual');
        ctx.globalAlpha = 1;
      }

      if (stage >= 5) {
        const t = stage === 5 ? animT : 1;
        drawArrow(ctx, x1 + boxW + 5, r3y + boxH / 2, x2 - 5, r3y + boxH / 2,
                  t > 0.5 ? '−H⁻¹' : '', PALETTE.solve);
        if (t > 0.5) {
          const a = (t - 0.5) / 0.5;
          ctx.globalAlpha = a;
          panelLabel(x2 + boxW / 2, r3y - 8, 'Δz ∈ ℝᵏ', PALETTE.solve);
          drawLatentBars(ctx, x2, r3y, boxW, boxH, deltaZ, { range: 1.1 });
          panelSub(x2 + boxW / 2, r3y + boxH + 14, 'GN step');
          ctx.globalAlpha = 1;
        }
      }

      if (stage >= 6) {
        const t = stage === 6 ? animT : 1;
        drawArrow(ctx, x2 + boxW + 5, r3y + boxH / 2, x3 - 5, r3y + boxH / 2,
                  t > 0.5 ? '+ z⁽⁰⁾' : '', PALETTE.update);
        if (t > 0.5) {
          const a = (t - 0.5) / 0.5;
          const z1 = Z_STAR.map(v => v * a);
          panelLabel(x3 + boxW / 2, r3y - 8, 'z⁽¹⁾ ∈ ℝᵏ — updated',
                     PALETTE.update);
          drawLatentBars(ctx, x3, r3y, boxW, boxH, z1, { range: 1.1 });
          panelSub(x3 + boxW / 2, r3y + boxH + 14, 'new embedding');
        }
      }

      // ========= footer note =========
      if (stage >= 6 && animT > 0.95) {
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(20, 490, W - 40, 32);
        drawText(ctx, W / 2, 502,
                 'Linear sine basis ⇒ H is diagonal ⇒ Δz exactly recovers z*  (1 iter)',
                 { font: '600 11px "Helvetica Neue"', color: '#92400e' });
        drawText(ctx, W / 2, 516,
                 'Non-linear decoders need 5–8 iterations — repeat with z⁽¹⁾ as the new guess.',
                 { font: 'italic 11px "Helvetica Neue"', color: '#92400e' });
      }
    }

    return {
      init() {
        canvas = document.getElementById('poisson-step-viz');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        if (!basis) precompute();
        stage = 0; animT = 1; playing = false;
        const btn = document.querySelector('[data-replay="poisson-step"]');
        if (btn) btn.onclick = () => playAll();
        render();
      },
      step(name) {
        const map = { cold: 0, decode: 1, residual: 2, jacobian: 3,
                      project: 4, solve: 5, update: 6 };
        if (name in map) setStage(map[name]);
      }
    };
  })();

  /* ===================== 3. Heat (parabolic) animation ===================== */

  const Heat = (() => {
    const N = 32;
    const K = 8;
    const MODES = [[1,1],[2,1],[1,2],[2,2],[3,1],[1,3],[3,2],[2,3]];
    const KAPPA = 0.5;          // diffusivity
    const T_MAX = 0.25;         // simulate to this time
    const N_STEPS = 50;         // 50 backward-Euler steps
    const DT = T_MAX / N_STEPS;
    const Z_INIT = [0.9, 0.55, 0.65, 0.45, 0.30, 0.30, 0.20, 0.18];
    const PLAY_DUR = 4500;      // ms total animation

    let canvas, ctx;
    let basis = null, initRange = null;
    let eigvals;                // analytical decay rate per mode
    let zCur, tCur, stepIdx;
    let rafId = null;

    function buildBasis() {
      return MODES.map(([mx, my]) => {
        const f = new Float32Array(N * N);
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            if (i === 0 || i === N - 1 || j === 0 || j === N - 1) continue;
            const x = i / (N - 1), y = j / (N - 1);
            f[i * N + j] = Math.sin(mx * Math.PI * x) * Math.sin(my * Math.PI * y);
          }
        }
        return f;
      });
    }

    function computeEigvals() {
      // For sin(mπx)sin(nπy), Laplacian eigenvalue is π²(m²+n²); decay = exp(-λκt).
      return MODES.map(([m, n]) => Math.PI * Math.PI * (m * m + n * n) * KAPPA);
    }

    function decode(z) {
      const f = new Float32Array(N * N);
      for (let k = 0; k < K; k++) {
        const c = z[k];
        if (c === 0) continue;
        for (let i = 0; i < N * N; i++) f[i] += c * basis[k][i];
      }
      return f;
    }

    function zAtTime(t) {
      // Heat equation analytical solution per mode: z_k(t) = z_k(0) * exp(-λ_k t)
      return Z_INIT.map((z0, k) => z0 * Math.exp(-eigvals[k] * t));
    }

    function reset() {
      zCur = [...Z_INIT];
      tCur = 0;
      stepIdx = 0;
    }

    function start() {
      cancelAnimationFrame(rafId);
      reset();
      const t0 = performance.now();
      const tick = (now) => {
        const elapsed = now - t0;
        const frac = Math.min(elapsed / PLAY_DUR, 1);
        tCur = frac * T_MAX;
        stepIdx = Math.round(frac * N_STEPS);
        zCur = zAtTime(tCur);
        render();
        if (frac < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;

      drawText(ctx, W / 2, 22,
               `step n = ${stepIdx} / ${N_STEPS}    ·    t = ${tCur.toFixed(3)}    ·    Δt = ${DT.toFixed(3)}`,
               { font: '600 14px "Helvetica Neue"', color: '#111827' });

      // ---- Top row: z bars | decoded heatmap ----
      const yTop = 50;
      const xZ = 30, zW = 200, zH = 130;
      const xU = xZ + zW + 90;
      const uW = 200, uH = 200;

      drawLatentBars(ctx, xZ, yTop + (uH - zH) / 2, zW, zH, zCur, { range: 1.0 });
      drawText(ctx, xZ + zW / 2, yTop + (uH - zH) / 2 - 8,
               'z(t) (latent)', { font: '12px "Helvetica Neue"', color: '#374151' });
      drawText(ctx, xZ + zW / 2, yTop + (uH + zH) / 2 + 18,
               'high-frequency modes decay first',
               { font: 'italic 11px "Helvetica Neue"', color: '#6b7280' });

      drawArrow(ctx, xZ + zW + 4, yTop + uH / 2, xU - 4, yTop + uH / 2,
                '\u{1d49f}', '#7c3aed');

      const field = decode(zCur);
      drawHeatmap(ctx, xU, yTop, uW, uH, field, N, { range: initRange });
      drawText(ctx, xU + uW / 2, yTop - 8, 'ũ(z(t)) — temperature field',
               { font: '12px "Helvetica Neue"', color: '#374151' });

      // ---- Bottom: per-mode decay curves over time ----
      const plotX = 50, plotY = 320, plotW = W - 80, plotH = 150;
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(plotX, plotY, plotW, plotH);
      drawText(ctx, plotX + plotW / 2, plotY - 10,
               'Per-mode decay  z_k(t) / z_k(0)',
               { font: '600 13px "Helvetica Neue"', color: '#111827' });

      // Y axis: 0 to 1
      ctx.strokeStyle = '#f3f4f6';
      for (let v = 0; v <= 1.0001; v += 0.25) {
        const y = plotY + plotH - v * plotH;
        ctx.beginPath();
        ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
        drawText(ctx, plotX - 6, y + 3, v.toFixed(2),
                 { font: '10px "Helvetica Neue"', color: '#9ca3af', align: 'right' });
      }
      // X axis ticks
      for (let s = 0; s <= 5; s++) {
        const tt = (s / 5) * T_MAX;
        const x = plotX + (s / 5) * plotW;
        drawText(ctx, x, plotY + plotH + 14, tt.toFixed(2),
                 { font: '10px "Helvetica Neue"', color: '#6b7280' });
      }
      drawText(ctx, plotX + plotW / 2, plotY + plotH + 28, 't  (time)',
               { font: 'italic 11px "Helvetica Neue"', color: '#6b7280' });

      // Plot decay curves per mode
      const palette = ['#1e40af', '#7c3aed', '#059669', '#d97706',
                       '#dc2626', '#0891b2', '#a16207', '#be185d'];
      for (let k = 0; k < K; k++) {
        ctx.strokeStyle = palette[k];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const NSAMPLE = 80;
        for (let s = 0; s <= NSAMPLE; s++) {
          const tt = (s / NSAMPLE) * T_MAX;
          const v = Math.exp(-eigvals[k] * tt);
          const x = plotX + (tt / T_MAX) * plotW;
          const y = plotY + plotH - v * plotH;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Marker line at current t
      const xT = plotX + (tCur / T_MAX) * plotW;
      ctx.strokeStyle = '#111827';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xT, plotY); ctx.lineTo(xT, plotY + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Mode legend (compact, top-right of plot)
      const lgX = plotX + plotW - 110, lgY = plotY + 8;
      drawText(ctx, lgX, lgY, 'modes (m,n):',
               { font: '600 10px "Helvetica Neue"', color: '#374151', align: 'left' });
      for (let k = 0; k < K; k++) {
        const ly = lgY + 12 + k * 11;
        ctx.fillStyle = palette[k];
        ctx.fillRect(lgX, ly - 6, 10, 3);
        drawText(ctx, lgX + 14, ly,
                 `(${MODES[k][0]},${MODES[k][1]})`,
                 { font: '10px "Helvetica Neue"', color: '#374151', align: 'left' });
      }
    }

    return {
      init() {
        canvas = document.getElementById('heat-viz');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        if (!basis) {
          basis = buildBasis();
          eigvals = computeEigvals();
          initRange = fieldRange(decode(Z_INIT));
        }
        reset();
        const btn = document.querySelector('[data-replay="heat"]');
        if (btn) btn.onclick = () => start();
        render();
      },
      step(name) {
        if (name === 'step') start();
      }
    };
  })();

  /* ===================== 4. EQ — node selection animation ===================== */

  const EQ = (() => {
    const GRID = 18;
    const N_TOTAL = GRID * GRID;

    // Hand-picked NNLS-selected indices — chosen to look like a believable
    // EQ output (slight clustering + corner coverage).
    const SELECTED = [
      [1,1], [3,2], [5,3], [8,1], [11,2], [14,1], [16,3],
      [2,5], [6,5], [9,4], [12,6], [15,5],
      [4,8], [7,7], [10,8], [13,8], [16,9],
      [1,10], [5,11], [8,11], [11,12], [14,11],
      [2,14], [6,15], [9,14], [12,15], [15,14],
      [3,16], [10,16], [16,16]
    ];
    const SEL_SET = new Set(SELECTED.map(([c, r]) => `${c},${r}`));

    let canvas, ctx;
    let animT = 1;       // 0 = all-blue start; 1 = selected highlighted
    let rafId = null;

    function lerp(a, b, t) { return a + (b - a) * t; }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;
      const usable = Math.min(W, H) - 80;
      const cellSize = usable / GRID;
      const xOff = (W - cellSize * GRID) / 2;
      const yOff = (H - cellSize * GRID) / 2 - 8;

      // Faint grid lines
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 0.6;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(xOff + i * cellSize, yOff);
        ctx.lineTo(xOff + i * cellSize, yOff + GRID * cellSize);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(xOff, yOff + i * cellSize);
        ctx.lineTo(xOff + GRID * cellSize, yOff + i * cellSize);
        ctx.stroke();
      }

      // Outer mesh border
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(xOff, yOff, GRID * cellSize, GRID * cellSize);

      // Nodes
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const x = xOff + (c + 0.5) * cellSize;
          const y = yOff + (r + 0.5) * cellSize;
          const isSel = SEL_SET.has(`${c},${r}`);

          if (isSel) {
            // Blue → orange, growing radius
            const rr = lerp(96, 234, animT);
            const gg = lerp(165, 88, animT);
            const bb = lerp(250, 12, animT);
            ctx.fillStyle = `rgb(${rr|0},${gg|0},${bb|0})`;
            ctx.beginPath();
            ctx.arc(x, y, 3.0 + animT * 2.5, 0, 2 * Math.PI);
            ctx.fill();
            // Subtle ring at peak
            if (animT > 0.5) {
              ctx.strokeStyle = `rgba(234, 88, 12, ${(animT - 0.5) * 0.6})`;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(x, y, 7 + animT * 2, 0, 2 * Math.PI);
              ctx.stroke();
            }
          } else {
            // Blue → faded gray
            const rr = lerp(96, 209, animT);
            const gg = lerp(165, 213, animT);
            const bb = lerp(250, 219, animT);
            const alpha = lerp(1.0, 0.35, animT);
            ctx.fillStyle = `rgba(${rr|0},${gg|0},${bb|0},${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, lerp(3.0, 2.0, animT), 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // Counter at the bottom
      const shown = animT > 0.5 ? SELECTED.length : N_TOTAL;
      const pct = (SELECTED.length / N_TOTAL * 100);
      ctx.fillStyle = '#1e3a8a';
      ctx.font = '600 14px "Helvetica Neue", Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`|S| = ${shown}  of  N = ${N_TOTAL}  mesh nodes`,
                   W / 2, yOff + GRID * cellSize + 30);
      if (animT > 0.7) {
        ctx.fillStyle = '#ea580c';
        ctx.font = '600 12px "Helvetica Neue", Arial';
        ctx.fillText(`(${pct.toFixed(1)}% of mesh — cost no longer scales with N)`,
                     W / 2, yOff + GRID * cellSize + 48);
      }
    }

    function play() {
      cancelAnimationFrame(rafId);
      animT = 0;
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 1800);
        animT = easeInOut(t);
        render();
        if (t < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    return {
      init() {
        canvas = document.getElementById('eq-viz');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        animT = 0;
        const btn = document.querySelector('[data-replay="eq"]');
        if (btn) btn.onclick = () => play();
        render();
        // Auto-play once after slide settles
        setTimeout(() => play(), 700);
      }
    };
  })();

  /* ===================== public dispatch ===================== */

  return {
    initSlide(name) {
      if (name === 'manifold') Manifold.init();
      else if (name === 'poisson') Poisson.init();
      else if (name === 'poisson-step') PoissonStep.init();
      else if (name === 'heat')    Heat.init();
      else if (name === 'eq')      EQ.init();
    },
    fragmentStep(slideName, step) {
      if (slideName === 'manifold') Manifold.step(step);
      else if (slideName === 'poisson') Poisson.step(step);
      else if (slideName === 'poisson-step') PoissonStep.step(step);
      else if (slideName === 'heat')    Heat.step(step);
    }
  };
})();
