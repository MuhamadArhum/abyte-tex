"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@abytetex/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api-client";
import { Loader2, CheckCircle2 } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  async function onSubmit(values: ResetPasswordInput) {
    try {
      await api.post("/auth/reset-password", values);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError("root", { message: err.message });
      }
    }
  }

  if (!token) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          This link is missing its reset token. Please use the link from your email, or request a new one.
          <div className="mt-4">
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
              Request a new link
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">Password set. Redirecting you to sign in…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set your password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register("token")} value={token} />
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
            {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
            <p className="text-xs text-muted-foreground">At least 8 characters, with an uppercase letter, a lowercase letter, and a number.</p>
          </div>
          {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Set password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
