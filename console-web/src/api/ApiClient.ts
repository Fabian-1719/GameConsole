export interface Game {
  id: string;
  name: string;
  description: string;
  version: string;
}

export interface MatchSummary {
  matchId: string;
  gameId: string;
  status: string;
  startedAt: string;
  playersCount: number;
}

export interface CreateMatchResponse {
  matchId: string;
  gameId: string;
  playerId: string;
}

export class ApiClient {
  private readonly fetcher: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher = fetcher ?? ((url, init) => globalThis.fetch(url, init));
  }

  public getGames(): Promise<Game[]> {
    return this.request<Game[]>("/api/games");
  }

  public getMatches(): Promise<MatchSummary[]> {
    return this.request<MatchSummary[]>("/api/matches");
  }

  public createMatch(
    gameId: string,
    options: Record<string, unknown> = {}
  ): Promise<CreateMatchResponse> {
    return this.request<CreateMatchResponse>("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, options }),
    });
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(url, init);
    if (!response.ok) {
      throw new Error(`API respondió HTTP ${response.status} en ${url}`);
    }
    return (await response.json()) as T;
  }
}
