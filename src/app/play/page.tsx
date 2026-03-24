"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GameState, PrivateMessage, PublicPlayer, Role, ROLE_INFO } from "@/engine/types";
import {
  getSupabase,
  getPublicChannel,
  getHostChannel,
  getPlayerChannel,
} from "@/lib/supabase";
import { generatePlayerId } from "@/lib/utils";
import { playVoteSound } from "@/lib/sounds";

function PlayerPageInner() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code") ?? "";

  const [screen, setScreen] = useState<"join" | "lobby" | "game">("join");
  const [roomCode, setRoomCode] = useState(codeFromUrl);
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Private state
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [mafiaTeam, setMafiaTeam] = useState<string[]>([]);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [actionPrompt, setActionPrompt] = useState<PrivateMessage | null>(null);
  const [actionSubmitted, setActionSubmitted] = useState(false);
  const [detectiveResult, setDetectiveResult] = useState<{
    playerName: string;
    isMafia: boolean;
  } | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelsRef = useRef<any[]>([]);

  // Restore player ID from session
  useEffect(() => {
    const stored = sessionStorage.getItem("playmafia-player-id");
    if (stored) {
      setPlayerId(stored);
    } else {
      const id = generatePlayerId();
      setPlayerId(id);
      sessionStorage.setItem("playmafia-player-id", id);
    }
  }, []);

  // Auto-fill code from URL
  useEffect(() => {
    if (codeFromUrl) setRoomCode(codeFromUrl);
  }, [codeFromUrl]);

  const sendAction = useCallback(
    (action: Record<string, unknown>) => {
      if (!roomCode) return;
      getSupabase().channel(getHostChannel(roomCode)).send({
        type: "broadcast",
        event: "player-action",
        payload: action,
      });
    },
    [roomCode]
  );

  // Reset per-phase state on phase changes
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;

    if (phase === "ROLE_REVEAL") {
      setRoleRevealed(false);
    }
    if (phase.startsWith("NIGHT")) {
      setActionSubmitted(false);
      setActionPrompt(null);
      setDetectiveResult(null);
    }
    if (phase === "DAY_VOTING") {
      setHasVoted(false);
    }
  }, [gameState?.phase]);

  const handleJoin = () => {
    const code = roomCode.trim().toUpperCase();
    const name = playerName.trim();
    if (!code || code.length < 4) {
      setError("Enter a valid room code");
      return;
    }
    if (!name || name.length < 1) {
      setError("Enter your name");
      return;
    }
    if (name.length > 15) {
      setError("Name too long (max 15 chars)");
      return;
    }

    setRoomCode(code);
    setError(null);

    let sb;
    try {
      sb = getSupabase();
    } catch (err: unknown) {
      setError(
        "Supabase not configured. The host needs to set up environment variables."
      );
      return;
    }

    // Subscribe to public channel
    const publicCh = sb
      .channel(getPublicChannel(code))
      .on("broadcast", { event: "game-state" }, ({ payload }) => {
        setGameState(payload as GameState);
        if ((payload as GameState).phase !== "LOBBY") {
          setScreen("game");
        }
      })
      .subscribe();

    // Subscribe to host channel (to send actions)
    const hostCh = getSupabase().channel(getHostChannel(code)).subscribe();

    // Subscribe to private channel
    const privateCh = sb
      .channel(getPlayerChannel(code, playerId))
      .on("broadcast", { event: "private-msg" }, ({ payload }) => {
        const msg = payload as PrivateMessage;
        if (msg.type === "role-assigned") {
          setMyRole(msg.role ?? null);
          setMafiaTeam(msg.mafiaTeam ?? []);
          setScreen("game");
        } else if (msg.type === "action-prompt") {
          setActionPrompt(msg);
          setActionSubmitted(false);
        } else if (msg.type === "detective-result" && msg.investigationResult) {
          setDetectiveResult(msg.investigationResult);
        } else if (msg.type === "action-confirmed") {
          setActionSubmitted(true);
        }
      })
      .subscribe();

    channelsRef.current = [publicCh, hostCh, privateCh];

    // Send join action
    setTimeout(() => {
      sendAction({
        type: "join",
        playerId,
        playerName: name,
      });
    }, 500);

    setScreen("lobby");
  };

  // Cleanup
  useEffect(() => {
    return () => {
      channelsRef.current.forEach((ch) => getSupabase().removeChannel(ch));
    };
  }, []);

  const handleNightAction = (targetId: string) => {
    sendAction({
      type: "night-action",
      playerId,
      targetId,
    });
    setActionSubmitted(true);
    playVoteSound();
  };

  const handleVote = (targetId: string) => {
    sendAction({
      type: "vote",
      playerId,
      targetId,
    });
    setHasVoted(true);
    playVoteSound();
  };

  const amAlive =
    gameState?.players.find((p) => p.id === playerId)?.isAlive ?? true;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-8 safe-bottom">
      <AnimatePresence mode="wait">
        {/* ─── JOIN SCREEN ────────────────────────────── */}
        {screen === "join" && (
          <motion.div
            key="join"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm"
          >
            <h1 className="text-3xl font-bold text-center mb-8">
              <span className="text-blood-500">Join</span> Game
            </h1>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-white/40 text-sm block mb-2">
                  Room Code
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) =>
                    setRoomCode(e.target.value.toUpperCase().slice(0, 4))
                  }
                  placeholder="ABCD"
                  maxLength={4}
                  className="w-full bg-night-700 border border-white/10 rounded-xl px-4 py-4 text-center text-2xl font-bold tracking-[0.3em] focus:outline-none focus:border-blood-500 transition-colors uppercase"
                  autoFocus={!codeFromUrl}
                />
              </div>

              <div>
                <label className="text-white/40 text-sm block mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.slice(0, 15))}
                  placeholder="Enter your name"
                  maxLength={15}
                  className="w-full bg-night-700 border border-white/10 rounded-xl px-4 py-4 text-center text-lg focus:outline-none focus:border-blood-500 transition-colors"
                  autoFocus={!!codeFromUrl}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
              </div>
            </div>

            {error && (
              <p className="text-blood-400 text-sm text-center mb-4">
                {error}
              </p>
            )}

            <button
              onClick={handleJoin}
              disabled={!roomCode || !playerName.trim()}
              className="w-full py-4 bg-blood-500 hover:bg-blood-600 disabled:bg-white/10 disabled:text-white/30 text-white text-lg font-semibold rounded-2xl transition-colors"
            >
              Join
            </button>
          </motion.div>
        )}

        {/* ─── LOBBY WAITING ──────────────────────────── */}
        {screen === "lobby" && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <div className="animate-pulse-slow text-5xl mb-6">👁️</div>
            <h2 className="text-2xl font-bold mb-2">You&apos;re in!</h2>
            <p className="text-white/40 mb-4">
              Room <span className="text-blood-500 font-bold">{roomCode}</span>
            </p>
            <p className="text-white/30 text-sm">
              Waiting for the host to start the game...
            </p>
            {gameState && (
              <p className="text-white/20 text-sm mt-4">
                {gameState.players.length} player
                {gameState.players.length !== 1 ? "s" : ""} in lobby
              </p>
            )}
          </motion.div>
        )}

        {/* ─── IN GAME ────────────────────────────────── */}
        {screen === "game" && gameState && (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm"
          >
            <AnimatePresence mode="wait">
              {/* ROLE REVEAL */}
              {gameState.phase === "ROLE_REVEAL" && myRole && (
                <motion.div
                  key="role-reveal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  {!roleRevealed ? (
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                    >
                      <p className="text-white/40 mb-6">
                        Tap to reveal your role
                      </p>
                      <button
                        onClick={() => setRoleRevealed(true)}
                        className="w-48 h-64 bg-night-700 border-2 border-white/20 rounded-2xl flex items-center justify-center mx-auto hover:border-white/40 transition-colors"
                      >
                        <span className="text-4xl">❓</span>
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ duration: 0.4 }}
                    >
                      <div
                        className="w-56 mx-auto rounded-2xl p-6 border-2"
                        style={{
                          borderColor: ROLE_INFO[myRole].color,
                          background: `${ROLE_INFO[myRole].color}15`,
                        }}
                      >
                        <div className="text-5xl mb-3">
                          {ROLE_INFO[myRole].emoji}
                        </div>
                        <h3
                          className="text-2xl font-bold mb-2"
                          style={{ color: ROLE_INFO[myRole].color }}
                        >
                          {ROLE_INFO[myRole].name}
                        </h3>
                        <p className="text-white/50 text-sm">
                          {ROLE_INFO[myRole].description}
                        </p>
                        {mafiaTeam.length > 0 && (
                          <p className="text-blood-400/80 text-xs mt-3">
                            Your allies: {mafiaTeam.join(", ")}
                          </p>
                        )}
                      </div>
                      <p className="text-white/30 text-xs mt-4">
                        Memorize this. Do not show anyone.
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* NIGHT - ACTIVE ROLE */}
              {gameState.phase.startsWith("NIGHT") && (
                <motion.div
                  key={`night-${gameState.phase}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  {!amAlive ? (
                    <DeadScreen />
                  ) : actionPrompt && !actionSubmitted ? (
                    <NightActionUI
                      prompt={actionPrompt}
                      detectiveResult={detectiveResult}
                      onSelect={handleNightAction}
                    />
                  ) : actionSubmitted ? (
                    <div>
                      <div className="text-5xl mb-4">✅</div>
                      <p className="text-white/50">
                        Action submitted. Waiting for others...
                      </p>
                    </div>
                  ) : (
                    <div>
                      <motion.div
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="text-5xl mb-4"
                      >
                        😴
                      </motion.div>
                      <p className="text-white/50 text-lg">Close your eyes.</p>
                      <p className="text-white/30 text-sm mt-2">
                        Night is happening...
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* DAWN */}
              {gameState.phase === "DAWN" && (
                <motion.div
                  key="dawn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="text-5xl mb-4">🌅</div>
                  <h3 className="text-2xl font-bold mb-3">Dawn</h3>
                  {gameState.nightResult?.killed ? (
                    <p className="text-blood-400 font-bold">
                      {gameState.nightResult.killedPlayerName} was killed.
                    </p>
                  ) : gameState.nightResult?.savedByDoctor ? (
                    <p className="text-green-400 font-bold">
                      No one died — the Doctor made a save!
                    </p>
                  ) : (
                    <p className="text-white/50">A peaceful night.</p>
                  )}
                  {!amAlive && <DeadBadge />}
                </motion.div>
              )}

              {/* DAY DISCUSSION */}
              {gameState.phase === "DAY_DISCUSSION" && (
                <motion.div
                  key="discussion"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  {!amAlive ? (
                    <DeadScreen />
                  ) : (
                    <>
                      <div className="text-5xl mb-4">💬</div>
                      <h3 className="text-2xl font-bold mb-2">
                        Discussion Time
                      </h3>
                      <p className="text-white/40 text-sm">
                        Discuss with the group. Who seems suspicious?
                      </p>
                      {myRole && (
                        <div className="mt-6 p-3 bg-night-700/50 rounded-xl">
                          <p className="text-white/30 text-xs">Your role</p>
                          <p
                            className="font-bold"
                            style={{ color: ROLE_INFO[myRole].color }}
                          >
                            {ROLE_INFO[myRole].emoji} {ROLE_INFO[myRole].name}
                          </p>
                        </div>
                      )}
                      {detectiveResult && (
                        <div className="mt-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl">
                          <p className="text-blue-400 text-sm">
                            🔍 {detectiveResult.playerName} is{" "}
                            <strong>
                              {detectiveResult.isMafia
                                ? "MAFIA"
                                : "NOT Mafia"}
                            </strong>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {/* DAY VOTING */}
              {gameState.phase === "DAY_VOTING" && (
                <motion.div
                  key="voting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center w-full"
                >
                  {!amAlive ? (
                    <DeadScreen />
                  ) : hasVoted ? (
                    <div>
                      <div className="text-5xl mb-4">🗳️</div>
                      <p className="text-white/50 text-lg">Vote cast!</p>
                      <p className="text-white/30 text-sm mt-2">
                        Waiting for others...
                      </p>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-2xl font-bold mb-2">
                        Cast Your Vote
                      </h3>
                      <p className="text-white/40 text-sm mb-6">
                        Who should be eliminated?
                      </p>
                      <div className="space-y-2">
                        {gameState.players
                          .filter(
                            (p) => p.isAlive && p.id !== playerId
                          )
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => handleVote(p.id)}
                              className="w-full py-4 px-6 bg-night-700 hover:bg-blood-500/20 border border-white/10 hover:border-blood-500/50 rounded-xl text-left font-medium transition-all active:scale-[0.98]"
                            >
                              {p.name}
                            </button>
                          ))}
                        <button
                          onClick={() => handleVote("skip")}
                          className="w-full py-4 px-6 bg-night-700/50 hover:bg-white/10 border border-white/5 rounded-xl text-left text-white/40 font-medium transition-all"
                        >
                          Skip Vote
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ELIMINATION */}
              {gameState.phase === "ELIMINATION" && (
                <motion.div
                  key="elimination"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="text-5xl mb-4">⚖️</div>
                  {gameState.voteResult?.eliminated ? (
                    <>
                      <h3 className="text-2xl font-bold mb-2">
                        {gameState.voteResult.eliminatedName} was eliminated.
                      </h3>
                      <p className="text-white/50">
                        They were{" "}
                        <span
                          style={{
                            color:
                              ROLE_INFO[gameState.voteResult.eliminatedRole!]
                                ?.color,
                          }}
                        >
                          {
                            ROLE_INFO[gameState.voteResult.eliminatedRole!]
                              ?.name
                          }
                        </span>
                        .
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-2xl font-bold mb-2">
                        No one was eliminated.
                      </h3>
                      <p className="text-white/50">
                        {gameState.voteResult?.isTie
                          ? "The vote was tied."
                          : "No majority was reached."}
                      </p>
                    </>
                  )}
                  {!amAlive && <DeadBadge />}
                </motion.div>
              )}

              {/* GAME OVER */}
              {gameState.phase === "GAME_OVER" && (
                <motion.div
                  key="gameover"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center w-full"
                >
                  <div className="text-6xl mb-4">
                    {gameState.winner === "VILLAGE" ? "🎉" : "💀"}
                  </div>
                  <h2 className="text-3xl font-bold mb-2">
                    {gameState.winner === "VILLAGE"
                      ? "Village Wins!"
                      : "Mafia Wins!"}
                  </h2>

                  {myRole && (
                    <p className="text-white/50 mb-6">
                      You were{" "}
                      <span
                        className="font-bold"
                        style={{ color: ROLE_INFO[myRole].color }}
                      >
                        {ROLE_INFO[myRole].emoji} {ROLE_INFO[myRole].name}
                      </span>
                    </p>
                  )}

                  <div className="space-y-2">
                    {gameState.players.map((p) => {
                      const role = gameState.allRoles?.[p.id];
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                            p.id === playerId
                              ? "bg-white/10 border border-white/20"
                              : "bg-night-700/50"
                          }`}
                        >
                          <span
                            className={
                              p.isAlive
                                ? "font-medium"
                                : "font-medium line-through text-white/40"
                            }
                          >
                            {p.name}
                            {p.id === playerId && (
                              <span className="text-white/30 text-xs ml-2">
                                (you)
                              </span>
                            )}
                          </span>
                          {role && (
                            <span
                              className="font-bold text-sm"
                              style={{ color: ROLE_INFO[role].color }}
                            >
                              {ROLE_INFO[role].emoji} {ROLE_INFO[role].name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function NightActionUI({
  prompt,
  detectiveResult,
  onSelect,
}: {
  prompt: PrivateMessage;
  detectiveResult: { playerName: string; isMafia: boolean } | null;
  onSelect: (targetId: string) => void;
}) {
  const labels = {
    "mafia-kill": { title: "Choose a Target", icon: "🔫", color: "#dc2626" },
    "doctor-save": { title: "Choose Who to Save", icon: "💉", color: "#22c55e" },
    "detective-investigate": {
      title: "Choose Who to Investigate",
      icon: "🔍",
      color: "#3b82f6",
    },
  };
  const info = labels[prompt.actionType!] ?? labels["mafia-kill"];

  return (
    <div>
      <div className="text-4xl mb-3">{info.icon}</div>
      <h3 className="text-xl font-bold mb-1" style={{ color: info.color }}>
        {info.title}
      </h3>
      <p className="text-white/40 text-sm mb-6">Tap a player.</p>

      {detectiveResult && (
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl">
          <p className="text-blue-400 text-sm">
            Previous result: {detectiveResult.playerName} is{" "}
            <strong>
              {detectiveResult.isMafia ? "MAFIA" : "NOT Mafia"}
            </strong>
          </p>
        </div>
      )}

      <div className="space-y-2">
        {prompt.targets?.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="w-full py-4 px-6 bg-night-700 hover:bg-white/10 border border-white/10 rounded-xl text-left font-medium transition-all active:scale-[0.98]"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function DeadScreen() {
  return (
    <div className="text-center">
      <div className="text-5xl mb-4 opacity-50">💀</div>
      <h3 className="text-xl font-bold text-white/40 mb-2">
        You are dead.
      </h3>
      <p className="text-white/20 text-sm">
        Watch the game unfold in silence.
      </p>
    </div>
  );
}

function DeadBadge() {
  return (
    <div className="mt-4 inline-block px-4 py-1 bg-red-500/10 border border-red-500/30 rounded-full text-red-400 text-sm">
      You have been eliminated
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center">
          <div className="animate-pulse text-white/50">Loading...</div>
        </div>
      }
    >
      <PlayerPageInner />
    </Suspense>
  );
}
