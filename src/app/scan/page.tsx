"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { prepareFile, prepareImage, type PreparedImage } from "@/lib/image-check";
import { stashResult } from "@/lib/profile";
import type { ScanResult } from "@/lib/types";
import { authHeaders } from "@/lib/supabase";

type Mode = "auto" | "meal" | "barcode" | "label";
const MODES: Mode[] = ["auto", "meal", "barcode", "label"];

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);

  const [mode, setMode] = useState<Mode>("auto");
  const [status, setStatus] = useState("Point at a meal, package, barcode, or label");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setWorking(on: boolean) {
    busyRef.current = on;
    setBusy(on);
  }

  async function handleBarcode(code: string) {
    setWorking(true);
    setStatus("Barcode detected");
    const res = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Couldn't find that product.");
      setWorking(false);
      return;
    }
    finish(data as ScanResult);
  }

  async function analyze(img: PreparedImage) {
    if (img.problem) {
      setStatus(img.problem);
      return;
    }
    setWorking(true);
    setStatus(mode === "label" ? "Reading label…" : "Analyzing…");
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image: img.base64, mediaType: img.mediaType, mode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Something went wrong.");
      setWorking(false);
      return;
    }
    const result = data as ScanResult;
    if (result.retakeReason) {
      setStatus(result.retakeReason);
      setWorking(false);
      return;
    }
    // Keep a small preview of the meal for the result screen (not saved anywhere else)
    finish({ ...result, imageUrl: `data:${img.mediaType};base64,${img.base64}` });
  }

  async function shutter() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || busy) return;
    analyze(await prepareImage(v, v.videoWidth, v.videoHeight));
  }

  async function pickFile(file: File | undefined) {
    if (!file || busy) return;
    analyze(await prepareFile(file));
  }

  function finish(result: ScanResult) {
    controlsRef.current?.stop();
    stashResult(result);
    router.push("/scan/result");
  }

  // Camera + live barcode reading (free, no AI call)
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!videoRef.current) return;
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" }, audio: false },
          videoRef.current,
          (result) => {
            if (!result || busyRef.current || cancelled) return;
            if (mode === "meal" || mode === "label") return;
            handleBarcode(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch {
        setCameraError("Camera not available. Use the gallery button to pick a photo.");
      }
    }
    start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <main className="flex h-dvh flex-col px-4 pb-6 pt-5">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="font-mono text-2xl text-text" aria-label="Back">
          ‹
        </button>
        <h1 className="font-display text-2xl font-bold text-heading">Scan anything.</h1>
        <span className="w-6" />
      </div>

      <div className="relative mt-5 flex-1 overflow-hidden rounded-3xl bg-card">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {cameraError && (
          <p className="absolute inset-0 flex items-center justify-center p-8 text-center font-body text-muted">
            {cameraError}
          </p>
        )}
        {/* corner brackets */}
        {["left-5 top-5 border-l-4 border-t-4", "right-5 top-5 border-r-4 border-t-4", "bottom-5 left-5 border-b-4 border-l-4", "bottom-5 right-5 border-b-4 border-r-4"].map((c) => (
          <span key={c} className={`absolute h-10 w-10 rounded-sm border-accent ${c}`} />
        ))}
        {!cameraError && <span className="scan-line absolute left-6 right-6 h-0.5 bg-accent shadow-[0_0_12px_var(--accent)]" />}
        <div className="glass absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-center font-mono text-xs text-text">
          {busy ? <span className="animate-pulse">{status}</span> : status}
        </div>
      </div>

      <div className="glass mx-auto mt-5 flex rounded-full p-1">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-2 font-mono text-xs capitalize ${mode === m ? "bg-accent font-bold text-on-accent" : "text-muted"}`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between px-6">
        <button
          onClick={() => fileRef.current?.click()}
          className="glass flex h-12 w-12 items-center justify-center rounded-2xl text-muted"
          aria-label="Pick from gallery"
        >
          ▦
        </button>
        <button
          onClick={shutter}
          disabled={busy || mode === "barcode"}
          aria-label="Take photo"
          className="h-20 w-20 rounded-full border-4 border-accent bg-heading disabled:opacity-40"
        />
        <span className="w-12" />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      </div>
    </main>
  );
}
