export type GameMode = "east" | "hanchan";
export type ChoiceType = "discard" | "riichi" | "chi" | "pon" | "kan" | "tsumo" | "ron" | "abort" | "pass" | "ack";
export type Choice = { id: string; type: ChoiceType; value?: string };
export type PublicPlayer = { seat: number; wind: number; score: number; handCount: number; discards: string[]; melds: string[]; riichi: boolean };
export type Settlement = { kind: "win" | "draw"; name: string; winnerSeat?: number; hand?: string; winningTile?: string; yaku: { name: string; han: number | string }[]; fu?: number; han?: number; points?: number; delta: number[]; uraIndicators: string[]; tenpaiSeats?: number[] };
export type GameView = { decisionId: string; phase: string; roundWind: number; roundNumber: number; honba: number; riichiSticks: number; remainingTiles: number; doraIndicators: string[]; turnSeat: number; hand: string[]; drawnTile: string | null; players: PublicPlayer[]; choices: Choice[]; settlement: Settlement | null; ranking: { seat: number; rank: number; score: number }[] | null };
export type PlayerIdentity = { userId: string; displayName: string };
export type RoomMember = PlayerIdentity & { seat: number; ready: boolean; connected: boolean };
export type RoomView = { id: string; code: string; hostUserId: string; mode: GameMode; status: "lobby" | "playing" | "finished"; version: number; mySeat: number; members: RoomMember[]; game: GameView | null };
export type MahjongResponse = { room: RoomView | null; serviceRunning: boolean };
export type MahjongCommand = { nonce: string } & (
  | { action: "create"; mode: GameMode }
  | { action: "join"; code: string }
  | { action: "ready"; ready: boolean; roomId: string }
  | { action: "start" | "leave" | "finish" | "rematch"; roomId: string }
  | { action: "respond"; decisionId: string; choiceId: string; roomId: string }
);
