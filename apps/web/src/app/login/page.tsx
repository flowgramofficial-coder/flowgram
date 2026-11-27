import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logInAction } from "@/actions/auth";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function Login() {
  if ((await getSession())?.mfaPassed) redirect("/app");
  return <AuthForm action={logInAction} mode="login" nonce={(await headers()).get("x-nonce") ?? undefined} />;
}
