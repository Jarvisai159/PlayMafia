"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-blood-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center max-w-lg"
      >
        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight mb-3">
          <span className="text-blood-500">Play</span>
          <span className="text-white">Mafia</span>
        </h1>

        <p className="text-white/50 text-lg mb-12">
          The party game, elevated.
        </p>

        <div className="flex flex-col gap-4">
          <Link href="/host">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 px-8 bg-blood-500 hover:bg-blood-600 text-white text-lg font-semibold rounded-2xl transition-colors"
            >
              Host a Game
            </motion.button>
          </Link>

          <Link href="/play">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 px-8 bg-white/10 hover:bg-white/15 text-white text-lg font-semibold rounded-2xl transition-colors border border-white/10"
            >
              Join a Game
            </motion.button>
          </Link>
        </div>

        <p className="text-white/20 text-sm mt-12">
          One device hosts. Everyone else joins from their phone.
        </p>
      </motion.div>
    </main>
  );
}
