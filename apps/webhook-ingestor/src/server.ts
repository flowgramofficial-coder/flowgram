import Stripe from "stripe";
import { createConnection, createQueues } from "@flowgram/queue";
import { buildApp } from "./app.js";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const connection = createConnection(need("VALKEY_URL"), "producer");
const queues = createQueues(connection);
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripeWhsec = process.env.STRIPE_WEBHOOK_SECRET;

const { app } = buildApp({
  appSecret: need("META_APP_SECRET"),
  verifyToken: need("META_WEBHOOK_VERIFY_TOKEN"),
  queues,
  stripe: stripeKey && stripeWhsec ? { client: new Stripe(stripeKey), webhookSecret: stripeWhsec } : undefined,
});

const shutdown = async () => { await app.close(); await connection.quit(); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 4000) });
