export type CardState = "HIDDEN" | "FACEUP" | "MATCHED";

export class Card {
  private state: CardState = "HIDDEN";

  constructor(
    private readonly index: number,
    private readonly pairId: string,
    private readonly value: string
  ) {}

  public getIndex(): number {
    return this.index;
  }

  public getPairId(): string {
    return this.pairId;
  }

  public getValue(): string {
    return this.value;
  }

  public getState(): CardState {
    return this.state;
  }

  public flip(): void {
    if (this.state === "HIDDEN") {
      this.state = "FACEUP";
    }
  }

  public markMatched(): void {
    this.state = "MATCHED";
  }

  public hide(): void {
    if (this.state === "FACEUP") {
      this.state = "HIDDEN";
    }
  }

  public toPublicState(): { index: number; state: CardState; value?: string } {
    return {
      index: this.index,
      state: this.state,
      ...(this.state === "HIDDEN" ? {} : { value: this.value }),
    };
  }
}
