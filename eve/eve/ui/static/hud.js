/* HUD: sfera di luce che respira e reagisce alla voce, trascrizione, attività. */
(function () {
  "use strict";

  const body = document.body;
  const $ = (id) => document.getElementById(id);
  const canvas = $("orb");
  const ctx = canvas.getContext("2d");
  const LABEL = { idle: "In ascolto", listening: "Ti ascolto", thinking: "Un momento", speaking: "Rispondo", offline: "Offline" };
  const CAPTION = { idle: "pronta", listening: "ascolto", thinking: "elaboro", speaking: "parlo", offline: "collegamento assente" };

  let state = "offline";
  let level = 0, smooth = 0, energy = 0, wakeFlash = 0;
  let socket = null;
  const ripples = [];       // onde che si allargano quando parla
  const history = new Array(48).fill(0);

  /* Barre della forma d'onda sotto la sfera */
  const wave = $("wave");
  for (let i = 0; i < 48; i++) wave.appendChild(document.createElement("i"));
  const bars = Array.from(wave.children);

  function setState(next, detail) {
    state = next;
    body.dataset.state = next;
    $("state-label").textContent = LABEL[next] || next;
    $("caption").textContent = detail || CAPTION[next] || "";
  }

  /* Orologio */
  function tickClock() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    $("date").textContent = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  }
  setInterval(tickClock, 1000);
  tickClock();

  /* Trascrizione */
  const transcript = $("transcript");
  let typing = null;
  function addLine(role, text) {
    const line = document.createElement("div");
    line.className = "line " + role;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = role === "user" ? "Tu" : $("brand").textContent;
    const span = document.createElement("span");
    span.className = "text";
    line.appendChild(who);
    line.appendChild(span);
    transcript.appendChild(line);
    while (transcript.children.length > 4) transcript.removeChild(transcript.firstChild);
    if (role === "assistant") {
      if (typing) clearInterval(typing);
      line.classList.add("typing");
      let i = 0;
      typing = setInterval(() => {
        i += 2;
        span.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(typing); typing = null; line.classList.remove("typing"); }
      }, 16);
    } else {
      span.textContent = text;
    }
  }

  /* Attività e notifiche */
  const tools = $("tools");
  function addTool(name, status, detail) {
    let li = tools.querySelector(`li[data-name="${name}"][data-status="running"]`);
    if (!li) {
      li = document.createElement("li");
      li.dataset.name = name;
      li.innerHTML = '<span class="name"></span><span class="st"></span><span class="d"></span>';
      tools.insertBefore(li, tools.firstChild);
      while (tools.children.length > 6) tools.removeChild(tools.lastChild);
    }
    li.dataset.status = status;
    li.querySelector(".name").textContent = name.replace(/_/g, " ");
    li.querySelector(".st").textContent = { running: "in corso", done: "fatto", error: "errore", pending: "da confermare" }[status] || status;
    li.querySelector(".d").textContent = detail || "";
    $("last-tool").textContent = name.replace(/_/g, " ");
  }
  function addNotice(text, kind) {
    const li = document.createElement("li");
    li.className = kind || "info";
    li.textContent = text;
    const list = $("notices");
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 3) list.removeChild(list.lastChild);
  }

  /* Collegamento */
  function connect() {
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
    socket = new WebSocket(url);
    socket.onopen = () => { $("link").textContent = "attivo"; $("link").className = "val"; };
    socket.onclose = () => {
      $("link").textContent = "perso"; $("link").className = "val bad";
      setState("offline", "riconnessione…");
      setTimeout(connect, 1500);
    };
    socket.onmessage = (msg) => {
      const ev = JSON.parse(msg.data);
      if (ev.type === "hello") {
        $("brand").textContent = ev.name;
        $("hint-name").textContent = ev.name;
        if (ev.tagline) $("tagline").textContent = ev.tagline;
        document.title = ev.name;
        setState(ev.state, "");
        (ev.history || []).forEach(handle);
      } else {
        handle(ev);
      }
    };
  }
  function handle(ev) {
    switch (ev.type) {
      case "state": setState(ev.state, ev.detail); break;
      case "level": level = ev.value; break;
      case "transcript": addLine(ev.role, ev.text); break;
      case "tool": addTool(ev.name, ev.status, ev.detail); break;
      case "notice": addNotice(ev.text, ev.kind); break;
      case "wake": wakeFlash = 1; ripples.push(0); break;
    }
  }
  function send(obj) { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj)); }

  /* Comandi */
  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("input");
    const text = input.value.trim();
    if (!text) return;
    send({ type: "text", text });
    input.value = "";
    $("mode").textContent = "testo";
  });
  $("trigger").addEventListener("click", () => send({ type: "trigger" }));
  $("stop").addEventListener("click", () => send({ type: "stop" }));
  document.addEventListener("keydown", (e) => {
    if (e.target === $("input")) { if (e.code === "Escape") { $("input").blur(); send({ type: "stop" }); } return; }
    if (e.code === "Space") { e.preventDefault(); send({ type: "trigger" }); }
    if (e.code === "Escape") send({ type: "stop" });
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) $("input").focus();
  });

  /* Sfera */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  const ICE = "207, 233, 255";
  const SILVER = "235, 240, 246";

  function ring(cx, cy, r, width, alpha, dash, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot || 0);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = "rgba(" + SILVER + ", " + alpha + ")";
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  /* Orbite inclinate: cerchi in 3D proiettati sullo schermo */
  const ORBITS = [
    { r: 0.64, tilt: 0.95, roll: -0.42, spin: 0.35, phase: 0.0, n: 5 },
    { r: 0.52, tilt: 1.25, roll: 0.75, spin: -0.5, phase: 1.3, n: 4 },
  ];
  function orbitPoint(o, R, theta, rot) {
    // cerchio nel piano XZ che gira attorno all'asse verticale (rot), visto da un punto
    // di vista inclinato (tilt) e con il piano ruotato sullo schermo (roll)
    const x0 = Math.cos(theta), z0 = Math.sin(theta);
    const x = x0 * Math.cos(rot) - z0 * Math.sin(rot);
    const z = x0 * Math.sin(rot) + z0 * Math.cos(rot);
    const px = x * R * o.r, py = z * R * o.r * Math.sin(o.tilt) * 0.5;
    return { x: px * Math.cos(o.roll) - py * Math.sin(o.roll), y: px * Math.sin(o.roll) + py * Math.cos(o.roll), zr: z };
  }
  function drawOrbitRing(cx, cy, o, R, rot, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const p = orbitPoint(o, R, (i / 90) * Math.PI * 2, rot);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + SILVER + ", " + alpha + ")";
    ctx.stroke();
    ctx.restore();
  }
  function drawParticles(cx, cy, o, R, rot, t, speed, energy, front) {
    ctx.save();
    ctx.translate(cx, cy);
    for (let k = 0; k < o.n; k++) {
      const theta = t * o.spin * speed + o.phase + (k / o.n) * Math.PI * 2;
      const p = orbitPoint(o, R, theta, rot);
      const isFront = p.zr > 0;
      if (isFront !== front) continue;
      const scale = 0.6 + 0.4 * (p.zr + 1) / 2;
      const size = (1.2 + 1.6 * scale) * (1 + energy * 0.6);
      const a = (0.25 + 0.6 * scale) * (0.5 + energy * 0.6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4);
      g.addColorStop(0, "rgba(255, 255, 255, " + a + ")");
      g.addColorStop(0.3, "rgba(" + ICE + ", " + a * 0.5 + ")");
      g.addColorStop(1, "rgba(" + ICE + ", 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, " + Math.min(1, a + 0.2) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* Luce che scorre dentro la sfera: macchie morbide su traiettorie lente */
  const BLOBS = [
    { ax: 0.55, ay: 0.35, fx: 0.31, fy: 0.47, ph: 0.0, r: 0.75 },
    { ax: 0.45, ay: 0.55, fx: 0.23, fy: 0.37, ph: 2.1, r: 0.65 },
    { ax: 0.35, ay: 0.45, fx: 0.41, fy: 0.29, ph: 4.0, r: 0.55 },
    { ax: 0.60, ay: 0.25, fx: 0.17, fy: 0.53, ph: 1.0, r: 0.5 },
  ];
  function drawSphere(cx, cy, core, t, energy, flash, speed) {
    // corpo di vetro
    const body = ctx.createRadialGradient(cx - core * 0.3, cy - core * 0.35, core * 0.1, cx, cy, core);
    body.addColorStop(0, "rgba(255, 255, 255, " + (0.32 + energy * 0.22) + ")");
    body.addColorStop(0.5, "rgba(" + ICE + ", " + (0.18 + energy * 0.18) + ")");
    body.addColorStop(0.92, "rgba(70, 100, 140, 0.45)");
    body.addColorStop(1, "rgba(40, 60, 90, 0.2)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fill();

    // luce interna (additiva, ritagliata nella sfera)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const tt = t * speed;
    for (const b of BLOBS) {
      const x = cx + Math.sin(tt * b.fx + b.ph) * core * b.ax;
      const y = cy + Math.cos(tt * b.fy + b.ph * 0.7) * core * b.ay;
      const rr = core * b.r * (0.8 + energy * 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, "rgba(255, 255, 255, " + (0.12 + energy * 0.26 + flash * 0.3) + ")");
      g.addColorStop(0.45, "rgba(" + ICE + ", " + (0.07 + energy * 0.12) + ")");
      g.addColorStop(1, "rgba(" + ICE + ", 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    // nucleo
    const nucleus = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 0.55);
    nucleus.addColorStop(0, "rgba(255, 255, 255, " + (0.22 + energy * 0.45 + flash * 0.4) + ")");
    nucleus.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = nucleus;
    ctx.beginPath();
    ctx.arc(cx, cy, core * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // bordo illuminato: più forte in alto a sinistra
    const rim = ctx.createLinearGradient(cx - core, cy - core, cx + core, cy + core);
    rim.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    rim.addColorStop(0.5, "rgba(" + SILVER + ", 0.25)");
    rim.addColorStop(1, "rgba(255, 255, 255, 0.55)");
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rim;
    ctx.stroke();

    // riflesso speculare
    ctx.save();
    ctx.translate(cx - core * 0.32, cy - core * 0.48);
    ctx.rotate(-0.6);
    const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 0.42);
    spec.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    spec.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.ellipse(0, 0, core * 0.42, core * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // riflesso a terra
    const floor = ctx.createRadialGradient(cx, cy + core * 1.55, 0, cx, cy + core * 1.55, core * 1.1);
    floor.addColorStop(0, "rgba(" + ICE + ", " + (0.05 + energy * 0.08) + ")");
    floor.addColorStop(1, "rgba(" + ICE + ", 0)");
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + core * 1.55, core * 1.4, core * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  let t0 = performance.now();
  let lastSpeak = 0;
  function frame(now) {
    const t = (now - t0) / 1000;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.38;

    smooth += (level - smooth) * 0.3;
    level *= 0.9;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1);
    let target;
    if (state === "listening") target = 0.35 + Math.min(1, smooth * 1.6) * 0.65;
    else if (state === "speaking") target = 0.45 + 0.35 * Math.abs(Math.sin(t * 7.3)) * Math.abs(Math.sin(t * 1.9));
    else if (state === "thinking") target = 0.55 + 0.1 * breathe;
    else if (state === "idle") target = 0.16 + 0.1 * breathe;
    else target = 0.04;
    energy += (target - energy) * 0.1;
    wakeFlash *= 0.94;
    history.push(state === "speaking" ? energy * (0.5 + 0.5 * Math.random()) : state === "listening" ? smooth : energy * 0.25);
    history.shift();
    if (state === "speaking" && now - lastSpeak > 420) { ripples.push(0); lastSpeak = now; }

    const speed = state === "thinking" ? 3.2 : state === "listening" ? 1.3 + smooth * 2 : state === "speaking" ? 1.6 : 1;
    const rot = t * 0.18 * (state === "thinking" ? 2.5 : 1);

    ctx.clearRect(0, 0, w, h);

    // alone
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    halo.addColorStop(0, "rgba(" + ICE + ", " + (0.10 + energy * 0.22 + wakeFlash * 0.3) + ")");
    halo.addColorStop(1, "rgba(" + ICE + ", 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // anelli piatti in argento
    ring(cx, cy, R, 1, 0.14);
    ring(cx, cy, R * 0.9, 1, 0.09, [2, 10], t * 0.05);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.5 * (state === "thinking" ? 3 : 1));
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * (state === "thinking" ? 0.5 : 0.2));
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(" + SILVER + ", " + (0.35 + energy * 0.4) + ")";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(" + ICE + ", 0.8)";
    ctx.stroke();
    ctx.restore();

    // onde
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i] += 0.012;
      const p = ripples[i];
      if (p >= 1) { ripples.splice(i, 1); continue; }
      ring(cx, cy, R * (0.34 + p * 0.5), 1.2, (1 - p) * 0.35);
    }

    // orbite e particelle dietro la sfera
    for (const o of ORBITS) drawOrbitRing(cx, cy, o, R, rot * (o.spin > 0 ? 1 : -1), 0.14 + energy * 0.1);
    for (const o of ORBITS) drawParticles(cx, cy, o, R, rot * (o.spin > 0 ? 1 : -1), t, speed, energy, false);

    // sfera
    const core = R * (0.30 + energy * 0.09 + wakeFlash * 0.05);
    drawSphere(cx, cy, core, t, energy, wakeFlash, speed);

    // particelle davanti alla sfera
    for (const o of ORBITS) drawParticles(cx, cy, o, R, rot * (o.spin > 0 ? 1 : -1), t, speed, energy, true);

    // forma d'onda
    const base = state === "idle" || state === "offline" ? 0.08 : 1;
    for (let i = 0; i < bars.length; i++) {
      const v = history[Math.floor(i * history.length / bars.length)];
      const env = Math.sin((i / (bars.length - 1)) * Math.PI);
      bars[i].style.height = Math.max(3, 3 + v * env * base * 32) + "px";
      bars[i].style.opacity = 0.25 + Math.min(1, v * 2) * 0.6;
    }
    $("meter").firstElementChild.style.width = Math.min(100, smooth * 160) + "%";

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  connect();
})();
