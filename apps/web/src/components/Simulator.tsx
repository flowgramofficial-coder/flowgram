"use client";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { interpolate } from "@flowgram/shared";

/** Critically damped spring from the design spec. */
export const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 } as const;

export interface SimProps {
  handle: string;
  postTitle: string;
  commenter: string;
  comment: string;
  dm: string;
  publicReply?: string | null;
  ctaLabel?: string | null;
  /** Autoplay loop. Pass false for a static final frame. */
  loop?: boolean;
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const DELAYS: Record<Step, number> = { 0: 500, 1: 900, 2: 900, 3: 1500, 4: 1300, 5: 4200 };

export function Simulator({ handle, postTitle, commenter, comment, dm, publicReply, ctaLabel, loop = true }: SimProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>(reduce ? 5 : 0);
  const [run, setRun] = useState(0);

  const vars = useMemo(() => ({ username: commenter, post_title: postTitle }), [commenter, postTitle]);
  const dmText = useMemo(() => interpolate(dm, vars), [dm, vars]);
  const replyText = useMemo(() => (publicReply ? interpolate(publicReply, vars) : null), [publicReply, vars]);

  // Restart whenever the content changes, so the preview answers every edit.
  useEffect(() => { setRun((n) => n + 1); }, [comment, dmText, replyText, ctaLabel, handle]);

  useEffect(() => {
    if (reduce) { setStep(5); return; }
    setStep(0);
  }, [run, reduce]);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      if (step < 5) setStep((s) => Math.min(5, (replyText || s !== 1 ? s + 1 : s + 2)) as Step);
      else if (loop) setStep(0);
    }, DELAYS[step]);
    return () => clearTimeout(t);
  }, [step, reduce, loop, replyText]);

  const inDm = step >= 4;
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <div className="relative mx-auto w-[300px] shrink-0 select-none" role="img" aria-label={`Preview: ${commenter} comments "${comment}" and receives a direct message`}>
        <div className="relative h-[580px] overflow-hidden rounded-[36px] border border-[var(--hair-strong)] bg-[var(--panel)] p-[10px]" style={{ boxShadow: "var(--top-light)" }}>
          <div className="relative h-full overflow-hidden rounded-[27px] bg-[var(--canvas)]">
            <div className="absolute left-1/2 top-2 z-20 h-[18px] w-[70px] -translate-x-1/2 rounded-full bg-[var(--ink)]" />

            <AnimatePresence mode="wait" initial={false}>
              {!inDm ? (
                <motion.div key="post" className="absolute inset-0 pt-9" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                  <div className="flex items-center gap-2 px-3 pb-2">
                    <Avatar kind="creator" size={26} ring />
                    <span className="text-[12px] font-semibold">{handle}</span>
                  </div>
                  <div className="mx-3 h-[290px]"><ReelScene handle={handle} caption={postTitle} /></div>
                  <div className="space-y-2.5 px-3 pt-3 text-[12px]">
                    <AnimatePresence>
                      {step >= 1 && (
                        <motion.div key="c" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
                          <Avatar kind="follower" size={24} />
                          <p><b className="font-semibold">{commenter}</b> <span className="text-[var(--ink-2)]">{comment}</span></p>
                        </motion.div>
                      )}
                      {step >= 2 && replyText && (
                        <motion.div key="r" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-8 flex gap-2">
                          <Avatar kind="creator" size={20} />
                          <p><b className="font-semibold">{handle}</b> <span className="text-[var(--ink-2)]">{replyText}</span></p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="dm" className="absolute inset-0 flex flex-col pt-9" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                  <div className="flex items-center gap-2 border-b border-[var(--hair)] px-3 pb-2">
                    <Avatar kind="creator" size={26} ring />
                    <span className="text-[12px] font-semibold">{handle}</span>
                  </div>
                  <div className="flex flex-1 flex-col justify-end gap-2 p-3 text-[12px]">
                    <AnimatePresence mode="popLayout">
                      {step === 4 && (
                        <motion.div key="typing" layout initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                          className="flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-[var(--recess)] py-3" aria-hidden>
                          {[0, 1, 2].map((i) => (
                            <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" animate={reduce ? undefined : { y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }} />
                          ))}
                        </motion.div>
                      )}
                      {step === 5 && (
                        <motion.div key="msg" layout initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="max-w-[86%] self-start">
                          <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--recess)] px-3 py-2 leading-snug ring-1 ring-[var(--hair)]">{dmText}</p>
                          {ctaLabel && <div className="mt-1.5 rounded-lg border border-[var(--accent)] px-3 py-1.5 text-center font-semibold text-[var(--accent)]">{ctaLabel}</div>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {step === 3 && (
                <motion.div key="banner" role="status" className="absolute inset-x-2 top-8 z-30 rounded-2xl border border-[var(--hair-strong)] bg-[var(--panel)] px-3 py-2 text-[12px]"
                  initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}>
                  <b className="font-semibold">{handle}</b>
                  <p className="truncate text-[var(--ink-2)]">{dmText}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

/** Local portrait with an optional Instagram-style story ring. Files live in /public/avatars. */
export function Avatar({ kind, size, ring = false }: { kind: "creator" | "follower"; size: number; ring?: boolean }) {
  const img = <img src={`/avatars/${kind}.svg`} alt="" width={size} height={size} draggable={false} className="block rounded-full bg-[var(--recess)] object-cover" style={{ width: size, height: size }} />;
  if (!ring) return <span className="shrink-0 self-start rounded-full ring-1 ring-[var(--hair-strong)]">{img}</span>;
  return (
    <span className="shrink-0 self-start rounded-full p-[2px]" style={{ background: "conic-gradient(from 210deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75)" }}>
      <span className="block rounded-full bg-[var(--canvas)] p-[2px]">{img}</span>
    </span>
  );
}

/** A looping vertical Reel built from CSS motion: panning scene, equalizer, badge, action rail, caption. No external media. */
function ReelScene({ handle, caption }: { handle: string; caption: string }) {
  const bars = [0, 0.18, 0.06, 0.3, 0.12, 0.24];
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-[#1a1020] text-white ring-1 ring-[var(--hair)]" aria-hidden>
      <svg className="fg-reel-pan absolute inset-0 h-full w-full" viewBox="0 0 280 300" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="reel-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b1d5a" /><stop offset="0.55" stopColor="#c2417a" /><stop offset="1" stopColor="#f6a15a" /></linearGradient>
          <radialGradient id="reel-sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#fff3c4" /><stop offset="0.5" stopColor="#ffc46b" /><stop offset="1" stopColor="#ffc46b" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="280" height="300" fill="url(#reel-sky)" />
        <circle cx="150" cy="150" r="70" fill="url(#reel-sun)" />
        <g className="fg-reel-pan-far"><path d="M-40 190c40-30 80-30 120-8s70 16 110-6 70-16 110 10v140h-340z" fill="#7a2e6b" opacity="0.85" /></g>
        <path d="M-20 220c50-26 90-20 130 0s80 18 120-2 60-14 90 4v100h-340z" fill="#3f1a52" />
        <path d="M-20 250c60-18 100-12 150 4s90 6 160-8v70h-310z" fill="#1d0e2c" />
      </svg>
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M3 9h18M9 3l3 6M15 3l3 6" /><path d="m10 13 5 3-5 3z" fill="currentColor" /></svg>
        Reel
      </div>
      <div className="fg-reel-float absolute right-2 top-16 flex flex-col items-center gap-3.5 text-[10px] font-semibold">
        <span className="flex flex-col items-center gap-0.5"><svg className="fg-heart" width="22" height="22" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2 0 3.4 1.1 4.2 2.4h.1C11.1 6.1 12.5 5 14.5 5c3.3 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z" transform="translate(1 0)" /></svg>12.4K</span>
        <span className="flex flex-col items-center gap-0.5"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3 21l1.5-5.2A8.5 8.5 0 1 1 21 12z" /></svg>842</span>
        <span className="flex flex-col items-center gap-0.5"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d="M22 3 9.5 12.5M22 3l-7 18-5.5-8.5L1 8z" /></svg>Share</span>
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2.5 pt-8">
        <div className="mb-1.5 flex h-4 items-end gap-[3px]">{bars.map((d, i) => <span key={i} className="fg-eq-bar block h-full w-[3px] rounded-sm bg-white/90" style={{ animationDelay: `${d}s`, animationDuration: `${0.7 + (i % 3) * 0.18}s` }} />)}</div>
        <p className="truncate text-[11px] font-semibold">{handle}</p>
        <p className="truncate text-[11px] text-white/85">{caption}</p>
        <p className="mt-0.5 truncate text-[10px] text-white/70">♪ Original audio · {handle}</p>
      </div>
    </div>
  );
}
