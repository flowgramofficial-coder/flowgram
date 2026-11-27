"use client";
import { useFormStatus } from "react-dom";
import { logOutAction } from "@/actions/auth";

function Button() {
  const { pending } = useFormStatus();
  return <button className="btn border-[var(--danger)] text-[var(--danger)]" disabled={pending} aria-busy={pending}>{pending ? "Signing out…" : "Sign out"}</button>;
}

export function SignOutButton() {
  return <form action={logOutAction}><Button /></form>;
}
