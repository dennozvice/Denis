/* HUD di Jarvis: anelli animati, forma d'onda, trascrizione e log degli strumenti. */
(function () {
  "use strict";

  const body = document.body;
  const $ = (id) => document.getElementById(id);
  const canvas = $("reactor");
  const ctx = canvas.getContext("2d");
  const STATE_LABEL = { idle: "IN ASCOLTO", listening: "TI ASCOLTO", thinking: "ELABORO", speaking: "PARLO", offline: "OFFLINE" };
  const STATE_CAPTION = { idle: "standby", listening: "ricezione vocale", thinking: "analisi", speaking: "risposta", offline: "collegamento assente" };

  let state = "offline";
  let level = 0;          // livello microfono grezzo
  let smooth = 0;         // livello interpolato
  let energy = 0;         // energia visiva dell'animazione (0..1)
  let wakeFlash = 0;
  let socket = null;
  const waveform = new Array(96).fill(0);

  /* Barre del microfono */
  const bars = $("bars");
  for (let i = 0; i < 12; i++) bars.appendChild(document.createElement("i"));

  function setState(next, detail) {
    state = next;
    body.dataset.state = next;
    $("state-label").textContent = STATE_LABEL[next] || next.toUpperCase();
    $("caption").textContent = STATE_CAPTION[next] || "";
    $("detail").textContent = detail || STATE_CAPTION[next] || "";
  }

  /* Orologio */
  function tickClock() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("date").textContent = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  setInterval(tickClock, 1000);
  tickClock();

  /* Trascrizione con effetto macchina da scrivere per Jarvis */
  const transcript = $("transcript");
  let typingTimer = null;
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
    while (transcript.children.length > 6) transcript.removeChild(transcript.firstChild);
    if (role === "assistant") {
      if (typingTimer) clearInterval(typingTimer);
      line.classList.add("typing");
      let i = 0;
      typingTimer = setInterval(() => {
        i += 2;
        span.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(typingTimer); typingTimer = null; line.classList.remove("typing"); }
      }, 18);
    } else {
      span.textContent = text;
    }
  }

  /* Strumenti e notifiche */
  const tools = $("tools");
  function addTool(name, status, detail) {
    let li = tools.querySelector(`li[data-name="${name}"][data-status="running"]`);
    if (!li) {
      li = document.createElement("li");
      li.dataset.name = name;
      li.innerHTML = '<span class="name"></span><span class="st"></span><span class="d"></span>';
      tools.insertBefore(li, tools.firstChild);
      while (tools.children.length > 8) tools.removeChild(tools.lastChild);
    }
    li.dataset.status = status;
    li.querySelector(".name").textContent = name;
    li.querySelector(".st").textContent = { running: "in corso", done: "ok", error: "errore", pending: "conferma" }[status] || status;
    li.querySelector(".d").textContent = detail || "";
    $("last-tool").textContent = name;
  }
  function addNotice(text, kind) {
    const li = document.createElement("li");
    li.className = kind || "info";
    li.textContent = text;
    const list = $("notices");
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 4) list.removeChild(list.lastChild);
  }

  /* WebSocket con riconnessione */
  function connect() {
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
    socket = new WebSocket(url);
    socket.onopen = () => { $("link").textContent = "attivo"; $("link").className = "val"; };
    socket.onclose = () => {
      $("link").textContent = "perso"; $("link").className = "val bad";
      setState("offline", "Riconnessione…");
      setTimeout(connect, 1500);
    };
    socket.onmessage = (msg) => {
      const ev = JSON.parse(msg.data);
      switch (ev.type) {
        case "hello":
          setState(ev.state, "");
          $("brand").textContent = ev.name;
          $("mode").textContent = "vocale";
          (ev.history || []).forEach(handle);
          break;
        default:
          handle(ev);
      }
    };
  }
  function handle(ev) {
    switch (ev.type) {
      case "state": setState(ev.state, ev.detail); if (ev.state !== "listening") $("mode").textContent = ev.state === "idle" ? "vocale" : $("mode").textContent; break;
      case "level": level = ev.value; break;
      case "transcript": addLine(ev.role, ev.text); break;
      case "tool": addTool(ev.name, ev.status, ev.detail); break;
      case "notice": addNotice(ev.text, ev.kind); break;
      case "wake": wakeFlash = 1; break;
    }
  }
  function send(obj) { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj)); }

  /* Controlli */
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
    if (e.target === $("input")) return;
    if (e.code === "Space") { e.preventDefault(); send({ type: "trigger" }); }
    if (e.code === "Escape") send({ type: "stop" });
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) $("input").focus();
  });

  /* Reattore */
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function accent() { return getComputedStyle(body).getPropertyValue("--accent").trim() || "#38d9ff"; }

  function ring(cx, cy, r, width, color, alpha, dash, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  function arcs(cx, cy, r, count, span, width, color, alpha, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + span);
      ctx.stroke();
    }
    ctx.restore();
  }

  function ticks(cx, cy, r, count, len, color, alpha, rotation, every) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const l = every && i % every === 0 ? len * 1.8 : len;
      ctx.lineWidth = every && i % every === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r - l), Math.sin(a) * (r - l));
      ctx.stroke();
    }
    ctx.restore();
  }

  let t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const color = accent();

    // livelli
    smooth += (level - smooth) * 0.35;
    level *= 0.92;
    const target = state === "listening" ? 0.35 + smooth * 1.4 : state === "speaking" ? 0.5 + 0.35 * Math.abs(Math.sin(t * 9)) * Math.abs(Math.sin(t * 2.3)) : state === "thinking" ? 0.6 : state === "idle" ? 0.12 : 0.03;
    energy += (target - energy) * 0.08;
    wakeFlash *= 0.93;
    waveform.push(state === "speaking" ? energy * (0.6 + 0.4 * Math.random()) : smooth);
    waveform.shift();

    ctx.clearRect(0, 0, w, h);

    // alone
    const glow = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.1);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.08 + energy * 0.22 + wakeFlash * 0.4;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    const speed = state === "thinking" ? 2.2 : state === "speaking" ? 1.0 : state === "listening" ? 0.7 : 0.25;

    // anelli esterni
    ring(cx, cy, R, 1, color, 0.35, null, 0);
    ticks(cx, cy, R, 120, 6, color, 0.5, t * 0.05 * speed, 10);
    arcs(cx, cy, R * 0.93, 3, Math.PI * 0.45, 3, color, 0.55 + energy * 0.3, t * 0.3 * speed);
    arcs(cx, cy, R * 0.84, 6, Math.PI * 0.14, 2, color, 0.35, -t * 0.5 * speed);
    ring(cx, cy, R * 0.78, 1, color, 0.25, [4, 10], t * 0.1);

    // forma d'onda circolare
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    const base = R * 0.62;
    for (let i = 0; i <= waveform.length; i++) {
      const v = waveform[i % waveform.length];
      const a = (i / waveform.length) * Math.PI * 2 - Math.PI / 2;
      const rr = base + v * R * 0.14 * (state === "idle" ? 0.4 : 1);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6 + energy * 0.4;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.restore();

    // anelli interni
    arcs(cx, cy, R * 0.5, 4, Math.PI * 0.3, 4, color, 0.5, -t * 0.8 * speed);
    ticks(cx, cy, R * 0.46, 60, 4, color, 0.4, -t * 0.2 * speed);
    if (state === "thinking") arcs(cx, cy, R * 0.42, 2, Math.PI * 0.8, 2, color, 0.9, t * 4);

    // nucleo
    const core = R * (0.18 + energy * 0.08 + wakeFlash * 0.1);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
    cg.addColorStop(0, "#ffffff");
    cg.addColorStop(0.35, color);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.55 + energy * 0.45;
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ring(cx, cy, core * 0.75, 1.5, "#ffffff", 0.5 + energy * 0.4, null, 0);

    // barre microfono
    const on = Math.round(Math.min(1, smooth * 1.6) * 12);
    bars.childNodes.forEach((el, i) => el.classList.toggle("on", i < on));

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  connect();
})();
