import { createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function secret(): string {
  return process.env.AUTH_SECRET ?? "flowgram-dev-captcha-secret";
}

export async function GET() {
  const a = Math.floor(Math.random() * 9) + 2;
  const b = Math.floor(Math.random() * 9) + 2;
  const nonce = randomBytes(12).toString("hex");
  const exp = Date.now() + 5 * 60_000;
  const payload = `${a + b}.${exp}.${nonce}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return NextResponse.json({
    question: `What is ${a} + ${b}?`,
    token: `${exp}.${nonce}.${sig}`,
  });
}
