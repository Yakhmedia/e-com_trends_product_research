"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Check, X, AlertTriangle, Trash2, Plug } from "lucide-react";
import Navbar from "@/components/Navbar";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  modelsForProvider,
  defaultModelFor,
  type Provider,
} from "@/lib/models";

type Status = "untested" | "valid" | "invalid" | "no_credits";

interface CredentialMeta {
  provider: Provider;
  key_hint: string;
  default_model: string | null;
  status: Status;
  last_verified_at: string | null;
  last_used_at: string | null;
  updated_at: string;
}

const STATUS_STYLE: Record<Status | "unset", { label: string; cls: string }> = {
  valid: { label: "Connected", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  no_credits: { label: "No credits", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  invalid: { label: "Invalid key", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  untested: { label: "Untested", cls: "bg-theme-elevated text-theme-muted border-theme-border" },
  unset: { label: "Not set", cls: "bg-theme-elevated text-theme-muted border-theme-border" },
};

export default function SettingsPage() {
  const [creds, setCreds] = useState<Record<string, CredentialMeta>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/credentials")
      .then((r) => r.json())
      .then((j: { credentials?: CredentialMeta[] }) => {
        const map: Record<string, CredentialMeta> = {};
        (j.credentials ?? []).forEach((c) => (map[c.provider] = c));
        setCreds(map);
      })
      .finally(() => setLoading(false));
  }, []);

  const upsert = (provider: Provider, patch: Partial<CredentialMeta> | null) => {
    setCreds((prev) => {
      const next = { ...prev };
      if (patch === null) delete next[provider];
      else next[provider] = { ...(next[provider] ?? emptyMeta(provider)), ...patch };
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-theme-text">Settings</h1>
          <p className="text-theme-muted text-sm mt-0.5">
            Bring your own API key for each provider. Keys are encrypted at rest and never shown
            again after saving — inference runs on your account.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {PROVIDERS.map((p) => (
              <div key={p} className="h-40 bg-theme-surface rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider}
                provider={provider}
                meta={creds[provider] ?? null}
                onChange={(patch) => upsert(provider, patch)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function emptyMeta(provider: Provider): CredentialMeta {
  return {
    provider,
    key_hint: "",
    default_model: null,
    status: "untested",
    last_verified_at: null,
    last_used_at: null,
    updated_at: new Date().toISOString(),
  };
}

function ProviderCard({
  provider,
  meta,
  onChange,
}: {
  provider: Provider;
  meta: CredentialMeta | null;
  onChange: (patch: Partial<CredentialMeta> | null) => void;
}) {
  const models = modelsForProvider(provider);
  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "remove" | "model">(null);
  const [error, setError] = useState<string | null>(null);

  const isSet = meta !== null && meta.key_hint !== "";
  const showInput = editing || !isSet;
  const statusKey = isSet ? meta!.status : "unset";
  const style = STATUS_STYLE[statusKey];
  const selectedModel = meta?.default_model ?? defaultModelFor(provider).id;

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: keyInput.trim(), defaultModel: selectedModel }),
      });
      const j = (await res.json()) as { status?: Status; key_hint?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not save the key");
      onChange({ key_hint: j.key_hint ?? "", status: j.status ?? "untested", default_model: selectedModel });
      setKeyInput("");
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    try {
      const res = await fetch(`/api/credentials/${provider}/test`, { method: "POST" });
      const j = (await res.json()) as { status?: Status; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Test failed");
      onChange({ status: j.status ?? "untested" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      const res = await fetch(`/api/credentials/${provider}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Could not remove the key");
      onChange(null);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the key");
    } finally {
      setBusy(null);
    }
  }

  async function changeModel(model: string) {
    onChange({ default_model: model });
    if (!isSet) return;
    setBusy("model");
    try {
      await fetch(`/api/credentials/${provider}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultModel: model }),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-theme-surface border border-theme-border rounded-2xl p-5 theme-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-theme-accent-soft flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-theme-accent" />
          </div>
          <span className="font-semibold text-theme-text">{PROVIDER_LABELS[provider]}</span>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border ${style.cls}`}>
          {statusKey === "valid" && <Check className="w-3 h-3 inline -mt-0.5 mr-1" />}
          {statusKey === "invalid" && <X className="w-3 h-3 inline -mt-0.5 mr-1" />}
          {statusKey === "no_credits" && <AlertTriangle className="w-3 h-3 inline -mt-0.5 mr-1" />}
          {style.label}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {isSet && !editing && (
          <div className="flex items-center gap-2 text-sm text-theme-muted">
            <code className="bg-theme-elevated px-2 py-1 rounded-md text-theme-text">{meta!.key_hint}</code>
            {meta!.last_used_at && (
              <span className="text-xs">last used {new Date(meta!.last_used_at).toLocaleDateString()}</span>
            )}
          </div>
        )}

        {showInput && (
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={`Paste your ${PROVIDER_LABELS[provider]} API key`}
              className="flex-1 bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
            />
            <button
              onClick={save}
              disabled={busy !== null || keyInput.trim().length < 10}
              className="px-4 py-2.5 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 text-white rounded-xl text-sm font-medium transition flex items-center gap-1.5 theme-btn"
            >
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Save
            </button>
            {editing && (
              <button
                onClick={() => { setEditing(false); setKeyInput(""); setError(null); }}
                className="px-3 py-2.5 text-theme-muted hover:text-theme-text text-sm transition"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-theme-muted">Default model</label>
          <select
            value={selectedModel}
            onChange={(e) => changeModel(e.target.value)}
            disabled={busy === "model"}
            className="bg-theme-elevated border border-theme-border text-theme-text rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — ${m.price.inputPerMTok}/${m.price.outputPerMTok} per 1M
              </option>
            ))}
          </select>
        </div>

        {isSet && !editing && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={test}
              disabled={busy !== null}
              className="text-xs px-3 py-1.5 border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-elevated transition flex items-center gap-1.5"
            >
              {busy === "test" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
              Test connection
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-elevated transition"
            >
              Replace
            </button>
            <button
              onClick={remove}
              disabled={busy !== null}
              className="text-xs px-3 py-1.5 border border-theme-border rounded-lg text-theme-muted hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition flex items-center gap-1.5"
            >
              {busy === "remove" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Remove
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </div>
  );
}
