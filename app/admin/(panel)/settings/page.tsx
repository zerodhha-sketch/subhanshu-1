"use client";

import { useCallback, useEffect, useState } from "react";
import { adminJson } from "@/components/admin/adminFetch";

type Meta = {
  upiId: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
};

export default function AdminSettingsPage() {
  const [qrUrl, setQrUrl] = useState("");
  const [meta, setMeta] = useState<Meta>({
    upiId: "",
    bankName: "",
    accountHolder: "",
    accountNumber: "",
    ifsc: "",
  });
  const [hasImage, setHasImage] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await adminJson<{ qrUrl?: string | null; paymentMeta?: Partial<Meta> | null }>(
        "/api/admin/qr",
      );
      setQrUrl(data.qrUrl || "");
      const pm = data.paymentMeta;
      setMeta({
        upiId: pm?.upiId || "",
        bankName: pm?.bankName || "",
        accountHolder: pm?.accountHolder || "",
        accountNumber: pm?.accountNumber || "",
        ifsc: pm?.ifsc || "",
      });
      const imgRes = await fetch("/api/admin/qr-image", { credentials: "include" });
      const imgData = await imgRes.json();
      setHasImage(!!imgData?.hasImage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMeta() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await adminJson("/api/admin/qr", {
        method: "POST",
        body: JSON.stringify({ qrUrl: qrUrl || null, paymentMeta: meta }),
      });
      setMsg("Payment details saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage() {
    if (!file) return;
    setSaving(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/qr-image", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setMsg("QR image uploaded.");
      setFile(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteImage() {
    setSaving(true);
    try {
      await adminJson("/api/admin/qr-image", { method: "DELETE" });
      setMsg("QR image removed.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-semibold text-slate-900">QR &amp; payments</h2>
      <p className="mt-1 text-sm text-slate-600">
        UPI / bank details shown to users on the funds screen. You can upload a QR image or set a
        public URL.
      </p>
      {msg ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {err ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-900">{err}</p>
      ) : null}

      <section className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-medium text-slate-900">QR image</h3>
        <p className="text-xs text-slate-500">
          Status: {hasImage ? "Image stored in database" : "No image — using URL below if set"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
          <button
            type="button"
            disabled={!file || saving}
            onClick={() => void uploadImage()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Upload
          </button>
          <button
            type="button"
            disabled={!hasImage || saving}
            onClick={() => void deleteImage()}
            className="rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-700"
          >
            Delete image
          </button>
        </div>
      </section>

      <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-medium text-slate-900">QR URL (fallback)</h3>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="https://…"
          value={qrUrl}
          onChange={(e) => setQrUrl(e.target.value)}
        />
      </section>

      <section className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <h3 className="font-medium text-slate-900 sm:col-span-2">Bank / UPI meta</h3>
        {(
          [
            ["upiId", "UPI ID"],
            ["bankName", "Bank name"],
            ["accountHolder", "Account holder"],
            ["accountNumber", "Account number"],
            ["ifsc", "IFSC"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="text-xs font-medium text-slate-500">{label}</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={meta[key]}
              onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))}
            />
          </label>
        ))}
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => void saveMeta()}
        className="mt-6 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save payment settings"}
      </button>
    </div>
  );
}
