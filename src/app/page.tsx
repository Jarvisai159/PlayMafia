"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Subtle red glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-accent-darkred/8 blur-[150px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center max-w-md w-full"
      >
        {/* Decorative line */}
        <div className="w-16 h-px bg-accent-red mx-auto mb-8" />

        <h1 className="text-5xl sm:text-6xl font-black tracking-tight uppercase mb-2">
          <span className="text-accent-red">Play</span>
          <span className="text-white">Mafia</span>
        </h1>

        <p className="text-muted-light text-sm uppercase tracking-[0.25em] mb-14">
          The Party Game
        </p>

        <div className="flex flex-col gap-3">
          <Link href="/host">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 px-8 bg-accent-red hover:bg-accent-crimson text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors"
            >
              Host a Game
            </motion.button>
          </Link>

          <Link href="/play">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 px-8 bg-bg-elevated hover:bg-bg-hover text-white/80 text-sm font-bold uppercase tracking-widest rounded-lg transition-colors border border-white/10"
            >
              Join a Game
            </motion.button>
          </Link>
        </div>

        <div className="w-16 h-px bg-white/10 mx-auto mt-14 mb-4" />
        <p className="text-muted text-xs uppercase tracking-widest">
          One device hosts &middot; Everyone plays
        </p>
      </motion.div>
    </main>
  );
}
