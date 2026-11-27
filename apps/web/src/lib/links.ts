/** Every outbound link in one place. Swap a handle here and the footer, FAQ and support pages follow. */
export const LINKS = {
  discord: "https://discord.gg/WKbPCMy6eF",
  telegram: "https://t.me/flowgram_official",
  whatsapp: "https://chat.whatsapp.com/LTWEgQEAjOyJ95IS5iXyE1",
  facebook: "https://www.facebook.com/share/1Fk55wi4g7/",
  instagram: "https://www.instagram.com/flowgram.official",
  x: "https://x.com/Flowgramapp",
  threads: "https://www.threads.com/@flowgram.official",
  youtube: "https://www.youtube.com/@Flowgram.official",
  supportEmail: "flowgram.official@gmail.com",
} as const;

export const SOCIALS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Discord Server", href: LINKS.discord },
  { label: "Telegram Channel", href: LINKS.telegram },
  { label: "WhatsApp Channel", href: LINKS.whatsapp },
  { label: "Facebook Page", href: LINKS.facebook },
  { label: "Instagram", href: LINKS.instagram },
  { label: "X (Twitter)", href: LINKS.x },
  { label: "Threads", href: LINKS.threads },
  { label: "YouTube Channel", href: LINKS.youtube },
];

export const SITE_PAGES: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "Overview", href: "/app" },
  { label: "Comment Rules", href: "/app/rules" },
  { label: "Welcome Message", href: "/app/welcome" },
  { label: "AI Persona", href: "/app/persona" },
  { label: "Plan & Billing", href: "/app/billing" },
  { label: "Settings", href: "/app/settings" },
  { label: "Sign In", href: "/login" },
  { label: "Sign Up", href: "/signup" },
];

export const HELP_PAGES: ReadonlyArray<{ label: string; href: string }> = [
  { label: "FAQ", href: "/faq" },
  { label: "Support", href: "/support" },
  { label: "Terms & Conditions", href: "/terms" },
];
