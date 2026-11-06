"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * QR scanning via the native BarcodeDetector API -- no dependency, and supported where
 * this demo actually runs (Chrome on Android, desktop Chrome). Unsupported browsers get
 * `supported: false` so the UI can fall back to pasting the code.
 */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return candidate ?? null;
}

export function useQrScanner(onScan: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    setSupported(detectorCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    const Ctor = detectorCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const detector = new Ctor({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          if (found.length > 0 && found[0].rawValue) {
            onScanRef.current(found[0].rawValue);
            stop();
            return;
          }
        } catch {
          // A transient decode failure is normal between frames; keep going.
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch {
      setError("Camera unavailable. Paste the code instead.");
      setScanning(false);
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, scanning, error, supported, start, stop };
}
