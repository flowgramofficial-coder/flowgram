"use client";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useId } from "react";
import { SPRING } from "./Simulator";

/** Lightning pulse mark. The stroke draws itself on mount; hover adds a spring tilt and a sheen sweep. */
export function BrandMark({ size = 28 }: { size?: number }) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <motion.svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden initial="rest" animate="rest" whileHover={reduce ? undefined : "hover"} whileTap={reduce ? undefined : "tap"}
      variants={{ rest: { scale: 1, rotate: 0 }, hover: { scale: 1.08, rotate: -6 }, tap: { scale: 0.94 } }} transition={SPRING} style={{ overflow: "visible" }}>
      <defs>
        <clipPath id={`${id}-clip`}><rect width="32" height="32" rx="9" /></clipPath>
        <linearGradient id={`${id}-sheen`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <g clipPath={`url(#${id}-clip)`}>
        <motion.rect y="-4" width="14" height="40" fill={`url(#${id}-sheen)`} transform="skewX(-18)" variants={{ rest: { x: -24, opacity: 0 }, hover: { x: 44, opacity: 1, transition: { duration: 0.65, ease: "easeInOut" } } }} />
      </g>
      <motion.path d="M18.5 5 9 18h6.2L13.5 27 23 13.6h-6.3z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="rgba(255,255,255,0.18)"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={reduce ? { duration: 0 } : { duration: 0.9, ease: "easeOut" }} />
    </motion.svg>
  );
}

export function BrandLogo({ collapsed = false, href = "/", size = 28, className = "" }: { collapsed?: boolean; href?: string; size?: number; className?: string }) {
  return (
    <Link href={href} aria-label="FlowGram home" className={`inline-flex items-center gap-2.5 rounded-lg ${className}`}>
      <BrandMark size={size} />
      {!collapsed && <span className="font-display text-[17px] font-bold tracking-tight">FlowGram</span>}
    </Link>
  );
}
