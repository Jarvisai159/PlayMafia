import {
  Player,
  Role,
  GamePhase,
  GameSettings,
  NightActions,
  NightResult,
  VoteResult,
  GameState,
  PublicPlayer,
  PrivateMessage,
} from "./types";

const DEFAULT_SETTINGS: GameSettings = {
  discussionTime: 120,
  votingTime: 60,
  doctorSelfHeal: true,
};

function getRoleDistribution(
  playerCount: number
): Record<Role, number> {
  if (playerCount <= 6)
    return { MAFIA: 1, DOCTOR: 1, DETECTIVE: 1, VILLAGER: playerCount - 3 };
  if (playerCount <= 9)
    return { MAFIA: 2, DOCTOR: 1, DETECTIVE: 1, VILLAGER: playerCount - 4 };
  if (playerCount <= 12)
    return { MAFIA: 3, DOCTOR: 1, DETECTIVE: 1, VILLAGER: playerCount - 5 };
  return { MAFIA: 4, DOCTOR: 1, DETECTIVE: 1, VILLAGER: playerCount - 6 };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class GameEngine {
  players: Map<string, Player> = new Map();
  phase: GamePhase = "LOBBY";
  round = 0;
  nightActions: NightActions = {
    mafiaVotes: {},
    mafiaTarget: null,
    doctorSave: null,
    detectiveTarget: null,
  };
  votes: Record<string, string> = {};
  settings: GameSettings;
  nightResult: NightResult | null = null;
  voteResult: VoteResult | null = null;
  winner: "MAFIA" | "VILLAGE" | null = null;
  lastDoctorSave: string | null = null;

  private onStateChange: (state: GameState) => void;
  private onPrivateMessage: (playerId: string, msg: PrivateMessage) => void;

  constructor(
    onStateChange: (state: GameState) => void,
    onPrivateMessage: (playerId: string, msg: PrivateMessage) => void,
    settings?: Partial<GameSettings>
  ) {
    this.onStateChange = onStateChange;
    this.onPrivateMessage = onPrivateMessage;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  addPlayer(id: string, name: string): Player {
    if (this.phase !== "LOBBY") throw new Error("Game already started");
    if (this.players.size >= 15) throw new Error("Room is full");
    if (this.players.has(id)) {
      const p = this.players.get(id)!;
      p.isConnected = true;
      return p;
    }
    // Check duplicate name
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase())
        throw new Error("Name already taken");
    }
    const player: Player = {
      id,
      name,
      role: null,
      isAlive: true,
      isConnected: true,
    };
    this.players.set(id, player);
    this.broadcastState();
    return player;
  }

  removePlayer(id: string): void {
    if (this.phase === "LOBBY") {
      this.players.delete(id);
      this.broadcastState();
    } else {
      const p = this.players.get(id);
      if (p) p.isConnected = false;
    }
  }

  getPublicPlayers(): PublicPlayer[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isAlive: p.isAlive,
      isConnected: p.isConnected,
    }));
  }

  getGameState(): GameState {
    const state: GameState = {
      phase: this.phase,
      round: this.round,
      players: this.getPublicPlayers(),
      nightResult: this.nightResult,
      voteResult: this.voteResult,
      winner: this.winner,
      timer: null,
    };
    if (this.phase === "DAY_VOTING") {
      // Send vote counts (not who voted for whom) for live tally
      const tally: Record<string, number> = {};
      for (const targetId of Object.values(this.votes)) {
        if (targetId !== "skip") {
          tally[targetId] = (tally[targetId] || 0) + 1;
        }
      }
      state.voteTally = tally;
      state.votes = { ...this.votes };
    }
    if (this.phase === "GAME_OVER") {
      state.allRoles = Object.fromEntries(
        Array.from(this.players.entries()).map(([id, p]) => [id, p.role!])
      );
    }
    return state;
  }

  // ─── Game Start ───────────────────────────────────────────

  startGame(): void {
    if (this.players.size < 4) throw new Error("Need at least 4 players");
    if (this.phase !== "LOBBY") throw new Error("Game already started");

    this.assignRoles();
    this.phase = "ROLE_REVEAL";
    this.round = 1;

    for (const [id, player] of this.players) {
      const mafiaTeam =
        player.role === "MAFIA"
          ? Array.from(this.players.values())
              .filter((p) => p.role === "MAFIA" && p.id !== id)
              .map((p) => p.name)
          : undefined;

      this.onPrivateMessage(id, {
        type: "role-assigned",
        role: player.role!,
        mafiaTeam,
      });
    }

    this.broadcastState();
  }

  private assignRoles(): void {
    const dist = getRoleDistribution(this.players.size);
    const roles: Role[] = [];
    for (const [role, count] of Object.entries(dist)) {
      for (let i = 0; i < count; i++) roles.push(role as Role);
    }
    const shuffled = shuffle(roles);
    const ids = Array.from(this.players.keys());
    ids.forEach((id, i) => {
      this.players.get(id)!.role = shuffled[i];
    });
  }

  // ─── Night Phase ──────────────────────────────────────────

  startNight(): void {
    this.nightActions = {
      mafiaVotes: {},
      mafiaTarget: null,
      doctorSave: null,
      detectiveTarget: null,
    };
    this.nightResult = null;
    this.voteResult = null;
    this.phase = "NIGHT_MAFIA";
    this.broadcastState();
    this.sendMafiaPrompts();
  }

  private sendMafiaPrompts(): void {
    const alive = this.getAlivePlayers();
    const targets = alive.filter((p) => p.role !== "MAFIA");
    for (const p of alive) {
      if (p.role === "MAFIA") {
        this.onPrivateMessage(p.id, {
          type: "action-prompt",
          actionType: "mafia-kill",
          targets: targets.map((t) => ({
            id: t.id,
            name: t.name,
            isAlive: t.isAlive,
            isConnected: t.isConnected,
          })),
        });
      }
    }
  }

  submitNightAction(playerId: string, targetId: string): void {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return;

    if (this.phase === "NIGHT_MAFIA" && player.role === "MAFIA") {
      this.nightActions.mafiaVotes[playerId] = targetId;
      this.onPrivateMessage(playerId, { type: "action-confirmed" });
      const aliveMafia = this.getAlivePlayers().filter(
        (p) => p.role === "MAFIA"
      );
      if (
        Object.keys(this.nightActions.mafiaVotes).length >= aliveMafia.length
      ) {
        this.resolveMafiaVote();
        this.advanceNight();
      }
    } else if (this.phase === "NIGHT_DOCTOR" && player.role === "DOCTOR") {
      this.nightActions.doctorSave = targetId;
      this.onPrivateMessage(playerId, { type: "action-confirmed" });
      this.advanceNight();
    } else if (
      this.phase === "NIGHT_DETECTIVE" &&
      player.role === "DETECTIVE"
    ) {
      this.nightActions.detectiveTarget = targetId;
      const target = this.players.get(targetId);
      if (target) {
        this.onPrivateMessage(playerId, {
          type: "detective-result",
          investigationResult: {
            playerName: target.name,
            isMafia: target.role === "MAFIA",
          },
        });
      }
      this.advanceNight();
    }
  }

  private resolveMafiaVote(): void {
    const votes = Object.values(this.nightActions.mafiaVotes);
    const tally: Record<string, number> = {};
    for (const v of votes) tally[v] = (tally[v] || 0) + 1;
    const maxVotes = Math.max(...Object.values(tally));
    const top = Object.keys(tally).filter((k) => tally[k] === maxVotes);
    this.nightActions.mafiaTarget = top[Math.floor(Math.random() * top.length)];
  }

  private advanceNight(): void {
    const alive = this.getAlivePlayers();

    if (this.phase === "NIGHT_MAFIA") {
      const doctor = alive.find((p) => p.role === "DOCTOR");
      if (doctor) {
        this.phase = "NIGHT_DOCTOR";
        const targets = alive.filter((p) => {
          if (!this.settings.doctorSelfHeal && p.id === doctor.id) return false;
          if (this.lastDoctorSave === p.id) return false;
          return true;
        });
        this.onPrivateMessage(doctor.id, {
          type: "action-prompt",
          actionType: "doctor-save",
          targets: targets.map((t) => ({
            id: t.id,
            name: t.name,
            isAlive: t.isAlive,
            isConnected: t.isConnected,
          })),
        });
        this.broadcastState();
        return;
      }
    }

    if (this.phase === "NIGHT_MAFIA" || this.phase === "NIGHT_DOCTOR") {
      if (this.phase === "NIGHT_DOCTOR") {
        this.lastDoctorSave = this.nightActions.doctorSave;
      }
      const detective = alive.find((p) => p.role === "DETECTIVE");
      if (detective) {
        this.phase = "NIGHT_DETECTIVE";
        const targets = alive.filter((p) => p.id !== detective.id);
        this.onPrivateMessage(detective.id, {
          type: "action-prompt",
          actionType: "detective-investigate",
          targets: targets.map((t) => ({
            id: t.id,
            name: t.name,
            isAlive: t.isAlive,
            isConnected: t.isConnected,
          })),
        });
        this.broadcastState();
        return;
      }
    }

    // All night actions done
    this.resolveNight();
  }

  private resolveNight(): void {
    if (this.phase === "NIGHT_DOCTOR") {
      this.lastDoctorSave = this.nightActions.doctorSave;
    }

    const target = this.nightActions.mafiaTarget;
    const saved = target !== null && target === this.nightActions.doctorSave;

    if (target && !saved) {
      const victim = this.players.get(target);
      if (victim) {
        victim.isAlive = false;
        this.nightResult = {
          killed: target,
          savedByDoctor: false,
          killedPlayerName: victim.name,
        };
      }
    } else {
      this.nightResult = {
        killed: null,
        savedByDoctor: saved,
        killedPlayerName: null,
      };
    }

    this.phase = "DAWN";
    this.broadcastState();

    const win = this.checkWinCondition();
    if (win) {
      this.winner = win;
      this.phase = "GAME_OVER";
      this.broadcastState();
    }
  }

  // ─── Day Phase ────────────────────────────────────────────

  startDayDiscussion(): void {
    if (this.winner) return;
    this.phase = "DAY_DISCUSSION";
    this.votes = {};
    this.broadcastState();
  }

  startVoting(): void {
    this.phase = "DAY_VOTING";
    this.votes = {};
    this.broadcastState();
  }

  submitVote(playerId: string, targetId: string): void {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || this.phase !== "DAY_VOTING") return;
    this.votes[playerId] = targetId;
    this.broadcastState();

    const alive = this.getAlivePlayers();
    if (Object.keys(this.votes).length >= alive.length) {
      this.resolveVoting();
    }
  }

  private resolveVoting(): void {
    const tally: Record<string, number> = {};
    for (const targetId of Object.values(this.votes)) {
      if (targetId !== "skip") {
        tally[targetId] = (tally[targetId] || 0) + 1;
      }
    }

    const aliveCount = this.getAlivePlayers().length;
    const majority = Math.floor(aliveCount / 2) + 1;

    let eliminated: string | null = null;
    let maxVotes = 0;
    let isTie = false;

    for (const [id, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminated = id;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    if (maxVotes < majority || isTie) {
      eliminated = null;
    }

    let eliminatedRole: Role | null = null;
    let eliminatedName: string | null = null;
    if (eliminated) {
      const p = this.players.get(eliminated);
      if (p) {
        p.isAlive = false;
        eliminatedRole = p.role;
        eliminatedName = p.name;
      }
    }

    this.voteResult = {
      votes: { ...this.votes },
      tally,
      eliminated,
      eliminatedName,
      eliminatedRole,
      isTie,
    };

    this.phase = "ELIMINATION";
    this.broadcastState();

    const win = this.checkWinCondition();
    if (win) {
      this.winner = win;
      this.phase = "GAME_OVER";
      this.broadcastState();
    }
  }

  proceedAfterElimination(): void {
    if (this.winner) return;
    this.round++;
    this.startNight();
  }

  // ─── Force Resolve (timeouts) ─────────────────────────────

  forceResolveCurrentPhase(): void {
    if (this.phase === "NIGHT_MAFIA") {
      if (Object.keys(this.nightActions.mafiaVotes).length === 0) {
        const targets = this.getAlivePlayers().filter(
          (p) => p.role !== "MAFIA"
        );
        const rand = targets[Math.floor(Math.random() * targets.length)];
        if (rand) this.nightActions.mafiaVotes["auto"] = rand.id;
      }
      this.resolveMafiaVote();
      this.advanceNight();
    } else if (this.phase === "NIGHT_DOCTOR") {
      this.advanceNight();
    } else if (this.phase === "NIGHT_DETECTIVE") {
      this.advanceNight();
    } else if (this.phase === "DAY_VOTING") {
      for (const p of this.getAlivePlayers()) {
        if (!this.votes[p.id]) this.votes[p.id] = "skip";
      }
      this.resolveVoting();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  getAlivePlayers(): Player[] {
    return Array.from(this.players.values()).filter((p) => p.isAlive);
  }

  private checkWinCondition(): "MAFIA" | "VILLAGE" | null {
    const alive = this.getAlivePlayers();
    const mafia = alive.filter((p) => p.role === "MAFIA").length;
    const village = alive.filter((p) => p.role !== "MAFIA").length;
    if (mafia === 0) return "VILLAGE";
    if (mafia >= village) return "MAFIA";
    return null;
  }

  private broadcastState(): void {
    this.onStateChange(this.getGameState());
  }
}
