import { eq } from "drizzle-orm";
import { igAccounts, welcomeBotConfigs, withTenant } from "@flowgram/db";
import type { DmWelcomeJob } from "@flowgram/shared";
import type { Ctx } from "../context.js";
import { sendDm } from "../services/sender.js";

export async function processWelcome(ctx: Ctx, d: DmWelcomeJob): Promise<"sent" | "skipped"> {
  const { cfg, igUserId } = await withTenant(ctx.db, d.workspaceId, async (tx) => ({
    cfg: (await tx.select().from(welcomeBotConfigs).where(eq(welcomeBotConfigs.igAccountId, d.igAccountId)).limit(1))[0],
    igUserId: (await tx.select({ id: igAccounts.igUserId }).from(igAccounts).where(eq(igAccounts.id, d.igAccountId)).limit(1))[0]?.id,
  }));
  if (!cfg?.isActive || !igUserId) return "skipped"; // turned off during the human-like delay
  const res = await sendDm(ctx, {
    workspaceId: d.workspaceId, igAccountId: d.igAccountId, igUserId, recipientId: d.senderId,
    text: cfg.messageTemplate,
    quickReplies: cfg.icebreakers.map((i) => ({ title: i.title, payload: `IB:${i.id}` })),
    source: "welcome_bot", marker: `welcome:${d.igAccountId}:${d.senderId}`,
  });
  return res.sent ? "sent" : "skipped";
}
