export type Role = "MAFIA" | "DOCTOR" | "DETECTIVE" | "SPY" | "TERRORIST" | "VILLAGER";

export type GamePhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT_MAFIA"
  | "NIGHT_DOCTOR"
  | "NIGHT_DETECTIVE"
  | "NIGHT_SPY"
  | "DAWN"
  | "DAY_DISCUSSION"
  | "DAY_VOTING"
  | "ELIMINATION"
  | "TERRORIST_REVENGE"
  | "GAME_OVER";

export interface Player {
  id: string;
  name: string;
  role: Role | null;
  isAlive: boolean;
  isConnected: boolean;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isAlive: boolean;
  isConnected: boolean;
}

export interface GameSettings {
  discussionTime: number;
  votingTime: number;
  doctorSelfHeal: boolean;
}

export interface NightActions {
  mafiaVotes: Record<string, string>;
  mafiaTarget: string | null;
  doctorSave: string | null;
  detectiveTarget: string | null;
  spyTarget: string | null;
}

export interface NightResult {
  killed: string | null;
  savedByDoctor: boolean;
  killedPlayerName: string | null;
}

export interface VoteResult {
  votes: Record<string, string>;
  tally: Record<string, number>;
  eliminated: string | null;
  eliminatedName: string | null;
  eliminatedRole: Role | null;
  isTie: boolean;
  terroristVictim: string | null;
  terroristVictimName: string | null;
}

export interface GameState {
  phase: GamePhase;
  round: number;
  players: PublicPlayer[];
  nightResult: NightResult | null;
  voteResult: VoteResult | null;
  winner: "MAFIA" | "VILLAGE" | null;
  timer: number | null;
  allRoles?: Record<string, Role>;
  votes?: Record<string, string>;
  voteTally?: Record<string, number>;
}

export interface PrivateMessage {
  type:
    | "role-assigned"
    | "action-prompt"
    | "detective-result"
    | "spy-result"
    | "action-confirmed"
    | "terrorist-revenge";
  role?: Role;
  mafiaTeam?: string[];
  actionType?: "mafia-kill" | "doctor-save" | "detective-investigate" | "spy-surveil" | "terrorist-choose";
  targets?: PublicPlayer[];
  investigationResult?: { playerName: string; isMafia: boolean };
  spyResult?: { playerName: string; wasTargeted: boolean };
}

export interface PlayerAction {
  type: "join" | "night-action" | "vote" | "role-seen" | "terrorist-pick";
  playerId: string;
  playerName?: string;
  targetId?: string;
}

export const ROLE_INFO: Record<
  Role,
  { name: string; symbol: string; color: string; team: string; description: string }
> = {
  MAFIA: {
    name: "Mafia",
    symbol: "M",
    color: "#C41E3A",
    team: "mafia",
    description: "Eliminate villagers at night. Stay hidden during the day.",
  },
  TERRORIST: {
    name: "Terrorist",
    symbol: "T",
    color: "#E85D04",
    team: "mafia",
    description: "Mafia-aligned. If voted out, you take one player down with you.",
  },
  DOCTOR: {
    name: "Doctor",
    symbol: "D",
    color: "#2D8B46",
    team: "village",
    description: "Choose one player to protect each night.",
  },
  DETECTIVE: {
    name: "Detective",
    symbol: "?",
    color: "#2563EB",
    team: "village",
    description: "Investigate one player each night to learn their allegiance.",
  },
  SPY: {
    name: "Spy",
    symbol: "S",
    color: "#7C3AED",
    team: "village",
    description: "Each night, watch a player. Learn if the Mafia targeted them.",
  },
  VILLAGER: {
    name: "Villager",
    symbol: "V",
    color: "#9CA3AF",
    team: "village",
    description: "Find and vote out the Mafia during the day.",
  },
};
