"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface MotifProps {
  type: "archive" | "agents" | "leaderboard" | "lawroom" | "traction";
  className?: string;
}

export default function Motif({ type, className = "" }: MotifProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!containerRef.current) return;

    // ─── INITIAL REVEAL & LOOP ANIMATIONS ───
    switch (type) {
      case "archive":
        gsap.from(".parchment-sheet", {
          opacity: 0,
          y: 50,
          stagger: 0.2,
          duration: 1.5,
          ease: "power3.out",
        });
        break;

      case "agents":
        gsap.from(".agent-cluster", {
          scale: 0.5,
          opacity: 0,
          duration: 1.5,
          ease: "power3.out",
        });
        gsap.to(".agent-cluster", {
          y: "-=15",
          rotation: "+=2",
          duration: 4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut"
        });
        break;

      case "leaderboard":
        gsap.set(".wreath-path", { strokeDasharray: 2000, strokeDashoffset: 2000 });
        gsap.to(".wreath-path", {
          strokeDashoffset: 0,
          duration: 3,
          ease: "power2.inOut",
          delay: 0.5,
        });
        gsap.from(".leader-bar", {
          scaleY: 0,
          transformOrigin: "bottom",
          stagger: 0.2,
          duration: 1.2,
          ease: "power4.out",
          delay: 1,
        });
        break;

      case "lawroom":
        gsap.set(".arch-path", { strokeDasharray: 2000, strokeDashoffset: 2000 });
        gsap.to(".arch-path", {
          strokeDashoffset: 0,
          duration: 2.5,
          ease: "power2.out",
        });
        gsap.from(".scales-body", {
          opacity: 0,
          y: 20,
          duration: 1,
          delay: 0.5,
        });

        gsap.to(".scales-beam", {
          rotation: 3,
          svgOrigin: "100 74",
          repeat: -1,
          yoyo: true,
          duration: 5,
          ease: "sine.inOut",
        });
        break;

      case "traction":
        gsap.from(".seal-main", {
          scale: 0.8,
          opacity: 0,
          duration: 1.2,
          ease: "elastic.out(1, 0.5)",
        });
        break;
    }

    // ─── UNIQUE POINTER BEHAVIORS ───
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const { clientX, clientY } = e;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const mouseX = (clientX - centerX) / (rect.width / 2);
      const mouseY = (clientY - centerY) / (rect.height / 2);

      switch (type) {
        case "archive":
          gsap.to(".parchment-sheet", {
            rotationX: mouseY * 15,
            rotationY: mouseX * 15,
            x: mouseX * 5,
            y: mouseY * 5,
            duration: 0.8,
            overwrite: "auto"
          });
          break;

        case "agents":
          gsap.to(".agent-cluster", {
            x: mouseX * 50,
            y: mouseY * 50,
            rotation: mouseX * 5,
            duration: 1.0,
            overwrite: "auto"
          });
          break;

        case "leaderboard":
          const localX = clientX - rect.left;
          const localY = clientY - rect.top;
          gsap.to(".spotlight", {
            cx: (localX / rect.width) * 200,
            cy: (localY / rect.height) * 200,
            duration: 0.4,
            overwrite: "auto"
          });
          break;

        case "lawroom":
          gsap.to(".scales-beam", {
            rotation: (mouseX * 12) + 2,
            duration: 2.0,
            overwrite: "auto",
            svgOrigin: "103 79"
          });
          break;

        case "traction":
          gsap.to(".seal-main", {
            x: mouseX * 25,
            y: mouseY * 25,
            scale: 1 + Math.abs(mouseX) * 0.08,
            duration: 1.2,
            overwrite: "auto"
          });
          break;
      }
    };

    const handleMouseLeave = () => {
      gsap.to(".parchment-sheet, .agent-cluster, .scales-beam, .seal-main", {
        x: 0,
        y: 0,
        rotation: 0,
        rotationX: 0,
        rotationY: 0,
        scale: 1,
        duration: 2.5,
        ease: "power2.out",
      });
      if (type === "leaderboard") {
        gsap.to(".spotlight", { opacity: 0, duration: 0.8 });
      }
    };

    const handleMouseEnter = () => {
      if (type === "leaderboard") {
        gsap.to(".spotlight", { opacity: 0.5, duration: 0.5 });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    containerRef.current.addEventListener("mouseleave", handleMouseLeave);
    containerRef.current.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, { scope: containerRef });

  const renderMotif = () => {
    switch (type) {
      case "archive":
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full fill-none" style={{ perspective: "1200px", transformStyle: "preserve-3d" }}>
            <rect className="parchment-sheet fill-parchment/10 stroke-brass/30 stroke-1" x="40" y="40" width="120" height="150" rx="4" />
            <rect className="parchment-sheet fill-parchment/10 stroke-brass/30 stroke-1" x="50" y="30" width="120" height="150" rx="4" />
            <rect className="parchment-sheet fill-parchment/20 stroke-brass/50 stroke-1" x="60" y="20" width="120" height="150" rx="4" />
            <g className="ledger-lines stroke-brass/20">
              <path d="M75 50h90M75 70h90M75 90h90M75 110h90M75 130h90" />
            </g>
          </svg>
        );

      case "agents":
        return (
          <svg viewBox="0 0 400 400" className="w-full h-full fill-none">
            <defs>
              {/* Refined Judicial-Technological Gradients */}
              <radialGradient id="nodeGlowBrass" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#B08D57" />
                <stop offset="60%" stopColor="#8C6A43" />
                <stop offset="100%" stopColor="#1E1E1E" />
              </radialGradient>
              <radialGradient id="nodeGlowMist" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#A7B8C2" />
                <stop offset="60%" stopColor="#4C7A7B" />
                <stop offset="100%" stopColor="#1E1E1E" />
              </radialGradient>
              <filter id="svgGlow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <g className="agent-cluster">
              {/* Connections use a more subtle graphite/brass mix */}
              <line x1="200" y1="200" x2="100" y2="100" className="stroke-brass/10 stroke-2" />
              <line x1="200" y1="200" x2="300" y2="100" className="stroke-brass/10 stroke-2" />
              <line x1="200" y1="200" x2="100" y2="300" className="stroke-brass/10 stroke-2" />
              <line x1="200" y1="200" x2="300" y2="300" className="stroke-brass/10 stroke-2" />

              {/* Mist Blue Central Node for a more sophisticated technological feel */}
              <circle cx="200" cy="200" r="22" fill="url(#nodeGlowMist)" filter="url(#svgGlow)" />

              {/* Brass Satellites for judicial grounding */}
              <circle cx="100" cy="100" r="14" fill="url(#nodeGlowBrass)" className="opacity-70" />
              <circle cx="300" cy="100" r="14" fill="url(#nodeGlowBrass)" className="opacity-70" />
              <circle cx="100" cy="300" r="14" fill="url(#nodeGlowBrass)" className="opacity-70" />
              <circle cx="300" cy="300" r="14" fill="url(#nodeGlowBrass)" className="opacity-70" />
            </g>
          </svg>
        );

      case "leaderboard":
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full fill-none">
            <defs>
              <radialGradient id="brassGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--color-brass)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--color-brass)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle className="spotlight pointer-events-none" r="50" fill="url(#brassGlow)" opacity="0" />
            <g className="wreath-container">
              <path className="wreath-path stroke-brass/40 stroke-[2.5]" d="M70 150c-30-10-45-45-45-80 0-40 25-65 45-65M130 150c30-10 45-45 45-80 0-40-25-65-45-65" />
            </g>
            <rect className="leader-bar fill-ivory/30" x="75" y="100" width="12" height="50" />
            <rect className="leader-bar fill-ivory/40" x="93" y="85" width="12" height="65" />
            <rect className="leader-bar fill-brass/70" x="111" y="65" width="12" height="85" />
          </svg>
        );

      case "lawroom":
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full fill-none">
            <path className="arch-path stroke-brass/40 stroke-[3]" d="M40 160V60c0-30 25-55 60-55s60 25 60 55v100" />
            <g className="scales-body">
              <path className="stroke-brass/70 stroke-[3]" d="M103 40v100" />
              <g className="scales-beam">
                <path className="stroke-brass/90 stroke-2" d="M53 74h100" />
                <path className="stroke-brass/50 stroke-1" d="M53 74l-20 45M53 74l20 45" />
                <polygon className="fill-brass/20 stroke-brass/40 stroke-1" points="23,119 83,119 53,149" />
                <path className="stroke-brass/50 stroke-1" d="M153 74l-20 45M153 74l20 45" />
                <polygon className="fill-brass/20 stroke-brass/40 stroke-1" points="123,119 183,119 153,149" />
              </g>
              <circle cx="103" cy="74" r="4.5" fill="var(--color-brass)" className="opacity-90" />
            </g>
          </svg>
        );

      case "traction":
        return (
          <div className="w-full h-full flex items-center justify-center relative">
            <img
              src="/traction.png"
              alt="Verdict Sealed"
              className="seal-main w-full h-full object-contain opacity-60"
              style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))" }}
            />
            <div className="absolute bottom-[-15%] left-1/2 -translate-x-1/2 w-full text-center">
              <span className="verdict-text text-brass font-black font-mono text-[14px] uppercase tracking-[0.5em] opacity-80">Verdict Sealed</span>
            </div>
          </div>
        );
    }
  };

  return (
    <div ref={containerRef} className={`motif-container ${className} relative overflow-visible`}>
      {renderMotif()}
    </div>
  );
}
