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

  function ring(cx, cy, r, width, alpha, dash, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot || 0);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = "rgba(235, 240, 246, " + alpha + ")";
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  let t0 = performance.now();
  let lastSpeak = 0;
  function frame(now) {
    const t = (now - t0) / 1000;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.36;

    smooth += (level - smooth) * 0.3;
    level *= 0.9;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.2);
    let target;
    if (state === "listening") target = 0.35 + Math.min(1, smooth * 1.6) * 0.65;
    else if (state === "speaking") target = 0.45 + 0.35 * Math.abs(Math.sin(t * 7.3)) * Math.abs(Math.sin(t * 1.9));
    else if (state === "thinking") target = 0.5 + 0.1 * breathe;
    else if (state === "idle") target = 0.14 + 0.08 * breathe;
    else target = 0.04;
    energy += (target - energy) * 0.1;
    wakeFlash *= 0.94;
    history.push(state === "speaking" ? energy * (0.5 + 0.5 * Math.random()) : state === "listening" ? smooth : energy * 0.25);
    history.shift();
    if (state === "speaking" && now - lastSpeak > 420) { ripples.push(0); lastSpeak = now; }

    ctx.clearRect(0, 0, w, h);

    // alone
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    halo.addColorStop(0, "rgba(207, 233, 255, " + (0.10 + energy * 0.22 + wakeFlash * 0.3) + ")");
    halo.addColorStop(1, "rgba(207, 233, 255, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // anelli sottili in argento
    const speed = state === "thinking" ? 1.6 : 0.25;
    ring(cx, cy, R, 1, 0.16);
    ring(cx, cy, R * 0.88, 1, 0.10, [2, 10], t * 0.08 * speed);
    ring(cx, cy, R * 0.70, 1, 0.08);
    // arco luminoso che gira (più veloce quando elabora)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.6 * speed);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * (state === "thinking" ? 0.5 : 0.22));
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(235, 240, 246, " + (0.35 + energy * 0.4) + ")";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(207, 233, 255, 0.8)";
    ctx.stroke();
    ctx.restore();

    // onde quando parla / al risveglio
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i] += 0.012;
      const p = ripples[i];
      if (p >= 1) { ripples.splice(i, 1); continue; }
      ring(cx, cy, R * (0.32 + p * 0.55), 1.2, (1 - p) * 0.35);
    }

    // sfera
    const core = R * (0.26 + energy * 0.12 + wakeFlash * 0.06);
    const g = ctx.createRadialGradient(cx - core * 0.25, cy - core * 0.3, core * 0.05, cx, cy, core);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(0.45, "rgba(225, 240, 255, " + (0.75 + energy * 0.25) + ")");
    g.addColorStop(0.85, "rgba(170, 205, 235, " + (0.35 + energy * 0.3) + ")");
    g.addColorStop(1, "rgba(150, 190, 225, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fill();
    // bordo sottile della sfera
    ring(cx, cy, core * 0.78, 1, 0.5 + energy * 0.4);

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
