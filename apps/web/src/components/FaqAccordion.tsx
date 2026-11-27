"use client";
import * as Accordion from "@radix-ui/react-accordion";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SPRING } from "./Simulator";

export interface FaqGroup { title: string; items: Array<{ q: string; a: string }> }

export function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
  const [open, setOpen] = useState<string[]>([]);
  return (
    <div className="space-y-10">
      {groups.map((g, gi) => (
        <section key={g.title} aria-labelledby={`faq-${gi}`}>
          <h2 id={`faq-${gi}`} className="mb-3 text-[20px]">{g.title}</h2>
          <Accordion.Root type="multiple" value={open} onValueChange={setOpen} className="panel divide-y divide-[var(--hair)]">
            {g.items.map((it, i) => {
              const v = `${gi}-${i}`;
              const isOpen = open.includes(v);
              return (
                <Accordion.Item key={v} value={v}>
                  <Accordion.Header>
                    <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium">
                      {it.q}
                      <motion.svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden className="shrink-0 text-[var(--ink-3)]" animate={{ rotate: isOpen ? 45 : 0 }} transition={SPRING}><path d="M8 3v10M3 8h10" /></motion.svg>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content forceMount asChild>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div key="c" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
                          <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-[var(--ink-2)]">{it.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Accordion.Content>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
        </section>
      ))}
    </div>
  );
}
