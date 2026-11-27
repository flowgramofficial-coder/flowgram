function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}
/** Lazy getters so `next build` does not need secrets present. */
export const env = {
  get databaseUrl() { return req("DATABASE_URL"); },
  get valkeyUrl() { return req("VALKEY_URL"); },
  get appOrigin() { return process.env.APP_ORIGIN ?? "http://localhost:3000"; },
  get metaAppId() { return req("META_APP_ID"); },
  get metaAppSecret() { return req("META_APP_SECRET"); },
  get metaRedirectUri() { return req("META_OAUTH_REDIRECT_URI"); },
  get stripeSecret() { return req("STRIPE_SECRET_KEY"); },
  get stripeProPrice() { return req("STRIPE_PRO_PRICE_ID"); },
  get turnstileSecret() { return process.env.TURNSTILE_SECRET ?? ""; },
  get secureCookies() { return process.env.NODE_ENV === "production"; },
};
