"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getProgram } from "@/lib/program";
import { API_URL } from "@/lib/constants";

gsap.registerPlugin(ScrollTrigger);

/* ───── Parallax Ratios ───── */
const RATIOS = {
  bg: 0.1,      // Deep Background
  paper1: 0.15, // Parchment Layer 1
  paper2: 0.25, // Parchment Layer 2
  arch: 0.05,   // Large Silhouettes
  mid: 0.4,     // Ledger Lines
  fg: 1.0,      // Foregrounds
};

/* ───── Foreground Glyphs (Embossed) ───── */
const GLYPHS = [
  { char: "⚖", x: 10, y: 20, size: 6, speed: 1.2 },
  { char: "⬡", x: 85, y: 15, size: 4, speed: 0.8 },
  { char: "◈", x: 75, y: 65, size: 3, speed: 1.5 },
  { char: "◉", x: 15, y: 75, size: 2.5, speed: 1.1 },
  { char: "⚖", x: 50, y: 45, size: 5, speed: 0.9 },
  { char: "◈", x: 90, y: 85, size: 3.5, speed: 1.3 },
];

/* ───── Agent Swarm Data ───── */
const SWARM_AGENTS = Array.from({ length: 24 }).map((_, i) => ({
  id: i,
  x: Math.random() * 80 + 10,
  y: Math.random() * 80 + 10,
  r: Math.random() * 6 + 4,
  turq: Math.random() > 0.6,
  label: Math.random() > 0.8 ? `NODE_0x${Math.floor(Math.random() * 1000).toString(16)}` : null,
}));

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const sphereContainerRef = useRef<HTMLDivElement>(null);
  const { connection } = useConnection();

  const [activeNodes, setActiveNodes] = useState<number>(3);
  const [totalCases, setTotalCases] = useState<number>(12);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Use Read-Only Provider for Landing Page Metrics
        const provider = new AnchorProvider(connection, {} as any, { commitment: "confirmed" });
        const program = getProgram(provider);

        const [agentRes, allCases] = await Promise.all([
          fetch(`${API_URL}/agents/status/active?t=${Date.now()}`),
          program.account.case.all()
        ]);

        if (agentRes.ok) {
          const data = await agentRes.json();
          setActiveNodes(data.count || 24);
        }
        setTotalCases(allCases.length || 12);
      } catch (err) {
        console.error("Failed to fetch on-chain metrics", err);
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // 1min poll
    return () => clearInterval(interval);
  }, [connection]);

  useGSAP(() => {
    const mainTrigger = {
      trigger: containerRef.current,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
    };

    // 1. Page-Specific Silhouettes
    gsap.to(".arch-silhouette", { yPercent: 5 * RATIOS.arch * 20, ease: "none", scrollTrigger: mainTrigger });

    // 3. Foreground Parallax (Glyphs)
    gsap.utils.toArray<HTMLElement>(".floating-glyph").forEach((glyph) => {
      const speed = parseFloat(glyph.dataset.speed || "1");
      gsap.to(glyph, {
        y: -600 * speed * RATIOS.fg,
        ease: "none",
        scrollTrigger: mainTrigger,
      });
    });

    // 4. SVG Motif Sketching (Stroke Draw)
    gsap.utils.toArray<SVGPathElement>(".sketch-path").forEach((path) => {
      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });

      gsap.to(path, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: path,
          start: "top 90%",
          end: "top 20%",
          scrub: 1.5,
        }
      });
    });

    // 5. Section Transitions (Fast Reveal)
    gsap.utils.toArray<HTMLElement>(".section-reveal").forEach((section) => {
      gsap.from(section, {
        y: 20,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        scrollTrigger: {
          trigger: section,
          start: "top 98%",
          toggleActions: "play none none reverse",
        },
      });
    });

    // 6. Verdict Seal Interaction
    if (sealRef.current) {
      gsap.timeline({
        scrollTrigger: {
          trigger: sealRef.current,
          start: "top 80%",
          end: "center 40%",
          scrub: 1,
        }
      })
        .to(sealRef.current, {
          scale: 0.94,
          boxShadow: "0 5px 15px rgba(0,0,0,0.8), inset 0 8px 25px rgba(0,0,0,0.9)",
          filter: "brightness(0.85)",
        });
    }

    // 7. Swarm Clustering
    if (sphereContainerRef.current) {
      const agents = gsap.utils.toArray<HTMLElement>(".agent-node");
      const labels = gsap.utils.toArray<HTMLElement>(".agent-label");
      const lines = gsap.utils.toArray<SVGLineElement>(".agent-line");

      gsap.to(agents, {
        x: (i) => (50 - SWARM_AGENTS[i].x) * 4,
        y: (i) => (50 - SWARM_AGENTS[i].y) * 4,
        opacity: 1,
        stagger: { amount: 0.6, from: "center" },
        scrollTrigger: {
          trigger: sphereContainerRef.current,
          start: "top 80%",
          end: "bottom 20%",
          scrub: 1.5,
        }
      });

      gsap.to(labels, {
        opacity: 0.6,
        y: -10,
        scrollTrigger: {
          trigger: sphereContainerRef.current,
          start: "center 60%",
          end: "bottom 20%",
          scrub: true,
        }
      });

      gsap.to(lines, {
        strokeDashoffset: 0,
        opacity: 0.15,
        scrollTrigger: {
          trigger: sphereContainerRef.current,
          start: "center 70%",
          end: "bottom 30%",
          scrub: 2,
        }
      });
    }

  }, { scope: containerRef });

  return (
    <div ref={containerRef} className="parallax-home relative min-h-screen">

      {/* ═══ ARCHITECTURAL SILHOUETTES (Page Specific) ═══ */}
      <svg className="arch-silhouette fixed inset-0 w-full h-[150%] opacity-[0.03] pointer-events-none z-0" viewBox="0 0 1000 1500" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,1500 V500 Q200,200 500,200 Q800,200 1100,500 V1500" fill="none" stroke="var(--color-bronze)" strokeWidth="40" />
        <path d="M0,1500 V700 Q250,450 500,450 Q750,450 1000,700 V1500" fill="none" stroke="var(--color-bronze)" strokeWidth="20" />
        <rect x="150" y="800" width="100" height="700" fill="none" stroke="var(--color-bronze)" strokeWidth="15" />
        <rect x="750" y="800" width="100" height="700" fill="none" stroke="var(--color-bronze)" strokeWidth="15" />
      </svg>

      <div className="parallax-mid" />

      {/* ═══ MOTIFS: SKETCHED SVGS ═══ */}
      {/* Left Column Motif */}
      <svg className="fixed left-[3%] top-[10vh] w-32 h-[80vh] opacity-[0.06] pointer-events-none z-0" viewBox="0 0 100 500">
        <path className="sketch-path" d="M10 500 V50 M0 50 H20 M5 40 H15 M0 30 H20 M10 0 V30" fill="none" stroke="var(--color-brass)" strokeWidth="1" />
        <path className="sketch-path" d="M30 500 V100 M20 100 H40 M25 90 H35 M20 80 H40 M30 50 V80" fill="none" stroke="var(--color-brass)" strokeWidth="1" />
        <path className="sketch-path" d="M50 500 V150 M40 150 H60 M45 140 H55 M40 130 H60 M50 100 V130" fill="none" stroke="var(--color-brass)" strokeWidth="1" />
      </svg>

      {/* Right Scales Motif */}
      <svg className="fixed right-[5%] top-[25vh] w-48 h-48 opacity-[0.07] pointer-events-none z-0" viewBox="0 0 200 200">
        <path className="sketch-path" d="M100 20 V180 M60 180 H140 M100 40 L40 70 M100 40 L160 70 M40 70 L40 130 M160 70 L160 130 M20 130 Q40 160 60 130 M140 130 Q160 160 180 130" fill="none" stroke="var(--color-bronze)" strokeWidth="1.5" />
      </svg>

      {/* Mid-Left Gavel Motif */}
      <svg className="fixed left-[8%] top-[60vh] w-32 h-32 opacity-[0.05] pointer-events-none z-0" viewBox="0 0 100 100">
        <path className="sketch-path" d="M20 70 L50 40 L60 50 L30 80 Z M50 40 L70 20 L80 30 L60 50 M10 90 L40 60" fill="none" stroke="var(--color-brass)" strokeWidth="1.5" />
      </svg>

      {/* Right Network Motif */}
      <svg className="fixed right-[4%] top-[75vh] w-40 h-40 opacity-[0.05] pointer-events-none z-0" viewBox="0 0 100 100">
        <path className="sketch-path" d="M50 10 L90 30 V70 L50 90 L10 70 V30 Z M50 10 V90 M10 30 L90 70 M10 70 L90 30" fill="none" stroke="var(--color-teal-muted)" strokeWidth="1" />
        <circle className="sketch-path" cx="50" cy="50" r="15" fill="none" stroke="var(--color-teal-muted)" strokeWidth="1" />
      </svg>

      {/* ═══ FOREGROUND: GLYPHS ═══ */}
      {GLYPHS.map((g, i) => (
        <div
          key={i}
          className="floating-glyph fixed opacity-[0.1] text-[var(--color-brass)] embossed"
          data-speed={g.speed}
          style={{
            left: `${g.x}%`,
            top: `${g.y}vh`,
            fontSize: `${g.size}rem`,
          }}
        >
          {g.char}
        </div>
      ))}

      {/* ════ SECTION: HERO ════ */}
      <section className="relative z-10 flex flex-col items-center justify-center h-screen text-center px-4 pb-80">
        <div className="section-reveal mb-6">
          <div className="w-px h-16 bg-gradient-to-b from-transparent to-[var(--color-brass)] mx-auto mb-4" />
          <div className="w-4 h-4 bg-[var(--color-brass)] rotate-45 shadow-[0_0_20px_rgba(176,141,87,0.3)] mx-auto" />
        </div>

        <h1 className="section-reveal text-6xl md:text-9xl font-black uppercase italic tracking-tighter serif-font leading-tight embossed">
          <span className="text-[var(--color-ivory)]">Swarm</span>
          <span className="text-[var(--color-brass)]">Court</span>
        </h1>

        <p className="section-reveal mt-8 text-[10px] md:text-sm font-mono uppercase tracking-[0.5em] text-[var(--color-ivory)] debossed">
          Truth is a Verdict. SwarmCourt is the Antidote.
        </p>

        <div className="section-reveal absolute bottom-16 flex flex-col items-center gap-4 opacity-40">
          <span className="text-[8px] font-mono uppercase tracking-[0.5em]">Initiate Sequence</span>
          <div className="w-px h-12 bg-gradient-to-b from-[var(--color-brass)] to-transparent animate-pulse" />
        </div>
      </section>

      {/* ════ SECTION: CTAS ════ */}
      <section className="relative z-10 py-32 px-4 max-w-7xl mx-auto space-y-32">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="section-reveal card-judicial p-10 md:p-14 border-l-4 border-l-[var(--color-bronze)]">
            <h2 className="text-4xl font-black uppercase italic serif-font text-[var(--color-bronze)] mb-4 tracking-tight">Summon the Swarm</h2>
            <p className="text-sm font-serif italic text-ivory/80 mb-8 leading-relaxed">
              Submit your dispute to the adversarial swarm. Specialized LLMs cross-examine evidence to reach a deterministic on-chain settlement.
            </p>
            <Link href="/case" className="wax-seal-button inline-block text-sm">
              Commence Protocol
            </Link>
          </div>
          <div className="section-reveal space-y-8 pl-8 hidden md:block">
            <div className="h-px w-full bg-bronze/10" />
            <div className="flex gap-10">
              <div className="text-3xl text-bronze/60 serif-font">01</div>
              <p className="text-xs font-mono uppercase tracking-widest text-off-white/70 pt-2">Evidence Submission</p>
            </div>
            <div className="flex gap-10">
              <div className="text-3xl text-bronze/60 serif-font">02</div>
              <p className="text-xs font-mono uppercase tracking-widest text-off-white/70 pt-2">Adversarial Debate</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="section-reveal space-y-8 pr-8 hidden md:block text-right order-last md:order-first">
            <div className="h-px w-full bg-teal-muted/10" />
            <div className="flex gap-16 text-[12px] font-mono uppercase tracking-[0.4em] text-ivory/50 justify-end">
              <div className="flex items-center gap-3">
                <span className="text-brass font-black">{activeNodes}</span> NODES ONLINE
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-3">
                <span className="text-brass font-black">{totalCases}</span> CASES INITIATED
              </div>
            </div>
          </div>
          <div className="section-reveal card-technological p-10 md:p-14 border-r-4 border-r-[var(--color-teal-muted)] order-first md:order-last">
            <h2 className="text-4xl font-black uppercase italic mono-font text-[var(--color-teal-muted)] mb-4 text-right tracking-tight">Join the Jury</h2>
            <p className="text-[10px] font-mono uppercase text-[var(--color-teal-muted)] opacity-70 tracking-[0.4em] text-right mb-4">Protocol Validator</p>
            <p className="text-sm font-mono text-mist-blue/80 mb-8 leading-relaxed text-right uppercase">
              Lend your judgment to the network. Stake SOL and host an autonomous validator node to earn yield from accurate arbitration.
            </p>
            <div className="flex justify-end">
              <Link href="/agents" className="cyber-button inline-block text-sm">
                Deploy Agent Node
              </Link>
            </div>
          </div>
        </div>

      </section>

      {/* ════ SECTION: VERDICT SEAL ════ */}
      <section className="relative z-10 py-32 flex flex-col items-center">
        <div ref={sealRef} className="verdict-seal w-56 h-56 rounded-full shadow-2xl flex flex-col items-center justify-center cursor-default">
          <span className="text-6xl mb-3 filter drop-shadow-lg">⚖</span>
          <span className="text-[11px] font-serif uppercase tracking-[0.5em] text-[var(--color-brass)] opacity-80 embossed">Sealed</span>
        </div>
        <p className="section-reveal mt-16 text-center max-w-xl text-[var(--color-ivory)] opacity-50 font-serif italic text-sm md:text-base px-8 leading-relaxed">
          "The Swarm does not seek compromise, it seeks the immutable weight of adversarial truth."
        </p>
      </section>

      {/* ════ SECTION: SWARM ASSEMBLES (War Room Display) ════ */}
      <section ref={sphereContainerRef} className="relative z-10 py-48 overflow-hidden bg-black/20">
        <div className="absolute inset-0 bg-tactical-circles opacity-30" />

        <h2 className="section-reveal text-center text-4xl md:text-6xl font-black uppercase italic serif-font text-[var(--color-ivory)] mb-20 embossed">
          The <span className="text-[var(--color-teal-muted)]">Swarm</span> Assembles
        </h2>

        <div className="relative w-full max-w-4xl mx-auto h-[35rem] border border-white/5 rounded-3xl bg-black/40 backdrop-blur-sm overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {SWARM_AGENTS.map((a, i) => {
              if (i % 3 !== 0) return null;
              const next = SWARM_AGENTS[(i + 1) % SWARM_AGENTS.length];
              return (
                <line
                  key={`line-${i}`}
                  className="agent-line"
                  x1={`${a.x}%`} y1={`${a.y}%`}
                  x2={`${next.x}%`} y2={`${next.y}%`}
                  stroke="var(--color-bronze)"
                  strokeWidth="0.5"
                  strokeDasharray="1000"
                  strokeDashoffset="1000"
                  opacity="0"
                />
              );
            })}
          </svg>

          {SWARM_AGENTS.map((s) => (
            <div
              key={s.id}
              className={`agent-node absolute opacity-30 ${s.turq ? "turquoise" : ""}`}
              style={{
                width: `${s.r * 2}px`,
                height: `${s.r * 2}px`,
                left: `${s.x}%`,
                top: `${s.y}%`,
                transform: `translate(-50%, -50%)`,
                borderRadius: '50%',
                background: s.turq
                  ? 'radial-gradient(circle at 30% 30%, var(--color-teal-muted), var(--color-indigo-deep))'
                  : 'radial-gradient(circle at 30% 30%, var(--color-brass), var(--color-charcoal))',
                boxShadow: `0 0 15px ${s.turq ? 'rgba(76, 122, 123, 0.3)' : 'rgba(176, 141, 87, 0.3)'}`,
                zIndex: 20
              }}
            >
              {s.label && (
                <span className="agent-label absolute top-full left-1/2 -translate-x-1/2 mt-2 text-[8px] font-mono text-ivory/40 opacity-0 whitespace-nowrap">
                  {s.label}
                </span>
              )}
            </div>
          ))}

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-brass/5 rounded-full blur-3xl pointer-events-none" />
        </div>
      </section>

      {/* ════ SECTION: PROVOKING FINALE ════ */}
      <section className="relative z-10 py-48 px-4 text-center border-t border-white/5 bg-gradient-to-b from-black/0 to-charcoal/40">
        <div className="section-reveal space-y-14 max-w-4xl mx-auto">
          <div className="space-y-6">
            <h3 className="text-4xl md:text-6xl font-black uppercase italic serif-font text-ivory embossed leading-tight">The swarm is waiting for your case.</h3>
            <div className="flex justify-center gap-12 text-[11px] font-mono uppercase tracking-[0.5em] text-ivory/80">
              <div className="flex items-center gap-3 bg-black/60 px-6 py-2 border border-brass/20 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <span className="text-brass font-black text-sm">{activeNodes}</span> NODES ONLINE
              </div>
              <div className="flex items-center gap-3 bg-black/60 px-6 py-2 border border-brass/20 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <span className="text-brass font-black text-sm">{totalCases}</span> CASES INITIATED
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-10 justify-center items-center py-8">
            <Link href="/case" className="wax-seal-button min-w-[300px] text-xs py-5">START A CASE</Link>
            <span className="text-ivory/20 font-serif italic text-3xl debossed">or</span>
            <Link href="/agents" className="cyber-button min-w-[300px] text-xs py-5">RUN A NODE</Link>
          </div>

          <p className="text-[10px] font-mono uppercase tracking-[0.6em] text-ivory/40 pt-16 border-t border-white/10 max-w-2xl mx-auto">
            Deterministic Settlement • On-Chain Accountability • Adversarial Truth
          </p>
        </div>
      </section>
      <footer className="relative z-10 py-16 border-t border-white/5 bg-[var(--color-charcoal)]/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-12 mb-12">

          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-[var(--color-walnut)] border border-[var(--color-brass)] flex items-center justify-center rotate-45">
              <span className="text-[var(--color-brass)] -rotate-45 font-bold text-[10px]">S</span>
            </div>
            <span className="text-xl font-black serif-font uppercase italic text-[var(--color-ivory)]">
              Swarm<span className="text-[var(--color-brass)]">Court</span>
            </span>
          </div>

          <nav className="flex items-center gap-8">
            {['Lawroom', 'Agents', 'Dashboard'].map(link => (
              <Link key={link} href={`/${link.toLowerCase()}`} className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-ivory)]/40 hover:text-[var(--color-brass)] transition-all">
                {link}
              </Link>
            ))}
            <Link href="https://github.com/Ujjwal-Singh-20/SWARMCOURT" className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-ivory)]/40 hover:text-[var(--color-teal-muted)] transition-all">
              GitHub
            </Link>
          </nav>
        </div>


      </footer>

      {/* ═══ IMPERFECTIONS ═══ */}
      <div className="noise-overlay" />
      <div className="vignette-overlay" />
    </div>
  );
}
