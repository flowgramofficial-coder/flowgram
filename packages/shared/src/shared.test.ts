import { describe, expect, it } from "vitest";
import { commentRuleInputSchema, interpolate, metaWebhookSchema, personaConfigInputSchema, welcomeConfigInputSchema } from "./index.js";

const uuid = "4f8c1a52-3a2e-4b7a-9d1e-2c6b8a9f0e11";
const rule = { name: "r", isActive: true, igAccountId: uuid, mediaScope: "any", targetMediaId: null, matchType: "keywords", keywords: ["link"], publicReplyEnabled: false, publicReplyTemplates: [], dmTemplate: "hi", ctaLabel: null, ctaUrl: null, priority: 0 };

describe("comment rule input (API boundary)", () => {
  it("accepts a valid rule", () => expect(commentRuleInputSchema.safeParse(rule).success).toBe(true));
  it("rejects unknown keys, so workspaceId can never be smuggled in from a client", () => {
    expect(commentRuleInputSchema.safeParse({ ...rule, workspaceId: uuid }).success).toBe(false);
    expect(commentRuleInputSchema.safeParse({ ...rule, id: uuid }).success).toBe(false);
  });
  it("enforces cross-field rules", () => {
    expect(commentRuleInputSchema.safeParse({ ...rule, mediaScope: "specific" }).success).toBe(false);
    expect(commentRuleInputSchema.safeParse({ ...rule, keywords: [] }).success).toBe(false);
    expect(commentRuleInputSchema.safeParse({ ...rule, publicReplyEnabled: true }).success).toBe(false);
    expect(commentRuleInputSchema.safeParse({ ...rule, ctaLabel: "Go" }).success).toBe(false);
  });
  it("only allows https CTA links (no javascript:, data:, or plain http)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://insecure.example"]) {
      expect(commentRuleInputSchema.safeParse({ ...rule, ctaLabel: "Go", ctaUrl: bad }).success).toBe(false);
    }
    expect(commentRuleInputSchema.safeParse({ ...rule, ctaLabel: "Go", ctaUrl: "https://ok.example/x" }).success).toBe(true);
  });
  it("bounds sizes", () => {
    expect(commentRuleInputSchema.safeParse({ ...rule, dmTemplate: "x".repeat(1001) }).success).toBe(false);
    expect(commentRuleInputSchema.safeParse({ ...rule, keywords: Array(31).fill("a") }).success).toBe(false);
  });
});

describe("other config schemas", () => {
  it("welcome: icebreaker ids are slug-only (they travel inside quick-reply payloads)", () => {
    const base = { igAccountId: uuid, isActive: true, delaySeconds: 5, messageTemplate: "hi" };
    expect(welcomeConfigInputSchema.safeParse({ ...base, icebreakers: [{ id: "pricing", title: "P", reply: "r" }] }).success).toBe(true);
    expect(welcomeConfigInputSchema.safeParse({ ...base, icebreakers: [{ id: "a:b", title: "P", reply: "r" }] }).success).toBe(false);
    expect(welcomeConfigInputSchema.safeParse({ ...base, icebreakers: Array(5).fill({ id: "a", title: "P", reply: "r" }) }).success).toBe(false);
  });
  it("persona: validates domains and active hours", () => {
    const base = { igAccountId: uuid, isActive: true, personaName: "M", tone: "t", emojiLevel: "light", responseLength: "short", signaturePhrases: [], handoffTopics: [], allowedDomains: ["maya.com"], activeHoursJson: null, humanTakeoverPauseHours: 24 };
    expect(personaConfigInputSchema.safeParse(base).success).toBe(true);
    expect(personaConfigInputSchema.safeParse({ ...base, allowedDomains: ["https://maya.com"] }).success).toBe(false);
    expect(personaConfigInputSchema.safeParse({ ...base, activeHoursJson: { days: [1], start: "25:00", end: "09:00" } }).success).toBe(false);
  });
});

describe("meta webhook schema", () => {
  it("tolerates extra fields Meta adds, rejects other objects", () => {
    expect(metaWebhookSchema.safeParse({ object: "instagram", entry: [{ id: "1", extra: true }], newField: 1 }).success).toBe(true);
    expect(metaWebhookSchema.safeParse({ object: "page", entry: [] }).success).toBe(false);
  });
  it("caps entries per delivery", () => {
    expect(metaWebhookSchema.safeParse({ object: "instagram", entry: Array(101).fill({ id: "1" }) }).success).toBe(false);
  });
});

describe("interpolate", () => {
  it("fills placeholders typed with stray spaces or capitals", () => {
    expect(interpolate("Sent {Username}! { username } {POST_TITLE}", { username: "sam", post_title: "Bread" })).toBe("Sent sam! sam Bread");
  });
  it("fills known placeholders and leaves unknown ones", () => {
    expect(interpolate("Hi {username} {other}", { username: "bob" })).toBe("Hi bob {other}");
  });
  it("strips markup characters and control characters from untrusted values", () => {
    expect(interpolate("{username}", { username: "<img src=x onerror=1>\u0000\u0007" })).toBe("img src=x onerror=1");
  });
  it("does not re-expand placeholders that appear inside values", () => {
    expect(interpolate("{username}", { username: "{post_title}", post_title: "SECRET" })).toBe("{post_title}");
  });
});
