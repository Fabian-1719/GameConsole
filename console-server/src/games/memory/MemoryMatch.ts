import { Player } from "../../core/Player.js";
import { Match, MatchOptions, MatchStatus } from "../../core/Match.js";
import { EventFactory } from "../../events/EventFactory.js";
import { Deck, createSeededRandom } from "./Deck.js";
import { CardState } from "./Card.js";

export interface MemoryMatchOptions extends MatchOptions {
  pairs?: number;
  hideMs?: number;
  seed?: number;
  random?: () => number;
}

export interface MemoryPublicState {
  matchId: string;
  gameId: string;
  status: MatchStatus;
  cards: Array<{ index: number; state: CardState; value?: string }>;
  attempts: number;
  pairsMatched: number;
  pendingHide: boolean;
  humanPlayer?: { id: string; name: string };
}

export class MemoryMatch extends Match {
  private readonly deck: Deck;
  private readonly hideMs: number;
  private attempts = 0;
  private pairsMatched = 0;
  private firstCardIndex?: number;
  private secondCardIndex?: number;
  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor(options: MemoryMatchOptions = {}) {
    super("memory-match", options);
    const random = options.random ?? (options.seed === undefined ? Math.random : createSeededRandom(options.seed));
    this.deck = new Deck(options.pairs ?? 8, random);
    this.hideMs = options.hideMs ?? 1000;
    if (!Number.isInteger(this.hideMs) || this.hideMs < 0) {
      throw new Error("hideMs debe ser un entero no negativo");
    }
  }

  public getAttempts(): number {
    return this.attempts;
  }

  public getPairsMatched(): number {
    return this.pairsMatched;
  }

  public handleAction(playerId: string, action: unknown): void {
    if (this.status !== "RUNNING" || playerId !== this.getHumanPlayer()?.id || this.hideTimer) {
      return;
    }
    if (typeof action !== "object" || action === null || !("cardIndex" in action)) {
      return;
    }
    const { cardIndex } = action;
    if (typeof cardIndex !== "number" || !Number.isInteger(cardIndex)) {
      return;
    }
    const card = this.deck.getCard(cardIndex);
    if (!card || card.getState() !== "HIDDEN") {
      return;
    }

    card.flip();
    this.emitEvent(
      EventFactory.create({
        gameId: this.gameId,
        gameVersion: this.gameVersion,
        matchId: this.matchId,
        playerId,
        type: "CARD_FLIPPED",
        action: "FLIP",
        data: { cardIndex },
      })
    );

    if (this.firstCardIndex === undefined) {
      this.firstCardIndex = cardIndex;
      this.broadcastState();
      return;
    }

    this.secondCardIndex = cardIndex;
    this.attempts++;
    const firstCard = this.deck.getCard(this.firstCardIndex);
    if (!firstCard) {
      throw new Error("No se encontró la primera carta expuesta");
    }

    if (firstCard.getPairId() === card.getPairId()) {
      firstCard.markMatched();
      card.markMatched();
      this.pairsMatched++;
      this.emitEvent(
        EventFactory.create({
          gameId: this.gameId,
          gameVersion: this.gameVersion,
          matchId: this.matchId,
          playerId,
          type: "PAIR_MATCHED",
          action: "MATCH",
          data: { pairId: card.getPairId(), attempts: this.attempts },
        })
      );
      this.firstCardIndex = undefined;
      this.secondCardIndex = undefined;
      if (this.pairsMatched === this.deck.getCards().length / 2) {
        this.finish("WIN", playerId, { pairs: this.pairsMatched, attempts: this.attempts });
        return;
      }
    } else {
      this.emitEvent(
        EventFactory.create({
          gameId: this.gameId,
          gameVersion: this.gameVersion,
          matchId: this.matchId,
          playerId,
          type: "PAIR_MISSED",
          action: "MISS",
          data: { attempts: this.attempts },
        })
      );
      this.hideTimer = setTimeout(() => this.hidePendingPair(), this.hideMs);
      this.hideTimer.unref?.();
    }
    this.broadcastState();
  }

  public override finish(
    result: "WIN" | "LOSS" | "DRAW" | "ABANDONED",
    winnerId: string | null = null,
    extraData: Record<string, unknown> = {}
  ): void {
    this.clearHideTimer();
    super.finish(result, winnerId, {
      pairs: this.pairsMatched,
      attempts: this.attempts,
      ...extraData,
    });
  }

  public getPublicState(): MemoryPublicState {
    const human = this.getHumanPlayer();
    return {
      matchId: this.matchId,
      gameId: this.gameId,
      status: this.status,
      cards: this.deck.getPublicState(),
      attempts: this.attempts,
      pairsMatched: this.pairsMatched,
      pendingHide: this.hideTimer !== undefined,
      humanPlayer: human ? { id: human.id, name: human.name } : undefined,
    };
  }

  public getHumanPlayer(): Player | undefined {
    return this.players.find((player) => player.isHuman);
  }

  private hidePendingPair(): void {
    this.clearHideTimer();
    if (this.firstCardIndex !== undefined) {
      this.deck.getCard(this.firstCardIndex)?.hide();
    }
    if (this.secondCardIndex !== undefined) {
      this.deck.getCard(this.secondCardIndex)?.hide();
    }
    this.firstCardIndex = undefined;
    this.secondCardIndex = undefined;
    this.broadcastState();
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }
}
