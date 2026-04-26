"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { API_URL } from "@/lib/constants";

export function BackendStatusProvider({ children }: { children: React.ReactNode }) {
  const [isHealthy, setIsHealthy] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkHealth = async () => {
      try {
        let apiUrl = API_URL;
        // Remove trailing slash if present
        if (apiUrl.endsWith('/')) {
          apiUrl = apiUrl.slice(0, -1);
        }

        console.log(`[SwarmCourt] Checking backend health at: ${apiUrl}/health`);

        const res = await fetch(`${apiUrl}/health`, {
          method: "GET",
          // No headers to keep it a "simple request" and avoid preflight OPTIONS
        });

        if (res.ok) {
          const data = await res.json();
          console.log("[SwarmCourt] Backend is ONLINE:", data);
          setIsHealthy(true);
          setIsChecking(false);
          if (intervalId) clearInterval(intervalId);
        } else {
          console.warn(`[SwarmCourt] Backend health check returned status: ${res.status}`);
        }
      } catch (error) {
        console.error("[SwarmCourt] Health check failed. Backend might be sleeping or CORS is misconfigured.", error);
        setIsHealthy(false);
      }
    };

    // Initial check
    checkHealth();

    // Set up polling every 3 seconds if not healthy
    if (!isHealthy) {
      intervalId = setInterval(checkHealth, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isHealthy]);

  if (isHealthy) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm text-white p-6">

      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-maroon/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-primary/10 rounded-full blur-[60px] pointer-events-none" />

      <div className="glass-panel p-8 md:p-12 border-brass/20 bg-black/60 shadow-2xl max-w-md w-full text-center space-y-8 relative overflow-hidden">
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brass to-transparent" />

        <div className="flex justify-center mb-6">
          <div className="relative flex items-center justify-center w-16 h-16">
            <div className="absolute inset-0 border-2 border-t-brass border-r-primary border-b-brass border-l-primary rounded-full animate-[spin_3s_linear_infinite]" />
            <div className="absolute inset-2 border border-dashed border-white/30 rounded-full animate-[spin_4s_linear_infinite_reverse]" />
            <Loader2 className="w-6 h-6 text-brass animate-pulse" />
          </div>
        </div>

        <div className="space-y-4 relative z-10">
          <h2 className="text-2xl md:text-3xl font-black uppercase italic font-cinzel text-brass tracking-tight">
            Waking SwarmCourt...
          </h2>
          <p className="text-gray-400 font-serif text-xs md:text-sm leading-relaxed italic opacity-90">
            Our decentralized orchestration hub runs on a Render free tier instance, which spins down after 15 minutes of inactivity.
          </p>
        </div>

        <div className="bg-black/50 rounded p-4 border border-white/5 relative overflow-hidden">
          <div className="absolute left-0 top-0 w-1 h-full bg-primary/50 animate-pulse" />
          <p className="text-[10px] md:text-[11px] font-mono text-primary-dark uppercase tracking-widest animate-pulse">
            Establishing Connection...
          </p>
          <p className="text-[9px] font-mono text-gray-500 mt-2 tracking-widest">
            EXPECTED DELAY: 30-50 SECONDS
          </p>
        </div>
      </div>
    </div>
  );
}
