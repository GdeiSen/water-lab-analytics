"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import type { LicenseStatus } from "@/lib/types";

interface LicenseActivationScreenProps {
  status: LicenseStatus;
  loading: boolean;
  error: string | null;
  onOnlineActivate: (licenseKey: string) => Promise<void>;
  onOfflineActivate: (token: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function LicenseActivationScreen({
  status,
  loading,
  error,
  onOnlineActivate,
  onOfflineActivate,
  onRefresh,
}: LicenseActivationScreenProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [offlineToken, setOfflineToken] = useState("");
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [copied, setCopied] = useState(false);

  async function handleOnlineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onOnlineActivate(licenseKey);
  }

  async function handleOfflineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onOfflineActivate(offlineToken);
  }

  async function copyFingerprint() {
    await navigator.clipboard.writeText(status.fingerprint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f3f5] px-4 py-8">
      <div className="relative w-full max-w-2xl border border-ink/25 bg-white p-6">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <Spinner size="lg" />
          </div>
        )}

        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/60">
            Water Lab Analytics
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">
            Активация лицензии
          </h1>
          <p className="mt-2 text-sm text-ink/65">
            Для запуска приложения активируйте лицензию онлайн или вставьте
            резервный license token, выданный вручную.
          </p>
        </div>

        <div className="mb-5 border border-ink/15 bg-[#f7f8fa] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">
                Отпечаток устройства
              </p>
              <p className="mt-1 break-all font-mono text-xs text-ink">
                {status.fingerprint}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={copyFingerprint}>
              {copied ? "Скопировано" : "Скопировать"}
            </Button>
          </div>
          {status.message && (
            <p className="mt-3 text-xs text-ink/60">{status.message}</p>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("online")}
            className={`h-9 border px-3 text-sm font-medium transition ${
              mode === "online"
                ? "border-ink bg-ink text-white"
                : "border-ink/25 bg-white text-ink/75 hover:border-ink/45"
            }`}
          >
            Онлайн
          </button>
          <button
            type="button"
            onClick={() => setMode("offline")}
            className={`h-9 border px-3 text-sm font-medium transition ${
              mode === "offline"
                ? "border-ink bg-ink text-white"
                : "border-ink/25 bg-white text-ink/75 hover:border-ink/45"
            }`}
          >
            Ручной token
          </button>
        </div>

        {mode === "online" ? (
          <form onSubmit={handleOnlineSubmit} className="space-y-4">
            <Input
              label="Лицензионный ключ"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              placeholder="WLA-XXXX-XXXX-XXXX"
            />
            <Button type="submit" className="w-full" disabled={!licenseKey.trim()}>
              Активировать онлайн
            </Button>
          </form>
        ) : (
          <form onSubmit={handleOfflineSubmit} className="space-y-4">
            <label className="flex w-full flex-col gap-1.5 text-sm font-medium text-ink/80">
              <span>License token</span>
              <textarea
                value={offlineToken}
                onChange={(event) => setOfflineToken(event.target.value)}
                rows={6}
                className="resize-none border border-ink/30 bg-white px-3 py-2 font-mono text-xs text-ink placeholder:text-ink/45 transition focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                placeholder="wla1..."
              />
            </label>
            <Button type="submit" className="w-full" disabled={!offlineToken.trim()}>
              Активировать вручную
            </Button>
          </form>
        )}

        {error && (
          <div className="mt-4 border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-ember">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => void onRefresh()}>
            Обновить статус
          </Button>
        </div>
      </div>
    </div>
  );
}
