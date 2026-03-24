export type Role = "MAFIA" | "DOCTOR" | "DETECTIVE" | "VILLAGER";

export type GamePhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT_MAFIA"
  | "NIGHT_DOCTOR"
  | "NIGHT_DETECTIVE"
  | "DAWN"
  | "DAY_DISCUSSION"
  | "DAY_VOTING"
  | "ELIMINATION"
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
    | "action-confirmed";
  role?: Role;
  mafiaTeam?: string[];
  actionType?: "mafia-kill" | "doctor-save" | "detective-investigate";
  targets?: PublicPlayer[];
  investigationResult?: { playerName: string; isMafia: boolean };
}

export interface PlayerAction {
  type: "join" | "night-action" | "vote" | "role-seen";
  playerId: string;
  playerName?: string;
  targetId?: string;
}

export const ROLE_INFO: Record<Role, { name: string; emoji: string; color: string; description: string }> = {
  MAFIA: {
    name: "Mafia",
    emoji: "🔫",
    color: "#dc2626",
    description: "Eliminate villagers at night. Stay hidden during the day.",
  },
  DOCTOR: {
    name: "Doctor",
    emoji: "💉",
    color: "#22c55e",
    description: "Choose one player to protect each night.",
  },
  DETECTIVE: {
    name: "Detective",
    emoji: "🔍",
    color: "#3b82f6",
    description: "Investigate one player each night to learn their allegiance.",
  },
  VILLAGER: {
    name: "Villager",
    emoji: "👤",
    color: "#a78bfa",
    description: "Find and vote out the Mafia during the day.",
  },
};
