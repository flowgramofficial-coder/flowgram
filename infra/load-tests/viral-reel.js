// k6 run -e BASE_URL=https://hooks.example.com -e META_APP_SECRET=... infra/load-tests/viral-reel.js
// Simulates a viral Reel: 1,000 signed webhook events per second for 5 minutes.
import crypto from "k6/crypto";
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:4000";
const SECRET = __ENV.META_APP_SECRET || "load-test-secret";
const dropped = new Counter("dropped_webhooks");

export const options = {
  scenarios: {
    viral: { executor: "constant-arrival-rate", rate: 1000, timeUnit: "1s", duration: "5m", preAllocatedVUs: 200, maxVUs: 1000 },
  },
  thresholds: {
    // p99 ingest latency < 50ms, zero dropped webhooks (every request must be acked 200)
    http_req_duration: ["p(99)<50"],
    dropped_webhooks: ["count==0"],
    http_req_failed: ["rate==0"],
  },
};

export default function () {
  const id = `${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: "17841400000000000", time: Date.now(), changes: [{ field: "comments", value: {
      id: `cmt-${id}`, text: "link please", from: { id: `u-${id}`, username: "viral_fan" }, media: { id: "reel-1" } } }] }],
  });
  const sig = "sha256=" + crypto.hmac("sha256", SECRET, body, "hex");
  const res = http.post(`${BASE}/webhooks/instagram`, body, { headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
  const ok = check(res, { "acked 200": (r) => r.status === 200 });
  if (!ok) dropped.add(1);
}
