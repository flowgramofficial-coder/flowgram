import { describe, expect, it } from "vitest";
import { keywordMatches, pickRule, ruleMatches, type MatchableRule } from "./services/matcher.js";

const rule = (o: Partial<MatchableRule> = {}): MatchableRule => ({
  id: "r", isActive: true, mediaScope: "any", targetMediaId: null, matchType: "keywords", keywords: ["link"], priority: 0,
  createdAt: new Date("2026-01-01"), ...o,
});

describe("keyword matching", () => {
  it("matches on word boundaries only", () => {
    expect(keywordMatches("send me the link please", "link")).toBe(true);
    expect(keywordMatches("linkedin", "link")).toBe(false);
    expect(keywordMatches("blink", "link")).toBe(false);
    expect(keywordMatches("link!", "link")).toBe(true);
  });
  it("normalises case, width and whitespace (NFKC)", () => {
    expect(ruleMatches(rule(), null, "  LINK  ")).toBe(true);
    expect(ruleMatches(rule({ keywords: ["link"] }), null, "ＬＩＮＫ")).toBe(true); // full-width
    expect(ruleMatches(rule({ keywords: ["free guide"] }), null, "free    GUIDE pls")).toBe(true);
  });
  it("works for non-ASCII scripts where \\b fails", () => {
    expect(keywordMatches("मुझे लिंक चाहिए", "लिंक")).toBe(true);
    expect(keywordMatches("café menu", "café")).toBe(true);
    expect(keywordMatches("cafés", "café")).toBe(false);
  });
  it("matches emoji keywords by substring", () => {
    expect(keywordMatches("🔥🔥", "🔥")).toBe(true);
    expect(keywordMatches("nice", "🔥")).toBe(false);
  });
  it("is safe against regex metacharacters in keywords", () => {
    expect(keywordMatches("what is c++?", "c++")).toBe(true);
    expect(() => keywordMatches("x", "(((")).not.toThrow();
    expect(keywordMatches("aaaa", ".*")).toBe(false);
  });
});

describe("rule selection", () => {
  it("respects scope and active flag", () => {
    expect(ruleMatches(rule({ mediaScope: "specific", targetMediaId: "m1" }), "m1", "link")).toBe(true);
    expect(ruleMatches(rule({ mediaScope: "specific", targetMediaId: "m1" }), "m2", "link")).toBe(false);
    expect(ruleMatches(rule({ mediaScope: "specific", targetMediaId: "m1" }), null, "link")).toBe(false);
    expect(ruleMatches(rule({ isActive: false }), null, "link")).toBe(false);
    expect(ruleMatches(rule({ matchType: "any", keywords: [] }), null, "anything at all")).toBe(true);
  });
  it("picks highest priority, then oldest", () => {
    const a = rule({ id: "a", priority: 1, createdAt: new Date("2026-02-01") });
    const b = rule({ id: "b", priority: 5 });
    const c = rule({ id: "c", priority: 5, createdAt: new Date("2025-12-01") });
    expect(pickRule([a, b, c], null, "link")?.id).toBe("c");
    expect(pickRule([a], null, "nothing")).toBeNull();
  });
});
