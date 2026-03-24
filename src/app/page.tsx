"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function Home() {
  const [showRules, setShowRules] = useState(false);

  return (
    <main className="min-h-dvh relative overflow-hidden">
      {/* Subtle red glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-accent-darkred/8 blur-[150px] pointer-events-none" />

      <div className="min-h-dvh flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center max-w-md w-full"
        >
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

            <button
              onClick={() => setShowRules(true)}
              className="w-full py-4 px-8 text-muted-light hover:text-white text-sm font-bold uppercase tracking-widest transition-colors"
            >
              How to Play
            </button>
          </div>

          <div className="w-16 h-px bg-white/10 mx-auto mt-10 mb-4" />
          <p className="text-muted text-xs uppercase tracking-widest">
            One device hosts &middot; Everyone plays
          </p>
        </motion.div>
      </div>

      {/* ─── Rules Panel ─────────────────────────────── */}
      <AnimatePresence>
        {showRules && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-40"
              onClick={() => setShowRules(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-bg-primary border-l border-white/10 z-50 overflow-y-auto"
            >
              <div className="p-8">
                {/* Close */}
                <div className="flex items-center justify-between mb-10">
                  <h2 className="text-xl font-black uppercase tracking-wider">
                    How to Play
                  </h2>
                  <button
                    onClick={() => setShowRules(false)}
                    className="w-10 h-10 flex items-center justify-center bg-bg-elevated hover:bg-bg-hover rounded-lg text-muted-light hover:text-white transition-colors text-lg"
                  >
                    &times;
                  </button>
                </div>

                {/* Overview */}
                <Section title="The Game">
                  <p>
                    Mafia is a social deduction game. Players are secretly
                    assigned roles — most are innocent <strong>Villagers</strong>,
                    but a few are <strong>Mafia</strong> members trying to
                    eliminate everyone without getting caught.
                  </p>
                  <p>
                    The game alternates between <strong>Night</strong> (Mafia
                    acts in secret) and <strong>Day</strong> (everyone debates
                    and votes). The village wins by finding all Mafia. The Mafia
                    wins by outnumbering the village.
                  </p>
                </Section>

                {/* Setup */}
                <Section title="Setup">
                  <ol className="list-decimal list-inside space-y-2">
                    <li>One person opens this app on a laptop or tablet — this is the <strong>Host</strong> device</li>
                    <li>A room code and QR code appear on screen</li>
                    <li>All other players scan the QR code (or enter the code) on their phones</li>
                    <li>The host starts the game when everyone has joined</li>
                    <li>Roles are dealt secretly to each phone</li>
                  </ol>
                </Section>

                {/* Roles */}
                <Section title="Roles">
                  <div className="space-y-4">
                    <RoleCard
                      name="Mafia"
                      symbol="M"
                      color="#C41E3A"
                      desc="The killers. Each night, the Mafia collectively chooses one player to eliminate. During the day, they must blend in and avoid suspicion. Mafia members know who each other are."
                    />
                    <RoleCard
                      name="Doctor"
                      symbol="D"
                      color="#2D8B46"
                      desc="Each night, the Doctor chooses one player to protect. If the Mafia targets that player, they survive. The Doctor cannot save the same person two nights in a row."
                    />
                    <RoleCard
                      name="Detective"
                      symbol="?"
                      color="#2563EB"
                      desc="Each night, the Detective picks one player to investigate. They learn whether that player is Mafia or not. Use this information wisely during the day — but revealing yourself makes you a target."
                    />
                    <RoleCard
                      name="Villager"
                      symbol="V"
                      color="#9CA3AF"
                      desc="No special ability. Your power is your voice and your vote. Pay attention, ask questions, and try to figure out who the Mafia is before it's too late."
                    />
                  </div>
                </Section>

                {/* Game Flow */}
                <Section title="Game Flow">
                  <div className="space-y-5">
                    <Phase
                      num="1"
                      title="Night Phase"
                      lines={[
                        "The host device announces \"Night falls\" — everyone closes their eyes (or looks away from each other)",
                        "Mafia members open their phones and pick a target to kill",
                        "The Doctor picks someone to protect",
                        "The Detective picks someone to investigate",
                        "All actions are submitted privately on phones",
                      ]}
                    />
                    <Phase
                      num="2"
                      title="Dawn"
                      lines={[
                        "The host announces what happened overnight",
                        "If someone was killed, they are eliminated from the game",
                        "If the Doctor saved the target, no one dies",
                      ]}
                    />
                    <Phase
                      num="3"
                      title="Day Discussion"
                      lines={[
                        "Everyone opens their eyes and discusses",
                        "Debate who you think is Mafia — make accusations, defend yourself",
                        "The host device runs a timer for discussion",
                      ]}
                    />
                    <Phase
                      num="4"
                      title="Day Vote"
                      lines={[
                        "Everyone votes on their phone for who to eliminate",
                        "If a majority votes for one player, that player is eliminated and their role is revealed",
                        "If there is a tie or no majority, no one is eliminated",
                      ]}
                    />
                    <Phase
                      num="5"
                      title="Repeat"
                      lines={[
                        "Night falls again and the cycle repeats",
                        "The game continues until one side wins",
                      ]}
                    />
                  </div>
                </Section>

                {/* Win Conditions */}
                <Section title="Win Conditions">
                  <div className="space-y-3">
                    <div className="bg-bg-card border border-white/5 rounded-lg p-4">
                      <p className="text-sm font-bold uppercase tracking-wider text-white mb-1">Village Wins</p>
                      <p className="text-muted-light text-sm">All Mafia members are eliminated.</p>
                    </div>
                    <div className="bg-bg-card border border-accent-red/20 rounded-lg p-4">
                      <p className="text-sm font-bold uppercase tracking-wider text-accent-red mb-1">Mafia Wins</p>
                      <p className="text-muted-light text-sm">
                        Mafia members equal or outnumber the remaining villagers.
                      </p>
                    </div>
                  </div>
                </Section>

                {/* Player Count */}
                <Section title="Role Distribution">
                  <div className="bg-bg-card border border-white/5 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-muted text-xs uppercase tracking-wider">
                          <th className="text-left p-3">Players</th>
                          <th className="text-center p-3">Mafia</th>
                          <th className="text-center p-3">Doctor</th>
                          <th className="text-center p-3">Detective</th>
                          <th className="text-center p-3">Villagers</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-light">
                        <DistRow players="4–6" m={1} d={1} det={1} v="1–3" />
                        <DistRow players="7–9" m={2} d={1} det={1} v="3–5" />
                        <DistRow players="10–12" m={3} d={1} det={1} v="5–7" />
                        <DistRow players="13–15" m={4} d={1} det={1} v="7–9" />
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* Tips */}
                <Section title="Tips">
                  <ul className="space-y-2 text-muted-light text-sm">
                    <li className="flex gap-2">
                      <span className="text-accent-red font-bold shrink-0">&mdash;</span>
                      Keep the host device visible and volume up — it narrates the game aloud
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-red font-bold shrink-0">&mdash;</span>
                      Never show your phone screen to anyone
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-red font-bold shrink-0">&mdash;</span>
                      Dead players must stay silent — no hints
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-red font-bold shrink-0">&mdash;</span>
                      As Detective, be careful about revealing your findings — the Mafia will target you
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-red font-bold shrink-0">&mdash;</span>
                      As Mafia, act normal. Accuse others. Create doubt.
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-red font-bold shrink-0">&mdash;</span>
                      Minimum 4 players required. Best with 7–10.
                    </li>
                  </ul>
                </Section>

                <div className="h-8" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-px bg-accent-red" />
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">
          {title}
        </h3>
      </div>
      <div className="text-muted-light text-sm leading-relaxed space-y-3 pl-[23px]">
        {children}
      </div>
    </div>
  );
}

function RoleCard({
  name,
  symbol,
  color,
  desc,
}: {
  name: string;
  symbol: string;
  color: string;
  desc: string;
}) {
  return (
    <div
      className="bg-bg-card rounded-lg p-4 border"
      style={{ borderColor: `${color}25` }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-8 h-8 rounded flex items-center justify-center text-xs font-black"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {symbol}
        </div>
        <span
          className="text-sm font-bold uppercase tracking-wider"
          style={{ color }}
        >
          {name}
        </span>
      </div>
      <p className="text-muted-light text-xs leading-relaxed">{desc}</p>
    </div>
  );
}

function Phase({
  num,
  title,
  lines,
}: {
  num: string;
  title: string;
  lines: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded bg-accent-red/15 text-accent-red text-xs font-black flex items-center justify-center">
          {num}
        </span>
        <span className="text-sm font-bold uppercase tracking-wider text-white">
          {title}
        </span>
      </div>
      <ul className="space-y-1.5 pl-8">
        {lines.map((line, i) => (
          <li key={i} className="text-muted-light text-xs leading-relaxed flex gap-2">
            <span className="text-muted shrink-0">&#8250;</span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DistRow({
  players,
  m,
  d,
  det,
  v,
}: {
  players: string;
  m: number;
  d: number;
  det: number;
  v: string;
}) {
  return (
    <tr className="border-b border-white/[0.03]">
      <td className="p-3 font-medium text-white">{players}</td>
      <td className="p-3 text-center text-accent-red font-bold">{m}</td>
      <td className="p-3 text-center text-green-500 font-bold">{d}</td>
      <td className="p-3 text-center text-blue-400 font-bold">{det}</td>
      <td className="p-3 text-center">{v}</td>
    </tr>
  );
}
