import "server-only";
import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | null = null;
export const stripe = (): Stripe => (client ??= new Stripe(env.stripeSecret));
