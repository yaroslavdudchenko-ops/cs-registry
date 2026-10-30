"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { safeCallbackUrl } from "@/lib/callback-url";
import { LOGIN_EMPTY, loginErrorText } from "@/lib/login-errors";

export function LoginForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const login = username.trim();
    if (login.length === 0 || password.length === 0) {
      setError(LOGIN_EMPTY);
      return;
    }
    setPending(true);
    setError(null);
    const result = await apiRequest<unknown>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: login, password }),
    });
    setPending(false);
    if (!result.ok) {
      setError(loginErrorText(result.status === 0 ? 500 : result.status));
      return;
    }
    const next = safeCallbackUrl(searchParams.get("callbackUrl"));
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="username">Логин</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={pending}
          required
        />
      </div>
      <div>
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          required
        />
      </div>
      {error !== null ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
