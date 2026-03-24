"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { GameEngine } from "@/engine/GameEngine";
import { GameState, PrivateMessage, PublicPlayer, ROLE_INFO } from "@/engine/types";
import {
  getSupabase,
  getPublicChannel,
  getHostChannel,
  getPlayerChannel,
} from "@/lib/supabase";
import { generateRoomCode } from "@/lib/utils";
import {
  playNightChime,
  playDawnChime,
  playEliminationSound,
  playVictorySound,
  playVoteSound,
} from "@/lib/sounds";

export default function HostPage() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [timer, setTimer] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelsRef = useRef<any[]>([]);

  const broadcastState = useCallback(
    (state: GameState) => {
      if (!roomCode) return;
      setGameState(state);
      const sb = getSupabase();
      const ch = sb.channel(getPublicChannel(roomCode));
      ch.send({
        type: "broadcast",
        event: "game-state",
        payload: state,
      });
    },
    [roomCode]
  );

  const sendPrivateMessage = useCallback(
    (playerId: string, msg: PrivateMessage) => {
      if (!roomCode) return;
      const sb = getSupabase();
      const ch = sb.channel(getPlayerChannel(roomCode, playerId));
      ch.send({
        type: "broadcast",
        event: "private-msg",
        payload: msg,
      });
    },
    [roomCode]
  );

  // Create room
  const createRoom = useCallback(() => {
    const code = generateRoomCode();
    setRoomCode(code);

    const sb = getSupabase();

    const engine = new GameEngine(
      (state) => {
        setGameState(state);
        sb.channel(getPublicChannel(code)).send({
          type: "broadcast",
          event: "game-state",
          payload: state,
        });
      },
      (playerId, msg) => {
        sb.channel(getPlayerChannel(code, playerId)).send({
          type: "broadcast",
          event: "private-msg",
          payload: msg,
        });
      }
    );
    engineRef.current = engine;

    // Subscribe to public channel (for presence)
    const publicCh = sb
      .channel(getPublicChannel(code))
      .subscribe();

    // Subscribe to host channel for player actions
    const hostCh = sb
      .channel(getHostChannel(code))
      .on("broadcast", { event: "player-action" }, ({ payload }) => {
        const action = payload as {
          type: string;
          playerId: string;
          playerName?: string;
          targetId?: string;
        };
        const eng = engineRef.current;
        if (!eng) return;

        try {
          if (action.type === "join" && action.playerName) {
            eng.addPlayer(action.playerId, action.playerName);
          } else if (action.type === "night-action" && action.targetId) {
            eng.submitNightAction(action.playerId, action.targetId);
          } else if (action.type === "vote" && action.targetId) {
            eng.submitVote(action.playerId, action.targetId);
          } else if (action.type === "leave") {
            eng.removePlayer(action.playerId);
          }
        } catch (err: unknown) {
          console.error("Action error:", err);
        }
      })
      .subscribe();

    channelsRef.current = [publicCh, hostCh];
    setGameState(engine.getGameState());
  }, []);

  // Auto-create room on mount
  useEffect(() => {
    try {
      createRoom();
    } catch (err: unknown) {
      setSetupError(
        err instanceof Error ? err.message : "Failed to initialize"
      );
    }
    return () => {
      try {
        channelsRef.current.forEach((ch) => getSupabase().removeChannel(ch));
      } catch {
        // Supabase not initialized
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Sound effects on phase changes
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameState) return;
    const prev = prevPhaseRef.current;
    const curr = gameState.phase;
    prevPhaseRef.current = curr;
    if (prev === curr) return;

    if (curr === "NIGHT_MAFIA") playNightChime();
    if (curr === "DAWN") playDawnChime();
    if (curr === "ELIMINATION") playEliminationSound();
    if (curr === "GAME_OVER") playVictorySound();
  }, [gameState?.phase]);

  // Timer management
  const startTimer = useCallback(
    (seconds: number, onComplete: () => void) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimer(seconds);
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            onComplete();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    },
    []
  );

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimer(null);
  }, []);

  // Host actions
  const handleStartGame = () => {
    try {
      engineRef.current?.startGame();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start");
    }
  };

  const handleProceedFromRoles = () => {
    engineRef.current?.startNight();
  };

  const handleProceedToDayDiscussion = () => {
    engineRef.current?.startDayDiscussion();
    startTimer(engineRef.current?.settings.discussionTime ?? 120, () => {
      engineRef.current?.startVoting();
    });
  };

  const handleSkipToVoting = () => {
    stopTimer();
    engineRef.current?.startVoting();
    startTimer(engineRef.current?.settings.votingTime ?? 60, () => {
      engineRef.current?.forceResolveCurrentPhase();
    });
  };

  const handleForceResolve = () => {
    stopTimer();
    engineRef.current?.forceResolveCurrentPhase();
  };

  const handleNextRound = () => {
    engineRef.current?.proceedAfterElimination();
  };

  const handleNewGame = () => {
    channelsRef.current.forEach((ch) => getSupabase().removeChannel(ch));
    if (timerRef.current) clearInterval(timerRef.current);
    channelsRef.current = [];
    engineRef.current = null;
    setGameState(null);
    setTimer(null);
    setError(null);
    setRoomCode(null);
    setTimeout(createRoom, 100);
  };

  if (setupError) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-6">⚙️</div>
          <h2 className="text-2xl font-bold mb-4 text-blood-500">
            Setup Required
          </h2>
          <p className="text-white/60 mb-6 text-sm leading-relaxed">
            This app needs a free Supabase project for real-time
            communication between devices.
          </p>
          <div className="bg-night-700 rounded-xl p-5 text-left text-sm space-y-3 mb-6">
            <p className="text-white/80">
              <span className="text-blood-400 font-bold">1.</span> Go to{" "}
              <span className="text-blue-400 underline">supabase.com</span>{" "}
              and create a free project
            </p>
            <p className="text-white/80">
              <span className="text-blood-400 font-bold">2.</span> Go to{" "}
              <span className="text-white/60">Settings → API</span>
            </p>
            <p className="text-white/80">
              <span className="text-blood-400 font-bold">3.</span> Add these
              env vars in Vercel project settings:
            </p>
            <div className="bg-night-900 rounded-lg p-3 font-mono text-xs text-white/50 space-y-1">
              <p>NEXT_PUBLIC_SUPABASE_URL</p>
              <p>NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
            </div>
            <p className="text-white/80">
              <span className="text-blood-400 font-bold">4.</span> Redeploy
              the app
            </p>
          </div>
          <p className="text-white/30 text-xs">{setupError}</p>
        </div>
      </main>
    );
  }

  if (!roomCode || !gameState) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-pulse text-white/50 text-lg">
          Creating room...
        </div>
      </div>
    );
  }

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/play?code=${roomCode}`
      : "";

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        {gameState.phase.startsWith("NIGHT") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gradient-to-b from-blue-950/20 to-night-950"
          />
        )}
        {gameState.phase === "DAWN" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gradient-to-b from-amber-950/10 to-night-950"
          />
        )}
        {(gameState.phase === "DAY_DISCUSSION" ||
          gameState.phase === "DAY_VOTING") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gradient-to-b from-amber-900/5 to-night-950"
          />
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ─── LOBBY ──────────────────────────────────── */}
        {gameState.phase === "LOBBY" && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 w-full max-w-2xl text-center"
          >
            <h2 className="text-3xl font-bold mb-1">
              Room <span className="text-blood-500">{roomCode}</span>
            </h2>
            <p className="text-white/40 text-sm mb-8">
              Scan to join or enter code on your phone
            </p>

            <div className="flex flex-col sm:flex-row gap-8 items-center justify-center mb-8">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl">
                <QRCodeSVG value={joinUrl} size={180} level="M" />
              </div>

              {/* Player list */}
              <div className="flex-1 min-w-[200px]">
                <h3 className="text-white/60 text-sm uppercase tracking-wider mb-3">
                  Players ({gameState.players.length})
                </h3>
                <div className="space-y-2">
                  {gameState.players.length === 0 && (
                    <p className="text-white/20 text-sm">
                      Waiting for players...
                    </p>
                  )}
                  {gameState.players.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 bg-night-700/50 rounded-xl px-4 py-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
                        {p.name[0].toUpperCase()}
                      </div>
                      <span className="font-medium">{p.name}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <p className="text-blood-400 text-sm mb-4">{error}</p>
            )}

            <button
              onClick={handleStartGame}
              disabled={gameState.players.length < 4}
              className="py-4 px-12 bg-blood-500 hover:bg-blood-600 disabled:bg-white/10 disabled:text-white/30 text-white text-lg font-semibold rounded-2xl transition-colors"
            >
              {gameState.players.length < 4
                ? `Need ${4 - gameState.players.length} more player${4 - gameState.players.length > 1 ? "s" : ""}`
                : "Start Game"}
            </button>
          </motion.div>
        )}

        {/* ─── ROLE REVEAL ────────────────────────────── */}
        {gameState.phase === "ROLE_REVEAL" && (
          <motion.div
            key="role-reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-4xl font-bold mb-4">Roles Assigned</h2>
              <p className="text-white/50 text-lg mb-8">
                Check your phones — do not show anyone.
              </p>
              <button
                onClick={handleProceedFromRoles}
                className="py-4 px-12 bg-blood-500 hover:bg-blood-600 text-white text-lg font-semibold rounded-2xl transition-colors"
              >
                Begin Night 1
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ─── NIGHT ──────────────────────────────────── */}
        {(gameState.phase === "NIGHT_MAFIA" ||
          gameState.phase === "NIGHT_DOCTOR" ||
          gameState.phase === "NIGHT_DETECTIVE") && (
          <motion.div
            key="night"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center"
          >
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-6xl mb-6"
            >
              🌙
            </motion.div>
            <h2 className="text-4xl font-bold mb-2">
              Night {gameState.round}
            </h2>
            <p className="text-white/40 text-lg mb-2">
              Everyone close your eyes.
            </p>
            <motion.p
              key={gameState.phase}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-white/60 text-base mb-8"
            >
              {gameState.phase === "NIGHT_MAFIA" && "The Mafia is choosing a target..."}
              {gameState.phase === "NIGHT_DOCTOR" && "The Doctor is choosing who to save..."}
              {gameState.phase === "NIGHT_DETECTIVE" && "The Detective is investigating..."}
            </motion.p>
            <button
              onClick={handleForceResolve}
              className="py-3 px-8 bg-white/10 hover:bg-white/15 text-white/60 text-sm rounded-xl transition-colors"
            >
              Force Advance
            </button>
          </motion.div>
        )}

        {/* ─── DAWN ───────────────────────────────────── */}
        {gameState.phase === "DAWN" && (
          <motion.div
            key="dawn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              <div className="text-6xl mb-6">🌅</div>
              <h2 className="text-4xl font-bold mb-4">Dawn Breaks</h2>

              {gameState.nightResult?.killed ? (
                <div>
                  <p className="text-blood-400 text-2xl font-bold mb-2">
                    {gameState.nightResult.killedPlayerName} was killed.
                  </p>
                  <p className="text-white/40">
                    The Mafia claimed a victim in the night.
                  </p>
                </div>
              ) : gameState.nightResult?.savedByDoctor ? (
                <div>
                  <p className="text-green-400 text-2xl font-bold mb-2">
                    No one died!
                  </p>
                  <p className="text-white/40">
                    The Doctor saved someone in the nick of time.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-white/60 text-2xl font-bold mb-2">
                    A peaceful night.
                  </p>
                  <p className="text-white/40">No one was harmed.</p>
                </div>
              )}

              {gameState.winner ? (
                <div className="mt-8" />
              ) : (
                <button
                  onClick={handleProceedToDayDiscussion}
                  className="mt-8 py-4 px-12 bg-blood-500 hover:bg-blood-600 text-white text-lg font-semibold rounded-2xl transition-colors"
                >
                  Start Discussion
                </button>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* ─── DAY DISCUSSION ─────────────────────────── */}
        {gameState.phase === "DAY_DISCUSSION" && (
          <motion.div
            key="discussion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center w-full max-w-md"
          >
            <div className="text-5xl mb-4">💬</div>
            <h2 className="text-3xl font-bold mb-2">Discussion</h2>
            <p className="text-white/40 mb-6">
              Debate who might be Mafia.
            </p>

            {timer !== null && (
              <div className="mb-6">
                <div className="text-5xl font-bold tabular-nums text-white/90">
                  {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
                </div>
              </div>
            )}

            <AlivePlayerList players={gameState.players} />

            <button
              onClick={handleSkipToVoting}
              className="mt-6 py-4 px-12 bg-blood-500 hover:bg-blood-600 text-white text-lg font-semibold rounded-2xl transition-colors"
            >
              Skip to Voting
            </button>
          </motion.div>
        )}

        {/* ─── DAY VOTING ─────────────────────────────── */}
        {gameState.phase === "DAY_VOTING" && (
          <motion.div
            key="voting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center w-full max-w-md"
          >
            <div className="text-5xl mb-4">🗳️</div>
            <h2 className="text-3xl font-bold mb-2">Vote Now</h2>
            <p className="text-white/40 mb-6">Vote on your phone.</p>

            {timer !== null && (
              <div className="mb-4">
                <div className="text-4xl font-bold tabular-nums text-white/90">
                  {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
                </div>
              </div>
            )}

            {/* Live tally */}
            <div className="space-y-2 mb-6">
              {gameState.players
                .filter((p) => p.isAlive)
                .map((p) => {
                  const votes = gameState.voteTally?.[p.id] ?? 0;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-night-700/50 rounded-xl px-4 py-3"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-blood-400 font-bold">
                        {votes > 0 ? `${votes} vote${votes > 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                  );
                })}
            </div>

            <p className="text-white/30 text-sm mb-4">
              {Object.keys(gameState.votes ?? {}).length} /{" "}
              {gameState.players.filter((p) => p.isAlive).length} voted
            </p>

            <button
              onClick={handleForceResolve}
              className="py-3 px-8 bg-white/10 hover:bg-white/15 text-white/60 text-sm rounded-xl transition-colors"
            >
              Force End Vote
            </button>
          </motion.div>
        )}

        {/* ─── ELIMINATION ────────────────────────────── */}
        {gameState.phase === "ELIMINATION" && (
          <motion.div
            key="elimination"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center"
          >
            {gameState.voteResult?.eliminated ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
              >
                <div className="text-6xl mb-6">⚖️</div>
                <h2 className="text-3xl font-bold mb-2">
                  {gameState.voteResult.eliminatedName} has been eliminated.
                </h2>
                <p className="text-white/50 text-xl mb-2">
                  They were{" "}
                  <span
                    style={{
                      color:
                        ROLE_INFO[gameState.voteResult.eliminatedRole!]?.color,
                    }}
                  >
                    {ROLE_INFO[gameState.voteResult.eliminatedRole!]?.name}
                  </span>
                  .
                </p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <div className="text-6xl mb-6">🤷</div>
                <h2 className="text-3xl font-bold mb-2">
                  {gameState.voteResult?.isTie
                    ? "It's a tie!"
                    : "No majority reached."}
                </h2>
                <p className="text-white/50">No one was eliminated.</p>
              </motion.div>
            )}

            {gameState.winner ? null : (
              <button
                onClick={handleNextRound}
                className="mt-8 py-4 px-12 bg-blood-500 hover:bg-blood-600 text-white text-lg font-semibold rounded-2xl transition-colors"
              >
                Continue to Night
              </button>
            )}
          </motion.div>
        )}

        {/* ─── GAME OVER ──────────────────────────────── */}
        {gameState.phase === "GAME_OVER" && (
          <motion.div
            key="gameover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center w-full max-w-md"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, type: "spring" }}
            >
              <div className="text-7xl mb-6">
                {gameState.winner === "VILLAGE" ? "🎉" : "💀"}
              </div>
              <h2 className="text-4xl font-bold mb-2">
                {gameState.winner === "VILLAGE"
                  ? "Village Wins!"
                  : "Mafia Wins!"}
              </h2>
              <p className="text-white/50 mb-8">
                {gameState.winner === "VILLAGE"
                  ? "The town has found and eliminated all Mafia members."
                  : "The Mafia has taken over the town."}
              </p>
            </motion.div>

            {/* Role reveal */}
            <div className="space-y-2 mb-8">
              <h3 className="text-white/40 text-sm uppercase tracking-wider mb-3">
                All Roles
              </h3>
              {gameState.players.map((p) => {
                const role = gameState.allRoles?.[p.id];
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-night-700/50 rounded-xl px-4 py-3"
                  >
                    <span
                      className={
                        p.isAlive ? "font-medium" : "font-medium line-through text-white/40"
                      }
                    >
                      {p.name}
                    </span>
                    {role && (
                      <span
                        className="font-bold"
                        style={{ color: ROLE_INFO[role].color }}
                      >
                        {ROLE_INFO[role].emoji} {ROLE_INFO[role].name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleNewGame}
              className="py-4 px-12 bg-blood-500 hover:bg-blood-600 text-white text-lg font-semibold rounded-2xl transition-colors"
            >
              New Game
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function AlivePlayerList({ players }: { players: PublicPlayer[] }) {
  return (
    <div className="space-y-2">
      {players.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
            p.isAlive
              ? "bg-night-700/50"
              : "bg-night-700/20 opacity-40"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full ${
              p.isAlive ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span
            className={
              p.isAlive ? "font-medium" : "font-medium line-through"
            }
          >
            {p.name}
          </span>
          {!p.isAlive && (
            <span className="text-white/30 text-sm ml-auto">Dead</span>
          )}
        </div>
      ))}
    </div>
  );
}
