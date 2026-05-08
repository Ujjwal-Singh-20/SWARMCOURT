"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function GlobalBackground() {
  const bgRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mainTrigger = {
      trigger: "body",
      start: "top top",
      end: "bottom bottom",
      scrub: true,
    };

    const RATIOS = {
      bg: 0.05,
      paper1: 0.1,
      paper2: 0.15,
      ledger: 0.25,
    };

    gsap.to(".parallax-bg", { yPercent: 15 * RATIOS.bg * 10, ease: "none", scrollTrigger: mainTrigger });
    gsap.to(".paper-layer-1", { yPercent: 10 * RATIOS.paper1 * 5, ease: "none", scrollTrigger: mainTrigger });
    gsap.to(".paper-layer-2", { yPercent: -15 * RATIOS.paper2 * 4, ease: "none", scrollTrigger: mainTrigger });
    gsap.to(".parallax-mid", { yPercent: 20 * RATIOS.ledger * 2, ease: "none", scrollTrigger: mainTrigger });
  }, []);

  return (
    <div ref={bgRef} className="global-bg-container fixed inset-0 pointer-events-none z-[-1]">
      {/* Base Background */}
      <div className="parallax-bg fixed inset-0" />
      
      {/* Stacked Paper Layers */}
      <div className="paper-layer paper-layer-1 bg-parchment opacity-[0.05] fixed inset-0" />
      <div className="paper-layer paper-layer-2 bg-marble opacity-[0.03] fixed inset-0" />
      
      {/* Ledger Lines */}
      <div className="parallax-mid fixed inset-0" />

      {/* Imperfections */}
      <div className="noise-overlay" />
      <div className="vignette-overlay" />
    </div>
  );
}
