import { Card } from "./Card.js";

const CARD_VALUES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export class Deck {
  private readonly cards: Card[];

  constructor(pairs = 8, random: () => number = Math.random) {
    if (!Number.isInteger(pairs) || pairs < 1 || pairs > CARD_VALUES.length) {
      throw new Error(`El número de pares debe ser un entero entre 1 y ${CARD_VALUES.length}`);
    }

    const cards = Array.from({ length: pairs }, (_, pairIndex) => [
      new Card(pairIndex * 2, `pair-${pairIndex}`, CARD_VALUES[pairIndex]),
      new Card(pairIndex * 2 + 1, `pair-${pairIndex}`, CARD_VALUES[pairIndex]),
    ]).flat();

    for (let index = cards.length - 1; index > 0; index--) {
      const sample = random();
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new Error("El generador aleatorio debe retornar un número entre 0 y 1");
      }
      const swapIndex = Math.floor(sample * (index + 1));
      [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
    }

    this.cards = cards.map((card, index) => {
      const pairId = card.getPairId();
      const value = card.getValue();
      return new Card(index, pairId, value);
    });
  }

  public getCard(index: number): Card | undefined {
    return this.cards[index];
  }

  public getCards(): Card[] {
    return [...this.cards];
  }

  public getPublicState(): ReturnType<Card["toPublicState"]>[] {
    return this.cards.map((card) => card.toPublicState());
  }
}

export function createSeededRandom(seed: number): () => number {
  if (!Number.isInteger(seed)) {
    throw new Error("La semilla debe ser un entero");
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
