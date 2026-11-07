import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanPlayer } from "../src/core/Player.js";
import { GameEvent } from "../src/events/contract.js";
import { Deck, createSeededRandom } from "../src/games/memory/Deck.js";
import { MemoryMatch } from "../src/games/memory/MemoryMatch.js";

const PLAYER_ID = "p-memory-test";

function createMatch(options: { pairs?: number; hideMs?: number; seed?: number } = {}): {
  match: MemoryMatch;
  events: GameEvent[];
} {
  const match = new MemoryMatch(options);
  const events: GameEvent[] = [];
  match.on("event", (event: GameEvent) => events.push(event));
  match.addPlayer(new HumanPlayer(PLAYER_ID, "Memory tester"));
  return { match, events };
}

function findPairIndexes(seed: number, pairs: number): number[][] {
  const cards = new Deck(pairs, createSeededRandom(seed)).getCards();
  const pairIndexes = new Map<string, number[]>();
  cards.forEach((card, index) => {
    const indexes = pairIndexes.get(card.getPairId()) ?? [];
    indexes.push(index);
    pairIndexes.set(card.getPairId(), indexes);
  });
  return [...pairIndexes.values()];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MemoryMatch", () => {
  it("matches a pair and finishes after every pair is found", () => {
    const seed = 41;
    const pairs = 3;
    const pairIndexes = findPairIndexes(seed, pairs);
    const { match, events } = createMatch({ pairs, seed });

    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][0] });
    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][1] });
    expect(match.getPairsMatched()).toBe(1);
    expect(match.getAttempts()).toBe(1);
    const pairMatched = events.find((event) => event.type === "PAIR_MATCHED")?.data;
    expect(pairMatched).toMatchObject({ attempts: 1 });
    expect(typeof pairMatched?.pairId).toBe("string");

    for (const [first, second] of pairIndexes.slice(1)) {
      match.handleAction(PLAYER_ID, { cardIndex: first });
      match.handleAction(PLAYER_ID, { cardIndex: second });
    }

    expect(match.status).toBe("FINISHED");
    const finished = events.find((event) => event.type === "MATCH_FINISHED");
    expect(finished?.data).toMatchObject({ result: "WIN", pairs, attempts: pairs });
    expect(events.filter((event) => event.type === "PAIR_MATCHED")).toHaveLength(pairs);
  });

  it("hides a missed pair after hideMs and ignores actions while it is pending", () => {
    vi.useFakeTimers();
    const seed = 52;
    const pairIndexes = findPairIndexes(seed, 2);
    const { match, events } = createMatch({ pairs: 2, hideMs: 1000, seed });
    const [first] = pairIndexes[0];
    const [other] = pairIndexes[1];

    match.handleAction(PLAYER_ID, { cardIndex: first });
    match.handleAction(PLAYER_ID, { cardIndex: other });
    expect(match.getPublicState().pendingHide).toBe(true);
    expect(match.getAttempts()).toBe(1);
    expect(events.filter((event) => event.type === "PAIR_MISSED")).toHaveLength(1);
    const faceUp = match.getPublicState().cards.filter((card) => card.state === "FACEUP");
    expect(faceUp).toHaveLength(2);

    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][1] });
    expect(match.getPublicState().cards.filter((card) => card.state === "FACEUP")).toHaveLength(2);
    vi.advanceTimersByTime(999);
    expect(match.getPublicState().cards.filter((card) => card.state === "FACEUP")).toHaveLength(2);
    vi.advanceTimersByTime(1);

    expect(match.getPublicState().pendingHide).toBe(false);
    expect(match.getPublicState().cards.every((card) => card.state === "HIDDEN")).toBe(true);
  });

  it("ignores invalid indexes and cards that are already face up or matched", () => {
    const pairIndexes = findPairIndexes(63, 2);
    const { match, events } = createMatch({ pairs: 2, seed: 63 });
    const startingEvents = events.length;

    for (const cardIndex of [-1, 4, 1.5, Number.NaN]) {
      match.handleAction(PLAYER_ID, { cardIndex });
    }
    expect(events).toHaveLength(startingEvents);

    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][0] });
    const afterFirst = events.length;
    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][0] });
    expect(events).toHaveLength(afterFirst);
    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][1] });
    const afterMatch = events.length;
    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][0] });
    expect(events).toHaveLength(afterMatch);
  });

  it("never exposes values or pair ids for hidden cards", () => {
    const { match } = createMatch({ pairs: 2, seed: 74 });

    const hiddenState = match.getPublicState();
    expect(hiddenState.cards).toHaveLength(4);
    expect(hiddenState.cards.every((card) => card.state === "HIDDEN")).toBe(true);
    expect(hiddenState.cards.every((card) => !("value" in card) && !("pairId" in card))).toBe(true);

    match.handleAction(PLAYER_ID, { cardIndex: 0 });
    const revealed = match.getPublicState().cards.find((card) => card.index === 0);
    expect(revealed).toMatchObject({ state: "FACEUP" });
    expect(revealed?.value).toBeDefined();
  });

  it("clears the pending hide timer when the player abandons", () => {
    vi.useFakeTimers();
    const pairIndexes = findPairIndexes(85, 2);
    const { match, events } = createMatch({ pairs: 2, seed: 85 });
    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[0][0] });
    match.handleAction(PLAYER_ID, { cardIndex: pairIndexes[1][0] });

    expect(vi.getTimerCount()).toBe(1);
    match.removePlayer(PLAYER_ID, "WEBSOCKET_CLOSED");

    expect(vi.getTimerCount()).toBe(0);
    expect(events.find((event) => event.type === "MATCH_FINISHED")?.data.result).toBe("ABANDONED");
  });

  it("keeps events isolated across three simultaneous matches", () => {
    const matches = Array.from({ length: 3 }, (_, index) => createMatch({ pairs: 2, seed: index + 100 }));

    matches.forEach(({ match }, index) => match.handleAction(PLAYER_ID, { cardIndex: index }));

    for (const { match, events } of matches) {
      const cardEvents = events.filter((event) => event.type === "CARD_FLIPPED");
      expect(cardEvents).toHaveLength(1);
      expect(cardEvents.every((event) => event.matchId === match.matchId)).toBe(true);
    }
    expect(new Set(matches.map(({ match }) => match.matchId)).size).toBe(3);
    matches.forEach(({ match }) => match.finish("ABANDONED"));
  });
});
