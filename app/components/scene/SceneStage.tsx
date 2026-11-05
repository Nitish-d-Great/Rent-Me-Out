"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { RoomGlyph } from "@/components/ui/room-glyph";
import { StatusStamp } from "@/components/ui/status-stamp";
import { TitleBlock } from "@/components/ui/title-block";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { demo, formatDate } from "@/lib/data";
import {
  createLoop,
  STEP_COUNT,
  timeForStep,
  TOTAL_DURATION,
} from "./timeline";

const FlatScene = dynamic(() => import("./FlatScene"), {
  ssr: false,
  loading: () => <div className="scene-loading" aria-hidden="true" />,
});

const phases = [
  {
    sheet: "Deed review",
    caption: "The registrar checks the deed.",
    proof: "Hedera registry · opaque property commitment",
  },
  {
    sheet: "Issue room tokens",
    caption: "Each room becomes one token.",
    proof: "One ERC-3643 token per room · supply 1",
  },
  {
    sheet: "Set period + price",
    caption: "The owner sets the period and price.",
    proof: "Jan – Mar 2027 · 850 / 980 / 820 USDC",
  },
  {
    sheet: "Verify broker",
    caption: "A real, unique person is verified. Nothing else is revealed.",
    proof: "World ID proof · backend validated · illustration",
  },
  {
    sheet: "Settle purchase",
    caption: "One payment, one token, one transaction.",
    proof: "980 USDC broker → owner · token owner → broker",
  },
  {
    sheet: "Check at the door",
    caption: "Anyone can check who holds the room.",
    proof: "Hedera holder read · fresh presence check",
  },
  {
    sheet: "Expire rights",
    caption: "At the end date, the right expires on its own.",
    proof: "isValid() false · scheduled burn · index expires",
  },
];

class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="scene-poster">
          <RoomGlyph index={1} state="held" />
          <span>3D scene unavailable. Showing a static plan.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SceneStage() {
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<ReturnType<typeof createLoop> | null>(null);
  const userPaused = useRef(false);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [offscreen, setOffscreen] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const tl = createLoop((nextPhase) => setPhase(nextPhase));
    timeline.current = tl;

    if (reduced) {
      userPaused.current = true;
      tl.pause(timeForStep(4));
      setPhase(4);
      setPlaying(false);
    } else {
      userPaused.current = false;
      tl.play(0);
      setPlaying(true);
    }

    const element = container.current;
    let observer: IntersectionObserver | undefined;

    if (element) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          if (!entry.isIntersecting) {
            setOffscreen(true);
            tl.pause();
            setPlaying(false);
          } else {
            setOffscreen(false);
            if (!userPaused.current && !reduced) {
              tl.play();
              setPlaying(true);
            }
          }
        },
        { threshold: 0.12 },
      );
      observer.observe(element);
    }

    return () => {
      observer?.disconnect();
      tl.kill();
      timeline.current = null;
    };
  }, [reduced]);

  const jumpTo = (index: number) => {
    const tl = timeline.current;
    if (!tl) return;
    userPaused.current = true;
    tl.pause();
    tl.time(timeForStep(index));
    setPhase(index);
    setPlaying(false);
  };

  const togglePlay = () => {
    const tl = timeline.current;
    if (!tl) return;
    if (playing) {
      userPaused.current = true;
      tl.pause();
      setPlaying(false);
    } else {
      userPaused.current = false;
      if (tl.time() >= TOTAL_DURATION - 0.6) tl.time(0);
      tl.play();
      setPlaying(true);
    }
  };

  const current = phases[phase];

  return (
    <div className="scene-frame" ref={container}>
      <span className="illustration-note">Illustration · demo data</span>

      <button
        type="button"
        className="scene-control"
        onClick={togglePlay}
        data-paused={!playing}
        aria-label={playing ? "Pause the animation" : "Play the animation"}
      >
        <span className="scene-control__dot" aria-hidden="true" />
        {playing ? "Playing" : "Paused"}
      </button>

      <SceneErrorBoundary>
        <FlatScene offscreen={offscreen} />
      </SceneErrorBoundary>

      <div className="scene-caption" aria-live="polite" aria-atomic="true">
        <div className="scene-caption__step">
          <span>Step {phase + 1} of 7</span>
          <span className="mono">0:{String(phase * 4).padStart(2, "0")}</span>
        </div>
        <p className="scene-caption__text">{current.caption}</p>
        <p className="scene-caption__proof">{current.proof}</p>
      </div>

      <div className="step-ticks" role="group" aria-label="Animation steps">
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <button
            key={index}
            type="button"
            className="step-tick"
            aria-label={`Show step ${index + 1}: ${phases[index].caption}`}
            aria-current={phase === index}
            onClick={() => jumpTo(index)}
          />
        ))}
      </div>

      <div
        className="scene-card"
        data-visible={phase === 5}
        aria-hidden={phase !== 5}
      >
        <div className="scene-card__top">
          <StatusStamp state="held" />
          <VerifyBadge label="Holder" />
        </div>
        <div className="scene-card__title">Room 2 · Balcony</div>
        <p className="scene-card__meta">
          Valid until {formatDate(demo.periodEnd)}
        </p>
        <div className="scene-card__hash">
          <span>holder wallet</span>
          <span className="mono">{demo.brokerShort}</span>
        </div>
        <div className="scene-card__hash" style={{ borderTop: "0" }}>
          <span>property</span>
          <span className="mono">root v{demo.rootVersion}</span>
        </div>
      </div>

      <TitleBlock phase={current.sheet} sheet={phase + 1} />
    </div>
  );
}
