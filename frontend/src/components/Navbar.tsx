"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export default function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { publicKey } = useWallet();

  const navItems = [
    { name: "Archive", href: "/history" },
    { name: "Agents", href: "/agents" },
    { name: "Leaderboard", href: "/leaderboard" },
    { name: "Lawroom", href: "/case" },
    { name: "Traction", href: "/dashboard" },
  ];

  return (
    <nav className="glass-panel sticky top-0 z-50 flex items-center justify-between px-3 md:px-8 py-3.5 mx-2 md:mx-6 mt-3 md:mt-6 rounded-xl md:rounded-3xl border-brass/20 bg-black/85 backdrop-blur-3xl transition-all duration-300">
      <div className="flex items-center gap-2 md:gap-6 lg:gap-12 min-w-0">
        {/* Hamburger Toggle (Mobile Only) */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="sm:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 group active:scale-90 transition-transform shrink-0"
        >
          <span className={`w-5 h-0.5 bg-brass transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`w-5 h-0.5 bg-brass transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`} />
          <span className={`w-5 h-0.5 bg-brass transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>

        <Link href="/" className="flex items-center gap-2 md:gap-2.5 group shrink-0">
          <div className="w-6 h-6 md:w-9 md:h-9 bg-maroon border border-brass flex items-center justify-center rotate-45 shadow-[0_0_12px_rgba(197,160,89,0.3)] transition-all group-hover:rotate-0 group-hover:border-primary group-hover:shadow-primary/50">
            <span className="text-brass -rotate-45 group-hover:rotate-0 transition-all font-bold text-[10px] md:text-base">S</span>
          </div>
          <span className="text-lg md:text-2xl font-black tracking-tighter serif-font uppercase italic text-white group-hover:text-brass transition-colors truncate">
            Swarm<span className="text-brass">Court</span>
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden sm:flex items-center gap-4 lg:gap-10 shrink">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[10px] md:text-[11px] font-bold uppercase tracking-[0.1em] lg:tracking-[0.4em] transition-all duration-300 relative group/link whitespace-nowrap ${isActive ? "text-primary" : "text-brass hover:text-white"
                  }`}
              >
                {item.name}
                <span className={`absolute -bottom-1.5 left-0 h-[1px] bg-gradient-to-r from-transparent via-brass to-transparent transition-all duration-500 ${isActive ? "w-full opacity-100" : "w-0 opacity-0 group-hover/link:w-full group-hover/link:opacity-50"
                  }`} />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-8 shrink-0">
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary/50">Network: Devnet</span>
        </div>

        <div className="flex items-center">
          <WalletMultiButton className="!bg-maroon/80 !border !border-brass/40 !text-brass !font-serif !text-[10px] md:!text-sm !font-bold !rounded-xl hover:!border-primary hover:!text-primary transition-all duration-300 !px-3 md:!px-6 !h-9 md:!h-12 !whitespace-nowrap" />
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      <div className={`absolute top-full left-0 w-full mt-2 px-2 transition-all duration-500 z-40 sm:hidden ${isMenuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}>
        <div className="glass-panel p-6 bg-black/95 backdrop-blur-3xl border-brass/20 space-y-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={`block text-[11px] font-bold uppercase tracking-[0.4em] py-3 border-b border-white/5 transition-all ${isActive ? "text-primary pl-4" : "text-brass hover:text-white"
                  }`}
              >
                {item.name}
              </Link>
            );
          })}
          <div className="flex items-center gap-2 pt-2 opacity-40">
            <div className="w-1 h-1 rounded-full bg-primary" />
            <span className="text-[8px] font-mono uppercase">Network: Devnet</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
