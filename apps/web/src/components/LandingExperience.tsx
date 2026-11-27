"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HELP_PAGES, LINKS, SITE_PAGES, SOCIALS } from "@/lib/links";

type ShapeKind = "sphere" | "cube" | "code" | "dna" | "bars" | "stars";

interface ServiceCard {
  id: string;
  title: string;
  shape: ShapeKind;
  desc: string;
  tags: string[];
}

const SERVICES: ServiceCard[] = [
  { id: "01", title: "Comment-to-DM", shape: "cube", desc: "Send instant DMs and public replies the moment followers comment keywords on Reels or posts.", tags: ["Reels", "Posts", "CTA Links"] },
  { id: "02", title: "First-Time Welcome", shape: "code", desc: "Greet new inbox senders automatically with custom delays and tappable quick-reply icebreakers.", tags: ["Auto Greet", "Icebreakers"] },
  { id: "03", title: "Pro AI Persona", shape: "dna", desc: "Train an AI clone on your voice, slang, and knowledge base to chat like you 24/7.", tags: ["Gemini / Claude", "RAG"] },
  { id: "04", title: "Growth Analytics", shape: "bars", desc: "Track triggered DMs, comment matches, and conversion clicks in real time without slowing down.", tags: ["Live Logs", "Counters"] },
  { id: "05", title: "Human Guardrails", shape: "stars", desc: "Auto-pause AI when you reply manually or when followers mention refunds or brand deals.", tags: ["Handoff", "Safety"] },
  { id: "06", title: "Viral Scale Engine", shape: "sphere", desc: "Sub-5ms webhook ingestor + Valkey rate-limiting queues built to survive viral Reel traffic.", tags: ["BullMQ", "RLS"] },
];

const FLOWS = [
  { id: "01", name: "Comment-to-DM Automation", badge: "FREE & PRO", tags: ["Reels & Posts", "Keyword Trigger", "Public Reply + DM"] },
  { id: "02", name: "First-Time DM Welcome Bot", badge: "FREE & PRO", tags: ["New Followers", "Custom Delay", "Quick-Reply Buttons"] },
  { id: "03", name: "Pro AI Persona Bot", badge: "PRO ONLY", tags: ["Talks Like You", "Knowledge Base", "Human Handoff"] },
] as const;

const ICEBREAKERS = [
  { id: "ib1", label: "Get my gear & setup links", reply: "Here is my full creator kit & desk links page: creator.studio/links!" },
  { id: "ib2", label: "Brand collab / sponsorship", reply: `For brand partnerships, drop your brief here or email ${LINKS.supportEmail}.` },
  { id: "ib3", label: "Just saying hi!", reply: "Appreciate the love! Means a ton that you stopped by 🙌" },
];

export function LandingExperience() {
  const [preloadPct, setPreloadPct] = useState(72);
  const [heroReady, setHeroReady] = useState(false);
  const [preloadHidden, setPreloadHidden] = useState(false);

  const [metricMs, setMetricMs] = useState(0);
  const [metricSafe, setMetricSafe] = useState(0);
  const [metricHours, setMetricHours] = useState(0);

  const [activeSvcIdx, setActiveSvcIdx] = useState(0);
  const [activeFlowIdx, setActiveFlowIdx] = useState(0);
  const [clock, setClock] = useState("00:00:00");

  // Interactive simulator states for 01, 02, 03
  const [reelComments, setReelComments] = useState([{ user: "maya.designs", text: "This setup is unreal!! 😍", bot: false }]);
  const [reelDmBanner, setReelDmBanner] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");

  const [welcomeMsgs, setWelcomeMsgs] = useState<Array<{ from: "user" | "bot"; badge?: string; text: string; showIcebreakers?: boolean }>>([
    { from: "user", text: "Hey! Love your content 🙌" },
    { from: "bot", badge: "First-Time Welcome Bot", text: "Hey @sam.eats! 👋 Welcome to my inbox — what can I help you with today?", showIcebreakers: true },
  ]);
  const [welcomeInput, setWelcomeInput] = useState("");

  const [aiMsgs, setAiMsgs] = useState<Array<{ from: "user" | "bot"; badge?: string; text: string; handoff?: boolean }>>([
    { from: "user", text: "What camera do you use for Reels?" },
    { from: "bot", badge: "Pro AI Clone · Witty & Casual", text: "Yo @sam.eats! I shoot on Sony A7IV + 24mm f/1.4 with a softbox key light — full gear links are at creator.studio/reel-gear 🔥" },
  ]);
  const [aiInput, setAiInput] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heroAnchorRef = useRef<HTMLDivElement | null>(null);
  const svcAnchorRef = useRef<HTMLDivElement | null>(null);
  const autoSecRef = useRef<HTMLElement | null>(null);
  const liveSecRef = useRef<HTMLElement | null>(null);
  const activeSvcRef = useRef(0);

  useEffect(() => {
    activeSvcRef.current = activeSvcIdx;
  }, [activeSvcIdx]);

  // 1. Preloader + metric count-up
  useEffect(() => {
    let v = 72;
    const countTo = (setter: (n: number) => void, target: number, dur: number) => {
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        setter(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const timer = window.setInterval(() => {
      v = Math.min(100, v + 7);
      setPreloadPct(v);
      if (v >= 100) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          setHeroReady(true);
          countTo(setMetricMs, 5, 900);
          countTo(setMetricSafe, 100, 1100);
          countTo(setMetricHours, 24, 950);
          window.setTimeout(() => setPreloadHidden(true), 480);
        }, 150);
      }
    }, 45);
    return () => window.clearInterval(timer);
  }, []);

  // 2. Live clock
  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  // 3. IntersectionObserver for slide/pop-up entrance animations
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-anim]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("fg-in-view"));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("fg-in-view");
        });
      },
      { threshold: 0.14 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // 4. Sticky scroll-pinned cycling for Our Automations (01->06) and Live Flows (01->03)
  useEffect(() => {
    const onScroll = () => {
      const autoEl = autoSecRef.current;
      if (autoEl) {
        const ar = autoEl.getBoundingClientRect();
        const scrollable = Math.max(1, autoEl.offsetHeight - window.innerHeight);
        if (ar.top <= 0 && ar.bottom >= window.innerHeight) {
          const p1 = Math.min(0.999, Math.max(0, -ar.top / scrollable));
          const nextSvc = Math.min(SERVICES.length - 1, Math.floor(p1 * SERVICES.length));
          setActiveSvcIdx((prev) => (prev !== nextSvc ? nextSvc : prev));
        }
      }
      const liveEl = liveSecRef.current;
      if (liveEl) {
        const lr = liveEl.getBoundingClientRect();
        const scrollable = Math.max(1, liveEl.offsetHeight - window.innerHeight);
        if (lr.top <= 0 && lr.bottom >= window.innerHeight) {
          const p2 = Math.min(0.999, Math.max(0, -lr.top / scrollable));
          const nextFlow = Math.min(FLOWS.length - 1, Math.floor(p2 * FLOWS.length));
          setActiveFlowIdx((prev) => (prev !== nextFlow ? nextFlow : prev));
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 5. Unified traveling 3D particle canvas with cursor repulsion + auto dark/light colors
  useEffect(() => {
    const canvas = canvasRef.current;
    const heroAnchor = heroAnchorRef.current;
    const svcAnchor = svcAnchorRef.current;
    const autoSection = autoSecRef.current;
    if (!canvas || !heroAnchor || !svcAnchor || !autoSection) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

    const COUNT = 1500;
    const pts = Array.from({ length: COUNT }, (_, i) => ({
      x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, ox: 0, oy: 0, vx: 0, vy: 0,
      r: 1.0 + (i % 3) * 0.45,
      kind: (i % 5 === 0 ? "pink" : i % 3 === 0 ? "soft" : "base") as "pink" | "soft" | "base",
    }));

    let currentShape: ShapeKind = "sphere";
    const computeTargets = (shape: ShapeKind) => {
      if (currentShape === shape && pts[0]?.tx !== 0) return;
      currentShape = shape;
      const S = 152;
      for (let i = 0; i < COUNT; i++) {
        const p = pts[i]!;
        if (shape === "sphere") {
          const phi = Math.acos(1 - (2 * (i + 0.5)) / COUNT);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          p.tx = S * Math.sin(phi) * Math.cos(theta);
          p.ty = S * Math.sin(phi) * Math.sin(theta);
          p.tz = S * Math.cos(phi);
        } else if (shape === "cube") {
          const side = Math.floor(Math.cbrt(COUNT));
          const step = (S * 1.35) / Math.max(1, side - 1);
          const ix = i % side;
          const iy = Math.floor(i / side) % side;
          const iz = Math.floor(i / (side * side)) % side;
          p.tx = (ix - (side - 1) / 2) * step;
          p.ty = (iy - (side - 1) / 2) * step;
          p.tz = (iz - (side - 1) / 2) * step;
        } else if (shape === "code") {
          const seg = i % 3;
          const t = (((i / 3) % (COUNT / 3)) / (COUNT / 3)) * 2 - 1;
          const jit = ((i * 17) % 11) - 5;
          if (seg === 0) { p.tx = -S * 0.72 + Math.abs(t) * S * 0.4 + jit; p.ty = t * S * 0.62; p.tz = jit * 2; }
          else if (seg === 1) { p.tx = S * 0.72 - Math.abs(t) * S * 0.4 + jit; p.ty = t * S * 0.62; p.tz = jit * 2; }
          else { p.tx = t * S * 0.26 + jit; p.ty = -t * S * 0.72; p.tz = jit * 2; }
        } else if (shape === "bars") {
          const col = i % 4;
          const hs = [0.35, 0.55, 0.82, 1.05];
          const u = ((i * 13) % 100) / 100;
          p.tx = (col - 1.5) * S * 0.46 + (((i * 7) % 22) - 11);
          p.ty = S * 0.58 - u * S * (hs[col] ?? 0.5);
          p.tz = ((i * 19) % 22) - 11;
        } else if (shape === "dna") {
          const t = (i / COUNT) * Math.PI * 5;
          const strand = i % 2 === 0 ? 1 : -1;
          p.tx = Math.cos(t) * S * 0.42 * strand;
          p.ty = (i / COUNT - 0.5) * S * 1.85;
          p.tz = Math.sin(t) * S * 0.42 * strand;
        } else {
          const cl = i % 3;
          const cx = [0, -S * 0.6, S * 0.6][cl] ?? 0;
          const cy = [-S * 0.35, S * 0.38, S * 0.32][cl] ?? 0;
          const a = (i / 3) * 0.4;
          const rad = (Math.abs(Math.cos(a * 2)) * 0.7 + 0.15) * S * 0.52;
          p.tx = cx + Math.cos(a) * rad;
          p.ty = cy + Math.sin(a) * rad;
          p.tz = Math.sin(i) * 16;
        }
      }
    };

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    computeTargets("sphere");
    pts.forEach((p) => { p.x = p.tx; p.y = p.ty; p.z = p.tz; });
    resize();
    window.addEventListener("resize", resize);

    let mouseX = -9999;
    let mouseY = -9999;
    const onMove = (e: PointerEvent) => { mouseX = e.clientX; mouseY = e.clientY; };
    const onLeave = () => { mouseX = -9999; mouseY = -9999; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    let angleY = 0;
    let curCx = w / 2;
    let curCy = h / 2;
    let curScale = 1;
    let curOpacity = 1;
    let rafId = 0;

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const isDark = darkMedia.matches;

      const hr = heroAnchor.getBoundingClientRect();
      const sr = svcAnchor.getBoundingClientRect();
      const ar = autoSection.getBoundingClientRect();
      const heroCenterX = hr.left + hr.width / 2;
      const heroCenterY = hr.top + hr.height / 2;
      const svcCenterX = sr.left + sr.width / 2;
      const svcCenterY = sr.top + sr.height / 2;

      const rawT = Math.max(0, Math.min(1, window.scrollY / Math.max(1, window.innerHeight)));
      const easeT = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

      const targetCx = heroCenterX + (svcCenterX - heroCenterX) * easeT;
      const targetCy = heroCenterY + (svcCenterY - heroCenterY) * easeT;
      const targetScale = 1 - 0.14 * easeT;

      const fadeOut = ar.bottom < window.innerHeight * 0.55
        ? Math.max(0, ar.bottom / (window.innerHeight * 0.55))
        : 1;

      curCx += (targetCx - curCx) * 0.18;
      curCy += (targetCy - curCy) * 0.18;
      curScale += (targetScale - curScale) * 0.18;
      curOpacity += (fadeOut - curOpacity) * 0.16;

      const activeService = SERVICES[activeSvcRef.current] ?? SERVICES[0]!;
      computeTargets(easeT > 0.38 ? activeService.shape : "sphere");

      if (!reduced) angleY += 0.0045;
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(0.18);
      const sinX = Math.sin(0.18);
      const fov = 460;
      const repelRadius = 115;

      if (curOpacity > 0.02) {
        for (let i = 0; i < COUNT; i++) {
          const p = pts[i]!;
          p.x += (p.tx - p.x) * 0.085;
          p.y += (p.ty - p.y) * 0.085;
          p.z += (p.tz - p.z) * 0.085;

          const x1 = p.x * cosY - p.z * sinY;
          const z1 = p.z * cosY + p.x * sinY;
          const y2 = p.y * cosX - z1 * sinX;
          const z2 = z1 * cosX + p.y * sinX;
          const persp = fov / (fov + z2 + 250);
          if (persp <= 0) continue;

          const baseSx = curCx + x1 * persp * curScale;
          const baseSy = curCy + y2 * persp * curScale;

          const dx = baseSx + p.ox - mouseX;
          const dy = baseSy + p.oy - mouseY;
          const dist = Math.hypot(dx, dy);
          if (!reduced && dist < repelRadius && dist > 0.001) {
            const force = Math.pow(1 - dist / repelRadius, 2) * 16;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
          p.vx += -p.ox * 0.09;
          p.vy += -p.oy * 0.09;
          p.vx *= 0.82;
          p.vy *= 0.82;
          p.ox += p.vx;
          p.oy += p.vy;

          ctx.globalAlpha = Math.max(0.12, Math.min(0.95, persp * 0.92)) * curOpacity;
          if (p.kind === "pink") ctx.fillStyle = "#E1306C";
          else if (p.kind === "soft") ctx.fillStyle = isDark ? "#FF85AE" : "#BE185D";
          else ctx.fillStyle = isDark ? "#FFFFFF" : "#18181B";

          ctx.beginPath();
          ctx.arc(baseSx + p.ox, baseSy + p.oy, p.r * persp, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (!reduced && document.visibilityState !== "hidden") {
        rafId = requestAnimationFrame(tick);
      }
    };

    tick();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const submitReelComment = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setReelComments((prev) => [
      ...prev,
      { user: "sam.eats", text, bot: false },
      ...(/link|setup|gear|guide/i.test(text)
        ? [{ user: "flowgram.official", text: "Sent you a DM, @sam.eats! 📩", bot: true }]
        : []),
    ]);
    setReelDmBanner(/link|setup|gear|guide/i.test(text) ? "Hey @sam.eats! Here is the link you asked for: creator.studio/links" : null);
    setCommentInput("");
  };

  const submitWelcome = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setWelcomeMsgs((prev) => [
      ...prev,
      { from: "user", text },
      { from: "bot", badge: "First-Time Welcome Bot", text: "Hey @sam.eats! Thanks for reaching out — tap any quick reply below or tell me what you need!" },
    ]);
    setWelcomeInput("");
  };

  const submitAi = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const isHandoff = /refund|legal|cancel/i.test(text);
    const isKb = /keyboard|desk|setup/i.test(text);
    setAiMsgs((prev) => [
      ...prev,
      { from: "user", text },
      isHandoff
        ? { from: "bot", handoff: true, badge: "Guardrail Triggered · Paused for Human", text: "Since this is about a refund, I have paused AI replies and notified the creator to respond personally ASAP!" }
        : isKb
          ? { from: "bot", badge: "Pro AI Clone · Knowledge Base", text: "Custom 75% mechanical keyboard with tactile switches + wool desk mat — grab the links at creator.studio/desk-setup 🙌" }
          : { from: "bot", badge: "Pro AI Clone · Witty & Casual", text: "Appreciate you messaging! Ask me about my camera gear, desk setup, or collabs and I gotchu ✨" },
    ]);
    setAiInput("");
  };

  const activeFlow = FLOWS[activeFlowIdx] ?? FLOWS[0]!;
  const trackOffset = Math.max(0, activeSvcIdx - 1) * 185;

  return (
    <div className={`min-h-screen bg-[var(--canvas)] text-[var(--ink)] ${heroReady ? "fg-hero-ready" : ""}`}>
      <style>{`
        .fg-reveal-mask { overflow: hidden; display: block; }
        .fg-reveal-line {
          display: inline-block;
          transform: translateY(112%);
          opacity: 0;
          transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.65s ease;
        }
        .fg-hero-ready .fg-reveal-line { transform: translateY(0); opacity: 1; }
        .fg-delay-1 { transition-delay: 0.08s; }
        .fg-delay-2 { transition-delay: 0.22s; }
        .fg-hero-fade {
          opacity: 0;
          transform: translateY(20px);
          transition: transform 0.85s cubic-bezier(0.16, 1, 0.3, 1) 0.4s, opacity 0.7s ease 0.4s;
        }
        .fg-hero-ready .fg-hero-fade { opacity: 1; transform: translateY(0); }
        [data-anim] { opacity: 0; transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.7s ease; will-change: transform, opacity; }
        [data-anim="up"] { transform: translateY(34px); }
        [data-anim="left"] { transform: translateX(-36px); }
        [data-anim="right"] { transform: translateX(36px); }
        [data-anim="pop"] { transform: scale(0.92) translateY(20px); }
        [data-anim].fg-in-view { opacity: 1; transform: translate3d(0,0,0) scale(1); }
        .fg-horizon { position: relative; height: 170px; overflow: hidden; }
        .fg-horizon::before {
          content: ""; position: absolute; left: 50%; top: 34px; transform: translateX(-50%);
          width: 145%; height: 540px; border-radius: 50%;
          border-top: 2px solid rgba(225, 48, 108, 0.75);
          background: radial-gradient(ellipse at top, rgba(225, 48, 108, 0.2) 0%, transparent 45%);
          box-shadow: 0 -14px 45px rgba(225, 48, 108, 0.22); pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .fg-reveal-line, .fg-hero-fade, [data-anim] { transform: none !important; opacity: 1 !important; transition: none !important; }
        }
      `}</style>

      {/* Preloader */}
      {!preloadHidden && (
        <div
          className={`fixed inset-0 z-50 flex items-center bg-[var(--canvas)] px-6 sm:px-12 transition-opacity duration-500 ${heroReady ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden px-4">
            <span className="select-none font-bold tracking-[0.04em] text-current opacity-[0.045] text-[clamp(48px,13.5vw,230px)]">FLOWGRAM</span>
          </div>
          <div
            className="relative z-10 flex h-[74vh] w-full max-w-[360px] flex-col justify-between rounded-2xl border border-[var(--hair)] p-7"
            style={{ background: "linear-gradient(180deg, var(--panel) 0%, rgba(225, 48, 108, 0.28) 100%)" }}
          >
            <div className="text-6xl font-light tracking-tight tabular-nums sm:text-7xl">{preloadPct}%</div>
            <div className="mono text-[11px] tracking-[0.2em] text-[var(--ink-2)]">LOADING...</div>
          </div>
        </div>
      )}

      {/* Unified Traveling 3D Particle Canvas */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-10 h-full w-full" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-[var(--hair)] bg-[var(--canvas)]/80 backdrop-blur-md">
        <div className="flex h-16 w-full items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="#hero" className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#E1306C] text-white">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
              </svg>
            </span>
            <span>FLOWGRAM</span>
          </a>

          <nav className="hidden items-center gap-8 text-xs font-medium text-[var(--ink-2)] md:flex">
            <a href="#automations" className="transition-colors hover:text-[#E1306C]">Automations</a>
            <a href="#live-flows" className="transition-colors hover:text-[#E1306C]">Live Flows</a>
            <a href="#reviews" className="transition-colors hover:text-[#E1306C]">Creators</a>
            <a href="#pricing" className="transition-colors hover:text-[#E1306C]">Pricing</a>
            <Link href="/login" className="transition-colors hover:text-[#E1306C]">Sign in</Link>
          </nav>

          <Link href="/signup" className="inline-flex items-center gap-2.5 rounded-full border border-[var(--hair-strong)] py-1.5 pl-4 pr-1.5 text-xs font-medium transition-colors hover:border-[#E1306C]">
            <span>Start Your Bot</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E1306C] text-white text-xs">↗</span>
          </Link>
        </div>
      </header>

      <main className="relative z-20">
        {/* HERO */}
        <section id="hero" className="relative flex min-h-screen w-full flex-col justify-between overflow-hidden px-5 pt-24 pb-10 sm:px-8 lg:px-12">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden px-4">
            <span className="select-none whitespace-nowrap font-bold tracking-[0.04em] text-current opacity-[0.045] text-[clamp(48px,13.5vw,230px)]">FLOWGRAM</span>
          </div>
          <div className="h-4" />

          <div className="relative flex w-full items-center justify-center py-4">
            <div ref={heroAnchorRef} className="h-[340px] w-full max-w-[420px] sm:h-[420px]" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="grid w-full grid-cols-1 items-center gap-4 px-2 sm:px-6 lg:grid-cols-[1fr_280px_1fr] lg:px-10">
                <h1 className="text-center text-4xl font-medium tracking-tight sm:text-5xl lg:text-right lg:text-[62px] lg:leading-[1.08]">
                  <span className="fg-reveal-mask">
                    <span className="fg-reveal-line fg-delay-1">Building <span className="text-[#E1306C]">Automated</span></span>
                  </span>
                </h1>
                <div className="hidden h-24 lg:block" />
                <div className="text-center text-4xl font-medium tracking-tight sm:text-5xl lg:text-left lg:text-[62px] lg:leading-[1.08]" aria-hidden>
                  <span className="fg-reveal-mask">
                    <span className="fg-reveal-line fg-delay-2">DMs That Matter</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="fg-hero-fade relative z-10 flex w-full flex-col justify-between gap-8 md:flex-row md:items-end">
            <div className="max-w-sm space-y-4">
              <p className="text-xs leading-relaxed text-[var(--ink-2)] sm:text-sm">
                We empower creators and brands with instant Reel Comment-to-DM flows, first-time welcome bots, and Pro AI Personas.
              </p>
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-[#E1306C] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#E1306C]/25 transition-transform hover:opacity-95 active:scale-[0.98]">
                Start Your Bot
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-8 sm:gap-14">
              <div className="flex items-center gap-2.5">
                <span className="text-3xl font-light tracking-tight tabular-nums sm:text-4xl">&lt;{metricMs}<span className="text-[#E1306C]">ms</span></span>
                <span className="text-[11px] leading-tight text-[var(--ink-2)]">Webhook<br />Ingest</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-3xl font-light tracking-tight tabular-nums sm:text-4xl">{metricSafe}<span className="text-[#E1306C]">%</span></span>
                <span className="text-[11px] leading-tight text-[var(--ink-2)]">Official<br />Meta API</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-3xl font-light tracking-tight tabular-nums sm:text-4xl">{metricHours}<span className="text-[#E1306C]">/7</span></span>
                <span className="text-[11px] leading-tight text-[var(--ink-2)]">Pro AI<br />Support</span>
              </div>
            </div>
          </div>
        </section>

        {/* STICKY OUR AUTOMATIONS (660vh) */}
        <section id="automations" ref={autoSecRef} style={{ height: "660vh" }} className="relative w-full border-t border-[var(--hair)]">
          <div className="sticky top-0 flex h-screen w-full items-center overflow-hidden">
            <div className="grid w-full items-center gap-8 px-5 sm:px-8 lg:grid-cols-[440px_1fr] lg:gap-12 lg:px-12">
              <div ref={svcAnchorRef} className="flex h-[320px] items-center justify-center sm:h-[400px]" />
              <div className="min-w-0 space-y-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end" data-anim="up">
                  <div>
                    <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Our Automations</h2>
                    <div className="mono mt-2 flex items-center gap-2 text-[11px] text-[var(--ink-2)]">
                      <span>SCROLL TO CYCLE</span>
                      <span className="text-[#E1306C]">0{activeSvcIdx + 1} / 06</span>
                    </div>
                  </div>
                  <p className="max-w-xs text-xs leading-relaxed text-[var(--ink-2)]">
                    Scroll smoothly to step through all 6 automation capabilities and morph the 3D engine, or click any card.
                  </p>
                </div>

                <div className="overflow-hidden py-2">
                  <div className="flex gap-4 transition-transform duration-500 ease-out" style={{ transform: `translateX(-${trackOffset}px)` }}>
                    {SERVICES.map((s, idx) => {
                      const active = idx === activeSvcIdx;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setActiveSvcIdx(idx)}
                          style={active ? { background: "linear-gradient(180deg, #E1306C 0%, #961945 58%, #260612 100%)", borderColor: "rgba(255,133,174,0.45)" } : undefined}
                          className={`flex h-[290px] w-[270px] shrink-0 flex-col justify-between rounded-2xl border p-6 text-left transition-all duration-300 ${active ? "text-white shadow-2xl -translate-y-1 scale-[1.015]" : "border-[var(--hair)] bg-[var(--panel)] hover:border-[#E1306C]/60"}`}
                        >
                          <div className="flex items-start justify-between">
                            <span className={`mono text-xs ${active ? "text-white/90" : "text-[var(--ink-2)]"}`}>{s.id}</span>
                            <span className={`text-sm ${active ? "text-white" : "text-[var(--ink-2)]"}`}>↗</span>
                          </div>
                          <div>
                            <h3 className="text-lg font-medium">{s.title}</h3>
                            <p className={`mt-2 text-xs leading-relaxed ${active ? "text-white/85" : "text-[var(--ink-2)]"}`}>{s.desc}</p>
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {s.tags.map((t) => (
                                <span key={t} className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${active ? "bg-white/15 text-white" : "bg-[#E1306C]/10 text-[#E1306C]"}`}>{t}</span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STICKY LIVE FLOWS (ONLY 01, 02, 03 — 380vh) */}
        <section id="live-flows" ref={liveSecRef} style={{ height: "380vh" }} className="relative w-full border-t border-[var(--hair)] bg-[var(--canvas)]">
          <div className="sticky top-0 flex h-screen w-full items-center overflow-hidden">
            <div className="w-full px-5 sm:px-8 lg:px-12">
              <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end" data-anim="up">
                <div>
                  <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Live Flows</h2>
                  <div className="mono mt-1.5 flex items-center gap-2 text-[11px] text-[var(--ink-2)]">
                    <span>SCROLL OR CLICK TO TEST</span>
                    <span className="text-[#E1306C]">0{activeFlowIdx + 1} / 03</span>
                  </div>
                </div>
                <p className="max-w-sm text-xs leading-relaxed text-[var(--ink-2)]">
                  Try all 3 core FlowGram bots live inside the interactive simulator on the right.
                </p>
              </div>

              <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-12">
                <div className="divide-y divide-[var(--hair)] border-y border-[var(--hair)]" data-anim="left">
                  {FLOWS.map((f, idx) => {
                    const active = idx === activeFlowIdx;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setActiveFlowIdx(idx)}
                        className={`flex w-full items-center justify-between gap-4 py-6 px-3 text-left transition-all ${active ? "bg-[#E1306C]/10 border-l-2 border-[#E1306C]" : "hover:bg-[#E1306C]/5"}`}
                      >
                        <div className="flex items-center gap-4">
                          <span className={`mono text-xs ${active ? "text-[#E1306C] font-semibold" : "text-[var(--ink-2)]"}`}>{f.id}</span>
                          <span className={`text-lg font-medium ${active ? "" : "text-[var(--ink-2)]"}`}>{f.name}</span>
                        </div>
                        <div className="hidden items-center gap-2 sm:flex">
                          {f.tags.map((t) => (
                            <span key={t} className="rounded-full border border-[var(--hair)] px-2.5 py-0.5 text-[10px] text-[var(--ink-2)]">{t}</span>
                          ))}
                          <span className={`ml-1 text-sm ${active ? "text-[#E1306C]" : "text-[var(--ink-2)]"}`}>↗</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-[var(--hair)] bg-[var(--panel)] p-5 sm:p-6 shadow-2xl" data-anim="pop">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-semibold">{activeFlow.id} · {activeFlow.name}</span>
                    </div>
                    <span className="mono rounded-full border border-[var(--hair)] px-2.5 py-0.5 text-[10px] text-[#E1306C]">{activeFlow.badge}</span>
                  </div>

                  <div className="flex h-[380px] flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-[#07070A] p-4 text-white">
                    {activeFlowIdx === 0 && (
                      <>
                        <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-lg p-3.5" style={{ background: "linear-gradient(145deg, #240714 0%, #52102B 45%, #09090D 100%)" }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E1306C] text-[10px] font-bold text-white">FG</div>
                              <span className="text-xs font-semibold">flowgram.official</span>
                            </div>
                            <span className="mono rounded bg-black/50 px-2 py-0.5 text-[10px]">REEL</span>
                          </div>
                          {reelDmBanner ? (
                            <div className="my-1.5 rounded-lg border border-[#E1306C]/60 bg-black/90 p-2.5 text-[11px] shadow-lg">
                              <div className="font-semibold text-[#FF85AE]">New Auto-DM sent to @sam.eats</div>
                              <div className="mt-0.5 text-slate-200">{reelDmBanner}</div>
                            </div>
                          ) : (
                            <div className="my-auto text-center">
                              <div className="inline-block rounded-lg border border-white/15 bg-black/45 px-3 py-1.5 text-xs backdrop-blur-sm">
                                Comment <span className="mono text-[#FF85AE]">"LINK"</span> or <span className="mono text-[#FF85AE]">"SETUP"</span> below
                              </div>
                            </div>
                          )}
                          <div className="max-h-28 space-y-1.5 overflow-y-auto rounded-lg bg-black/60 p-2.5 text-[11px] backdrop-blur-sm">
                            {reelComments.slice(-4).map((c, i) => (
                              <div key={i} className={c.bot ? "pl-4 text-pink-200" : "text-slate-200"}>
                                <strong className="text-white">{c.user}</strong> {c.text}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => submitReelComment("LINK")} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] hover:bg-white/10">Try &quot;LINK&quot;</button>
                            <button type="button" onClick={() => submitReelComment("SETUP")} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] hover:bg-white/10">Try &quot;SETUP&quot;</button>
                          </div>
                          <form onSubmit={(e) => { e.preventDefault(); submitReelComment(commentInput); }} className="flex gap-2">
                            <input value={commentInput} onChange={(e) => setCommentInput(e.target.value)} type="text" placeholder="Comment as @sam.eats..." className="flex-1 rounded-full border border-white/15 bg-[#0B0C12] px-3.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-[#E1306C] focus:outline-none" />
                            <button type="submit" className="rounded-full bg-[#E1306C] px-4 py-1.5 text-xs font-semibold text-white">Post</button>
                          </form>
                        </div>
                      </>
                    )}

                    {activeFlowIdx === 1 && (
                      <>
                        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                          <span className="text-xs font-semibold">Inbox · First-Time Follower (@sam.eats)</span>
                          <button type="button" onClick={() => setWelcomeMsgs((p) => p.slice(0, 2))} className="text-[11px] text-slate-400 hover:text-white">Reset</button>
                        </div>
                        <div className="my-2 flex-1 space-y-2.5 overflow-y-auto pr-1 text-xs">
                          {welcomeMsgs.map((m, i) => m.from === "user" ? (
                            <div key={i} className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-sm bg-[#E1306C] px-3 py-2">{m.text}</div></div>
                          ) : (
                            <div key={i} className="space-y-1.5">
                              <div className="text-[10px] text-slate-400">{m.badge}</div>
                              <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2 text-slate-100">{m.text}</div>
                              {m.showIcebreakers && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {ICEBREAKERS.map((ib) => (
                                    <button key={ib.id} type="button" onClick={() => setWelcomeMsgs((p) => [...p, { from: "user", text: ib.label }, { from: "bot", badge: "Quick-Reply Auto Response", text: ib.reply }])} className="rounded-full border border-[#E1306C]/50 bg-[#E1306C]/15 px-2.5 py-1 text-[11px] text-pink-200 hover:bg-[#E1306C]/30">
                                      {ib.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); submitWelcome(welcomeInput); }} className="flex gap-2 border-t border-white/10 pt-2.5">
                          <input value={welcomeInput} onChange={(e) => setWelcomeInput(e.target.value)} type="text" placeholder="Send a first DM (e.g. Hi!)..." className="flex-1 rounded-full border border-white/15 bg-[#0B0C12] px-3.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-[#E1306C] focus:outline-none" />
                          <button type="submit" className="rounded-full bg-[#E1306C] px-4 py-1.5 text-xs font-semibold text-white">Send</button>
                        </form>
                      </>
                    )}

                    {activeFlowIdx === 2 && (
                      <>
                        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                          <span className="text-xs font-semibold">Pro AI Clone · Talking as @flowgram.official</span>
                          <span className="mono text-[10px] text-emerald-400">GUARDRAILS ON</span>
                        </div>
                        <div className="my-2 flex-1 space-y-2.5 overflow-y-auto pr-1 text-xs">
                          {aiMsgs.map((m, i) => m.from === "user" ? (
                            <div key={i} className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-sm bg-[#E1306C] px-3 py-2">{m.text}</div></div>
                          ) : (
                            <div key={i} className="space-y-1">
                              <div className={`text-[10px] ${m.handoff ? "text-amber-400" : "text-[#FF85AE]"}`}>{m.badge}</div>
                              <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2 text-slate-100">{m.text}</div>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2 border-t border-white/10 pt-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => submitAi("What desk keyboard do you use?")} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] hover:bg-white/10">Ask: Keyboard</button>
                            <button type="button" onClick={() => submitAi("I need a refund on my order")} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20">Test Guardrail (Refund)</button>
                          </div>
                          <form onSubmit={(e) => { e.preventDefault(); submitAi(aiInput); }} className="flex gap-2">
                            <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} type="text" placeholder="Ask the AI Clone anything..." className="flex-1 rounded-full border border-white/15 bg-[#0B0C12] px-3.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-[#E1306C] focus:outline-none" />
                            <button type="submit" className="rounded-full bg-[#E1306C] px-4 py-1.5 text-xs font-semibold text-white">Send</button>
                          </form>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS + CURVED HORIZON ARC */}
        <section id="reviews" className="w-full border-t border-[var(--hair)] pt-20 pb-6 lg:pt-28">
          <div className="w-full px-5 sm:px-8 lg:px-12">
            <h2 className="mb-10 text-3xl font-medium tracking-tight sm:text-4xl" data-anim="up">What creators<br />say about us</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { quote: "Our Reel hit 40K comments overnight and FlowGram sent every single DM link in seconds without dropping a message.", name: "Aarav Sen", role: "@creator.studio · 240K Followers" },
                { quote: "The First-Time Welcome Bot + Pro AI Clone answers product questions in my exact tone while I sleep.", name: "Maya Kapoor", role: "@maya.glow · Skincare Brand" },
                { quote: "Switching from clunky tools to FlowGram doubled our DM-to-checkout rate and keeps our Instagram 100% API compliant.", name: "Rohan Verma", role: "@dev_rohan · Tech Creator" },
              ].map((t) => (
                <div key={t.name} className="rounded-2xl border border-[var(--hair)] bg-[var(--panel)] p-6" data-anim="pop">
                  <div className="text-2xl text-[#E1306C]">“</div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{t.quote}</p>
                  <div className="mt-6 text-xs font-semibold">{t.name}</div>
                  <div className="text-[11px] text-[var(--ink-2)]">{t.role}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="fg-horizon mt-16 flex flex-col items-center justify-end pb-4 text-center" data-anim="up">
            <div className="relative z-10 mb-6">
              <div className="text-lg font-medium sm:text-xl">Built on Industry-Grade Stack</div>
              <div className="text-xs text-[var(--ink-2)]">Powering creators across India &amp; worldwide</div>
            </div>
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-8 px-6 text-xs font-semibold tracking-wider uppercase text-[var(--ink-2)] sm:gap-14">
              <span>Meta Graph API</span>
              <span>PostgreSQL 19</span>
              <span>Valkey 9.2</span>
              <span>Next.js 16</span>
              <span>Cloudflare WAF</span>
            </div>
          </div>
        </section>

        {/* PRICING + CTA BANNER */}
        <section id="pricing" className="w-full py-16 lg:py-24">
          <div className="w-full space-y-12 px-5 sm:px-8 lg:px-12">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--hair)] bg-[var(--panel)] p-7" data-anim="left">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl font-semibold">Free</h3>
                  <span className="mono text-xl">$0 <span className="text-xs text-[var(--ink-2)]">/ mo</span></span>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-2)]">Up to 5 Comment Rules, First-Time Welcome Bot, 100 DMs/mo.</p>
              </div>
              <div className="rounded-2xl border border-[#E1306C]/50 bg-[var(--panel)] p-7" data-anim="right">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl font-semibold">Pro</h3>
                  <span className="mono text-xl text-[#E1306C]">$29 <span className="text-xs text-[var(--ink-2)]">/ mo</span></span>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-2)]">Unlimited Comment Rules + AI Persona Bot that chats in your voice 24/7.</p>
              </div>
            </div>

            <div
              className="rounded-3xl border border-[var(--hair)] px-7 py-12 sm:px-12 sm:py-16"
              style={{ background: "radial-gradient(60% 110% at 80% 35%, rgba(225, 48, 108, 0.28) 0%, rgba(122, 20, 56, 0.14) 48%, var(--panel) 100%)" }}
              data-anim="pop"
            >
              <h2 className="max-w-lg text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
                We turn simple DMs into powerful automated growth.
              </h2>
              <Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E1306C] px-5 py-2.5 text-xs font-semibold text-white transition-transform hover:opacity-95 active:scale-[0.98]">
                Let&apos;s automate together →
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer id="footer" className="relative z-20 w-full border-t border-[var(--hair)] bg-[var(--canvas)] pt-14 pb-10">
        <div className="w-full px-5 sm:px-8 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]" data-anim="up">
            <div className="flex flex-col justify-between gap-10">
              <div>
                <a href={`mailto:${LINKS.supportEmail}`} className="text-lg font-medium hover:text-[#E1306C] sm:text-xl">{LINKS.supportEmail}</a>
                <div className="mt-1 text-xs text-[var(--ink-2)]">India · Global Creator Automation</div>
              </div>
              <div>
                <div className="mono text-[11px] uppercase tracking-wider text-[var(--ink-2)]">Local Time · Live</div>
                <div className="mono mt-1 text-4xl font-light tracking-tight tabular-nums sm:text-5xl">{clock}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <div>
                <div className="text-xs font-semibold text-[var(--ink-2)]">Socials</div>
                <ul className="mt-3 space-y-2 text-xs">
                  {SOCIALS.map((s) => (
                    <li key={s.label}>
                      <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-[#E1306C]">{s.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--ink-2)]">Pages</div>
                <ul className="mt-3 space-y-2 text-xs">
                  {SITE_PAGES.map((p) => (
                    <li key={p.href}>
                      <Link href={p.href} className="hover:text-[#E1306C]">{p.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--ink-2)]">Help &amp; Legal</div>
                <ul className="mt-3 space-y-2 text-xs">
                  {HELP_PAGES.map((p) => (
                    <li key={p.href}>
                      <Link href={p.href} className="hover:text-[#E1306C]">{p.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-[var(--hair)] pt-6 text-[11px] text-[var(--ink-2)]">
            FlowGram © {new Date().getFullYear()}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
