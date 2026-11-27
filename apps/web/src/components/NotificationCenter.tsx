"use client";

import { useCallback, useEffect, useState } from "react";

interface NotifItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [_seenIds, setSeenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: NotifItem[] };
      const list = data.notifications ?? [];
      setItems(list);

      // Fire native browser push notification for newly arrived unread items if granted
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        setSeenIds((prev) => {
          const next = new Set(prev);
          for (const n of list) {
            if (!n.read && !next.has(n.id) && prev.size > 0) {
              try {
                new Notification(n.title, { body: n.body });
              } catch {
                // ignore if blocked by browser context
              }
            }
            next.add(n.id);
          }
          return next;
        });
      }
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    void fetchNotifs();
    const id = window.setInterval(() => void fetchNotifs(), 20_000);
    return () => window.clearInterval(id);
  }, [fetchNotifs]);

  const requestBrowserPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result === "granted") {
      try {
        new Notification("FlowGram Notifications Enabled", {
          body: "You will now receive instant alerts for handoffs, triggers, and updates.",
        });
      } catch {
        // ignore
      }
    }
  };

  const markAllRead = async () => {
    const unread = items.filter((i) => !i.read).map((i) => i.id);
    if (unread.length === 0) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: unread }),
    }).catch(() => {});
  };

  const unreadCount = items.filter((i) => !i.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void markAllRead();
        }}
        aria-label="Notifications"
        className="btn btn-ghost relative h-9 w-9 p-0"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E1306C] px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="panel absolute right-0 top-11 z-50 w-[320px] p-3 shadow-2xl sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-[var(--hair)] pb-2.5">
            <span className="text-xs font-semibold">Notifications</span>
            {perm === "default" && (
              <button type="button" onClick={requestBrowserPermission} className="rounded-full bg-[#E1306C] px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-95">
                Allow browser alerts
              </button>
            )}
            {perm === "granted" && <span className="mono text-[10px] text-[var(--ok)]">ALERTS ON</span>}
            {perm === "denied" && <span className="mono text-[10px] text-[var(--ink-3)]">BLOCKED</span>}
          </div>

          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {items.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--ink-3)]">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <div key={n.id} className="rounded-lg border border-[var(--hair)] bg-[var(--recess)] p-2.5 text-xs">
                  <div className="font-semibold">{n.title}</div>
                  <p className="mt-0.5 text-[var(--ink-2)]">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
