import type RsvpPlugin from "../main";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SectionSummaryData {
  sectionIndex: number;
  heading: string;
  summary: string;
}

export interface SessionData {
  filePath: string;
  tokenIndex: number;
  messages: ChatMessage[];
  sectionSummaries: SectionSummaryData[];
  rollingSummary: string;
  lastAccessed: number;
}

const STORAGE_KEY = "rsvp-sessions";
const MAX_SESSIONS = 20;

/**
 * Persists reading sessions (chat history, summaries, position)
 * per document in the plugin's data.json.
 */
export class SessionStore {
  private sessions: Record<string, SessionData> = {};
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private plugin: RsvpPlugin) {}

  async load(): Promise<void> {
    const allData = await this.plugin.loadData();
    this.sessions = allData?.[STORAGE_KEY] ?? {};
  }

  getSession(filePath: string): SessionData | null {
    return this.sessions[filePath] ?? null;
  }

  saveSession(data: SessionData): void {
    data.lastAccessed = Date.now();
    this.sessions[data.filePath] = data;
    this.pruneOldSessions();
    this.debouncedPersist();
  }

  deleteSession(filePath: string): void {
    delete this.sessions[filePath];
    this.debouncedPersist();
  }

  private pruneOldSessions(): void {
    const keys = Object.keys(this.sessions);
    if (keys.length <= MAX_SESSIONS) return;

    // Sort by lastAccessed, remove oldest
    const sorted = keys.sort(
      (a, b) =>
        (this.sessions[a].lastAccessed ?? 0) -
        (this.sessions[b].lastAccessed ?? 0)
    );
    while (sorted.length > MAX_SESSIONS) {
      const oldest = sorted.shift()!;
      delete this.sessions[oldest];
    }
  }

  private debouncedPersist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 2000);
  }

  async persist(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const allData = (await this.plugin.loadData()) ?? {};
    allData[STORAGE_KEY] = this.sessions;
    await this.plugin.saveData(allData);
  }
}
