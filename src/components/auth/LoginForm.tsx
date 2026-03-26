"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

interface LoginFormProps {
  loading: boolean;
  error: string | null;
  onSubmit: (username: string, password: string) => Promise<void>;
}

export function LoginForm({ loading, error, onSubmit }: LoginFormProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setValidationError("Введите логин и пароль");
      return;
    }

    setValidationError(null);
    await onSubmit(username, password);
  }

  return (
    <div className="relative w-full max-w-md border border-ink/25 bg-white p-6">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
          <Spinner size="lg" />
        </div>
      )}

      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-ink/60">
          Система Анализатор
        </p>
        <h1 className="text-xl font-semibold text-ink">Вход в систему</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Логин"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
        />
        <Input
          label="Пароль"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />

        {(error || validationError) && (
          <div className="animate-shake border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-ember">
            {validationError || error}
          </div>
        )}

        <Button type="submit" className="w-full">
          Войти
        </Button>
      </form>
    </div>
  );
}
