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
  speak,
  stopSpeech,
  playNightChime,
  playDawnChime,
  playEliminationSound,
  playVictorySound,
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

    const publicCh = sb.channel(getPublicChannel(code)).subscribe();

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
      setSetupError(err instanceof Error ? err.message : "Failed to initialize");
    }
    return () => {
      stopSpeech();
      try {
        channelsRef.current.forEach((ch) => getSupabase().removeChannel(ch));
      } catch {
        // not initialized
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── Voice narration on phase changes ─────────────────
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameState) return;
    const prev = prevPhaseRef.current;
    const curr = gameState.phase;
    prevPhaseRef.current = curr;
    if (prev === curr) return;

    switch (curr) {
      case "ROLE_REVEAL":
        speak("Roles have been assigned. Check your phones now. Do not show anyone.");
        break;
      case "NIGHT_MAFIA":
        playNightChime();
        setTimeout(() => {
          speak(
            gameState.round === 1
              ? "Night falls over the town. Everyone, close your eyes. Mafia and Terrorist, open your eyes and choose your target."
              : "Night falls. Everyone, close your eyes. Mafia, open your eyes. Choose your target."
          );
        }, 800);
        break;
      case "NIGHT_DOCTOR":
        speak("Mafia, close your eyes. Doctor, open your eyes. Choose someone to protect.");
        break;
      case "NIGHT_DETECTIVE":
        speak("Doctor, close your eyes. Detective, open your eyes. Choose someone to investigate.");
        break;
      case "NIGHT_SPY":
        speak("Detective, close your eyes. Spy, open your eyes. Choose someone to surveil.");
        break;
      case "DAWN":
        playDawnChime();
        setTimeout(() => {
          const closeEyes = "Close your eyes.";
          if (gameState.nightResult?.killed) {
            speak(
              `${closeEyes} Everyone, open your eyes. The sun rises. Last night, ${gameState.nightResult.killedPlayerName} was killed by the Mafia.`
            );
          } else if (gameState.nightResult?.savedByDoctor) {
            speak(
              `${closeEyes} Everyone, open your eyes. The sun rises. No one died last night. The Doctor made a crucial save.`
            );
          } else {
            speak(
              `${closeEyes} Everyone, open your eyes. The sun rises. It was a peaceful night.`
            );
          }
        }, 800);
        break;
      case "DAY_DISCUSSION":
        speak("Discussion begins now. Talk amongst yourselves. Who do you suspect?");
        break;
      case "DAY_VOTING":
        speak("Time to vote. Use your phones to cast your vote now.");
        break;
      case "ELIMINATION":
        playEliminationSound();
        setTimeout(() => {
          if (gameState.voteResult?.eliminated) {
            let msg = `The town has spoken. ${gameState.voteResult.eliminatedName} has been eliminated. They were ${ROLE_INFO[gameState.voteResult.eliminatedRole!]?.name}.`;
            if (gameState.voteResult.terroristVictimName) {
              msg += ` But the Terrorist's final act takes ${gameState.voteResult.terroristVictimName} down as well!`;
            }
            speak(msg);
          } else if (gameState.voteResult?.isTie) {
            speak("The vote is tied. No one is eliminated.");
          } else {
            speak("No majority was reached. No one is eliminated.");
          }
        }, 600);
        break;
      case "GAME_OVER":
        playVictorySound();
        setTimeout(() => {
          speak(
            gameState.winner === "VILLAGE"
              ? "Game over. The Village wins! All Mafia members have been eliminated."
              : "Game over. The Mafia wins! They have taken over the town."
          );
        }, 800);
        break;
    }
  }, [gameState?.phase]);

  // ─── Timer ────────────────────────────────────────────
  const startTimer = useCallback((seconds: number, onComplete: () => void) => {
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
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimer(null);
  }, []);

  // ─── Host Actions ─────────────────────────────────────
  const handleStartGame = () => {
    try {
      engineRef.current?.startGame();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start");
    }
  };

  const handleProceedFromRoles = () => engineRef.current?.startNight();

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

  const handleNextRound = () => engineRef.current?.proceedAfterElimination();

  const handleNewGame = () => {
    stopSpeech();
    try {
      channelsRef.current.forEach((ch) => getSupabase().removeChannel(ch));
    } catch { /* */ }
    if (timerRef.current) clearInterval(timerRef.current);
    channelsRef.current = [];
    engineRef.current = null;
    setGameState(null);
    setTimer(null);
    setError(null);
    setRoomCode(null);
    setTimeout(createRoom, 100);
  };

  // ─── Setup Error ──────────────────────────────────────
  if (setupError) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-bold mb-4 text-accent-red uppercase tracking-wider">
            Setup Required
          </h2>
          <p className="text-muted-light mb-6 text-sm">
            This app needs a free Supabase project for real-time communication.
          </p>
          <div className="bg-bg-card border border-white/10 rounded-lg p-5 text-left text-sm space-y-3 mb-6">
            <p className="text-white/80"><span className="text-accent-red font-bold">1.</span> Go to supabase.com — create a free project</p>
            <p className="text-white/80"><span className="text-accent-red font-bold">2.</span> Settings &rarr; API Keys</p>
            <p className="text-white/80"><span className="text-accent-red font-bold">3.</span> Add env vars in Vercel:</p>
            <div className="bg-bg-primary rounded p-3 font-mono text-xs text-muted-light space-y-1">
              <p>NEXT_PUBLIC_SUPABASE_URL</p>
              <p>NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
            </div>
            <p className="text-white/80"><span className="text-accent-red font-bold">4.</span> Redeploy</p>
          </div>
          <p className="text-muted text-xs">{setupError}</p>
        </div>
      </main>
    );
  }

  if (!roomCode || !gameState) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-pulse text-muted text-sm uppercase tracking-widest">Creating room...</div>
      </div>
    );
  }

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/play?code=${roomCode}` : "";
  const aliveCount = gameState.players.filter((p) => p.isAlive).length;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background atmospherics */}
      <div className="absolute inset-0 pointer-events-none">
        {gameState.phase.startsWith("NIGHT") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-gradient-to-b from-blue-950/10 via-transparent to-transparent" />
        )}
        {(gameState.phase === "DAWN" || gameState.phase === "DAY_DISCUSSION" || gameState.phase === "DAY_VOTING") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-gradient-to-b from-amber-950/5 via-transparent to-transparent" />
        )}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent-darkred/5 blur-[150px] rounded-full" />
      </div>

      <AnimatePresence mode="wait">
        {/* ─── LOBBY ───────────────────────────────── */}
        {gameState.phase === "LOBBY" && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 w-full max-w-2xl text-center">
            <p className="text-muted text-xs uppercase tracking-[0.3em] mb-2">Room Code</p>
            <h2 className="text-5xl font-black tracking-[0.15em] text-white mb-8">{roomCode}</h2>

            <div className="flex flex-col sm:flex-row gap-8 items-center justify-center mb-10">
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG value={joinUrl} size={160} level="M" bgColor="#ffffff" fgColor="#0d0d0d" />
              </div>

              <div className="flex-1 min-w-[220px] text-left">
                <p className="text-muted text-xs uppercase tracking-[0.2em] mb-4">
                  Players &mdash; {gameState.players.length}
                </p>
                <div className="space-y-1.5">
                  {gameState.players.length === 0 && (
                    <p className="text-muted text-sm">Waiting for players...</p>
                  )}
                  {gameState.players.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 bg-bg-card border border-white/5 rounded-lg px-4 py-2.5"
                    >
                      <div className="w-7 h-7 rounded bg-accent-red/20 text-accent-red flex items-center justify-center text-xs font-bold uppercase">
                        {p.name[0]}
                      </div>
                      <span className="text-sm font-medium text-white/90">{p.name}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-accent-red text-sm mb-4">{error}</p>}

            <button
              onClick={handleStartGame}
              disabled={gameState.players.length < 4}
              className="py-3.5 px-14 bg-accent-red hover:bg-accent-crimson disabled:bg-bg-elevated disabled:text-muted text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors"
            >
              {gameState.players.length < 4
                ? `Need ${4 - gameState.players.length} more`
                : "Start Game"}
            </button>
          </motion.div>
        )}

        {/* ─── ROLE REVEAL ─────────────────────────── */}
        {gameState.phase === "ROLE_REVEAL" && (
          <motion.div key="role-reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 text-center">
            <div className="w-12 h-px bg-accent-red mx-auto mb-8" />
            <h2 className="text-3xl font-black uppercase tracking-wider mb-3">Roles Assigned</h2>
            <p className="text-muted-light text-sm mb-10">Check your phones. Do not show anyone.</p>
            <button onClick={handleProceedFromRoles} className="py-3.5 px-14 bg-accent-red hover:bg-accent-crimson text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors">
              Begin Night 1
            </button>
          </motion.div>
        )}

        {/* ─── NIGHT ───────────────────────────────── */}
        {(gameState.phase === "NIGHT_MAFIA" || gameState.phase === "NIGHT_DOCTOR" || gameState.phase === "NIGHT_DETECTIVE" || gameState.phase === "NIGHT_SPY") && (
          <motion.div key="night" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 text-center">
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="w-3 h-3 rounded-full bg-blue-400 mx-auto mb-8"
            />
            <h2 className="text-4xl font-black uppercase tracking-wider mb-2">Night {gameState.round}</h2>
            <p className="text-muted text-sm uppercase tracking-widest mb-2">Everyone close your eyes</p>
            <motion.p
              key={gameState.phase}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-muted-light text-sm mb-10"
            >
              {gameState.phase === "NIGHT_MAFIA" && "The Mafia is choosing a target..."}
              {gameState.phase === "NIGHT_DOCTOR" && "The Doctor is choosing who to save..."}
              {gameState.phase === "NIGHT_DETECTIVE" && "The Detective is investigating..."}
              {gameState.phase === "NIGHT_SPY" && "The Spy is surveilling..."}
            </motion.p>
            <button onClick={handleForceResolve} className="py-2.5 px-8 bg-bg-elevated hover:bg-bg-hover text-muted-light text-xs uppercase tracking-widest rounded-lg transition-colors border border-white/5">
              Force Advance
            </button>
          </motion.div>
        )}

        {/* ─── DAWN ────────────────────────────────── */}
        {gameState.phase === "DAWN" && (
          <motion.div key="dawn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8 }}>
              <div className="w-3 h-3 rounded-full bg-amber-400 mx-auto mb-8" />
              <h2 className="text-3xl font-black uppercase tracking-wider mb-6">Dawn Breaks</h2>

              {gameState.nightResult?.killed ? (
                <div className="bg-bg-card border border-accent-red/30 rounded-lg p-6 max-w-sm mx-auto mb-8">
                  <p className="text-accent-red text-xl font-bold uppercase tracking-wide mb-1">
                    {gameState.nightResult.killedPlayerName}
                  </p>
                  <p className="text-muted-light text-sm">was killed by the Mafia</p>
                </div>
              ) : gameState.nightResult?.savedByDoctor ? (
                <div className="bg-bg-card border border-green-700/30 rounded-lg p-6 max-w-sm mx-auto mb-8">
                  <p className="text-green-500 text-xl font-bold uppercase tracking-wide mb-1">No One Died</p>
                  <p className="text-muted-light text-sm">The Doctor made a save</p>
                </div>
              ) : (
                <div className="bg-bg-card border border-white/10 rounded-lg p-6 max-w-sm mx-auto mb-8">
                  <p className="text-white/70 text-xl font-bold uppercase tracking-wide mb-1">Peaceful Night</p>
                  <p className="text-muted-light text-sm">No one was harmed</p>
                </div>
              )}

              {!gameState.winner && (
                <button onClick={handleProceedToDayDiscussion} className="py-3.5 px-14 bg-accent-red hover:bg-accent-crimson text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors">
                  Start Discussion
                </button>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* ─── DAY DISCUSSION ──────────────────────── */}
        {gameState.phase === "DAY_DISCUSSION" && (
          <motion.div key="discussion" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 text-center w-full max-w-md">
            <h2 className="text-3xl font-black uppercase tracking-wider mb-2">Discussion</h2>
            <p className="text-muted text-sm mb-6">Debate who might be Mafia</p>

            {timer !== null && (
              <div className="text-5xl font-black tabular-nums text-white/90 mb-6">
                {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
              </div>
            )}

            <PlayerStatusList players={gameState.players} />

            <button onClick={handleSkipToVoting} className="mt-8 py-3.5 px-14 bg-accent-red hover:bg-accent-crimson text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors">
              Skip to Voting
            </button>
          </motion.div>
        )}

        {/* ─── DAY VOTING ──────────────────────────── */}
        {gameState.phase === "DAY_VOTING" && (
          <motion.div key="voting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 text-center w-full max-w-md">
            <h2 className="text-3xl font-black uppercase tracking-wider mb-2">Vote Now</h2>
            <p className="text-muted text-sm mb-6">Cast your vote on your phone</p>

            {timer !== null && (
              <div className="text-4xl font-black tabular-nums text-white/90 mb-4">
                {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
              </div>
            )}

            <div className="space-y-1.5 mb-6">
              {gameState.players.filter((p) => p.isAlive).map((p) => {
                const votes = gameState.voteTally?.[p.id] ?? 0;
                const pct = aliveCount > 0 ? (votes / aliveCount) * 100 : 0;
                return (
                  <div key={p.id} className="relative bg-bg-card border border-white/5 rounded-lg px-4 py-3 overflow-hidden">
                    {votes > 0 && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        className="absolute inset-y-0 left-0 bg-accent-red/15"
                      />
                    )}
                    <div className="relative flex items-center justify-between">
                      <span className="text-sm font-medium">{p.name}</span>
                      {votes > 0 && <span className="text-accent-red text-sm font-bold">{votes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-muted text-xs uppercase tracking-wider mb-6">
              {Object.keys(gameState.votes ?? {}).length} / {aliveCount} voted
            </p>

            <button onClick={handleForceResolve} className="py-2.5 px-8 bg-bg-elevated hover:bg-bg-hover text-muted-light text-xs uppercase tracking-widest rounded-lg transition-colors border border-white/5">
              Force End Vote
            </button>
          </motion.div>
        )}

        {/* ─── ELIMINATION ─────────────────────────── */}
        {gameState.phase === "ELIMINATION" && (
          <motion.div key="elimination" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 text-center">
            {gameState.voteResult?.eliminated ? (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
                <div className="w-12 h-px bg-accent-red mx-auto mb-8" />
                <h2 className="text-2xl font-black uppercase tracking-wider mb-2">Eliminated</h2>
                <div className="bg-bg-card border border-accent-red/30 rounded-lg p-6 max-w-sm mx-auto mb-2">
                  <p className="text-white text-2xl font-black uppercase tracking-wide mb-1">
                    {gameState.voteResult.eliminatedName}
                  </p>
                  <p className="text-sm font-bold uppercase tracking-wider" style={{ color: ROLE_INFO[gameState.voteResult.eliminatedRole!]?.color }}>
                    {ROLE_INFO[gameState.voteResult.eliminatedRole!]?.name}
                  </p>
                </div>
                {gameState.voteResult.terroristVictimName && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
                    className="bg-bg-card border border-orange-500/30 rounded-lg p-5 max-w-sm mx-auto mt-4">
                    <p className="text-orange-400 text-xs uppercase tracking-wider font-bold mb-1">Terrorist&apos;s Final Act</p>
                    <p className="text-white text-lg font-black uppercase">{gameState.voteResult.terroristVictimName}</p>
                    <p className="text-muted-light text-xs mt-1">was taken down as well</p>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <div className="w-12 h-px bg-white/20 mx-auto mb-8" />
                <h2 className="text-2xl font-black uppercase tracking-wider mb-2">
                  {gameState.voteResult?.isTie ? "Tied Vote" : "No Majority"}
                </h2>
                <p className="text-muted-light text-sm mb-2">No one was eliminated</p>
              </motion.div>
            )}

            {!gameState.winner && (
              <button onClick={handleNextRound} className="mt-8 py-3.5 px-14 bg-accent-red hover:bg-accent-crimson text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors">
                Continue to Night
              </button>
            )}
          </motion.div>
        )}

        {/* ─── GAME OVER ──────────────────────────── */}
        {gameState.phase === "GAME_OVER" && (
          <motion.div key="gameover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 text-center w-full max-w-md">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, type: "spring" }}>
              <div className="w-16 h-px bg-accent-red mx-auto mb-8" />
              <p className="text-muted text-xs uppercase tracking-[0.3em] mb-3">Game Over</p>
              <h2 className="text-4xl font-black uppercase tracking-wider mb-2">
                {gameState.winner === "VILLAGE" ? (
                  <span className="text-white">Village Wins</span>
                ) : (
                  <span className="text-accent-red">Mafia Wins</span>
                )}
              </h2>
              <p className="text-muted-light text-sm mb-10">
                {gameState.winner === "VILLAGE"
                  ? "All Mafia members have been found and eliminated."
                  : "The Mafia has taken over the town."}
              </p>
            </motion.div>

            <div className="space-y-1.5 mb-10">
              <p className="text-muted text-xs uppercase tracking-[0.2em] mb-3">All Roles</p>
              {gameState.players.map((p) => {
                const role = gameState.allRoles?.[p.id];
                return (
                  <div key={p.id} className="flex items-center justify-between bg-bg-card border border-white/5 rounded-lg px-4 py-3">
                    <span className={p.isAlive ? "text-sm font-medium" : "text-sm font-medium line-through text-muted"}>
                      {p.name}
                    </span>
                    {role && (
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ROLE_INFO[role].color }}>
                        {ROLE_INFO[role].name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={handleNewGame} className="py-3.5 px-14 bg-accent-red hover:bg-accent-crimson text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors">
              New Game
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function PlayerStatusList({ players }: { players: PublicPlayer[] }) {
  return (
    <div className="space-y-1.5">
      {players.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-3 rounded-lg px-4 py-2.5 ${
            p.isAlive ? "bg-bg-card border border-white/5" : "bg-bg-card/50 border border-white/[0.02]"
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${p.isAlive ? "bg-green-500" : "bg-accent-red"}`} />
          <span className={p.isAlive ? "text-sm font-medium" : "text-sm font-medium line-through text-muted"}>
            {p.name}
          </span>
          {!p.isAlive && <span className="text-muted text-xs ml-auto uppercase tracking-wider">Dead</span>}
        </div>
      ))}
    </div>
  );
}
