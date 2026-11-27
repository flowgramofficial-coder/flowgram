import { headers } from "next/headers";
import { signUpAction } from "@/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create account" };

export default async function Signup() {
  return <AuthForm action={signUpAction} mode="signup" nonce={(await headers()).get("x-nonce") ?? undefined} />;
}
