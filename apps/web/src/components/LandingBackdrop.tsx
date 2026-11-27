"use client";
import { useReducedMotion } from "motion/react";

/**
 * Fixed, non-interactive backdrop for the landing page: a slowly drifting architectural grid plus two soft
 * lights (crimson-rose and obsidian). Everything animates with transform/opacity only. Under reduced
 * motion the CSS stops the animations and the scene stays as a still frame.
 */
export function LandingBackdrop() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden data-static={reduce ? "true" : undefined} className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="fg-glow fg-glow-a" style={reduce ? { animation: "none" } : undefined} />
      <div className="fg-glow fg-glow-b" style={reduce ? { animation: "none" } : undefined} />
      <div className="fg-grid" style={reduce ? { animation: "none" } : undefined} />
    </div>
  );
}
