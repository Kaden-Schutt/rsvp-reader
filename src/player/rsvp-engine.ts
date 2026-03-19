import {
  ParsedDocument,
  Token,
  PlaybackState,
  EngineEvent,
  TickPayload,
  SectionChangePayload,
  ParagraphChangePayload,
} from "../types";
import { getAllTokens } from "../parser/markdown-parser";

type EventCallback = (payload: any) => void;

export class RsvpEngine {
  private tokens: Token[];
  private state: PlaybackState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<EngineEvent, EventCallback[]> = new Map();
  private document: ParsedDocument;

  /** Indices of tokens that start a sentence (after . ! ? or paragraph start) */
  private sentenceStarts: number[] = [];

  constructor(doc: ParsedDocument, wpm: number, chunkSize: number) {
    this.document = doc;
    this.tokens = getAllTokens(doc);
    this.state = {
      status: "idle",
      currentTokenIndex: 0,
      wpm,
      chunkSize,
      totalTokens: this.tokens.length,
    };
    this.buildSentenceIndex();
  }

  private buildSentenceIndex(): void {
    // First token is always a sentence start
    if (this.tokens.length > 0) this.sentenceStarts.push(0);

    for (let i = 0; i < this.tokens.length; i++) {
      const word = this.tokens[i].word;
      // If this word ends with sentence-ending punctuation,
      // the next token starts a new sentence
      if (/[.!?]["'\u201D\u2019)]*$/.test(word) && i + 1 < this.tokens.length) {
        // Also treat paragraph boundaries as sentence starts
        if (!this.sentenceStarts.includes(i + 1)) {
          this.sentenceStarts.push(i + 1);
        }
      }
      // Paragraph/section boundary = sentence start
      if (
        i + 1 < this.tokens.length &&
        (this.tokens[i + 1].paragraphIndex !== this.tokens[i].paragraphIndex ||
          this.tokens[i + 1].sectionIndex !== this.tokens[i].sectionIndex)
      ) {
        if (!this.sentenceStarts.includes(i + 1)) {
          this.sentenceStarts.push(i + 1);
        }
      }
    }
    this.sentenceStarts.sort((a, b) => a - b);
  }

  on(event: EngineEvent, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  private emit(event: EngineEvent, payload: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) cb(payload);
    }
  }

  play(): void {
    if (this.state.status === "playing") return;
    if (this.state.currentTokenIndex >= this.tokens.length) return;

    this.state.status = "playing";
    this.emit("stateChange", { ...this.state });
    this.startTimer();
  }

  pause(): void {
    if (this.state.status !== "playing") return;
    this.stopTimer();
    this.state.status = "paused";
    this.emit("stateChange", { ...this.state });
  }

  togglePlayPause(): void {
    if (this.state.status === "playing") {
      this.pause();
    } else {
      this.play();
    }
  }

  reset(): void {
    this.stopTimer();
    this.state.status = "idle";
    this.state.currentTokenIndex = 0;
    this.emit("stateChange", { ...this.state });
  }

  seekToToken(index: number): void {
    const wasPaused = this.state.status !== "playing";
    this.stopTimer();
    this.state.currentTokenIndex = Math.max(
      0,
      Math.min(index, this.tokens.length - 1)
    );
    this.emitCurrentTick();
    this.emitBoundaryEvents();
    if (!wasPaused) {
      this.startTimer();
    }
  }

  seekToSection(sectionIndex: number): void {
    const token = this.tokens.find((t) => t.sectionIndex === sectionIndex);
    if (token) {
      this.seekToToken(token.globalIndex);
    }
  }

  /** Jump to the start of the current or previous sentence */
  seekPrevSentence(): void {
    const cur = this.state.currentTokenIndex;
    // Find the sentence start at or before current position,
    // but if we're already at a sentence start, go to the previous one
    for (let i = this.sentenceStarts.length - 1; i >= 0; i--) {
      if (this.sentenceStarts[i] < cur) {
        this.seekToToken(this.sentenceStarts[i]);
        return;
      }
    }
    this.seekToToken(0);
  }

  /** Jump to the start of the next sentence */
  seekNextSentence(): void {
    const cur = this.state.currentTokenIndex;
    for (const start of this.sentenceStarts) {
      if (start > cur) {
        this.seekToToken(start);
        return;
      }
    }
  }

  /** Jump to the start of the current paragraph */
  seekParagraphStart(): void {
    const cur = this.tokens[this.state.currentTokenIndex];
    if (!cur) return;
    // Find first token with same section + paragraph
    const target = this.tokens.find(
      (t) =>
        t.sectionIndex === cur.sectionIndex &&
        t.paragraphIndex === cur.paragraphIndex
    );
    if (target) this.seekToToken(target.globalIndex);
  }

  /** Jump to the start of the next paragraph */
  seekNextParagraph(): void {
    const cur = this.tokens[this.state.currentTokenIndex];
    if (!cur) return;
    const target = this.tokens.find(
      (t) =>
        t.globalIndex > cur.globalIndex &&
        (t.paragraphIndex !== cur.paragraphIndex ||
          t.sectionIndex !== cur.sectionIndex)
    );
    if (target) this.seekToToken(target.globalIndex);
  }

  setWpm(wpm: number): void {
    this.state.wpm = Math.max(50, Math.min(1500, wpm));
    if (this.state.status === "playing") {
      this.stopTimer();
      this.startTimer();
    }
    this.emit("stateChange", { ...this.state });
  }

  setChunkSize(size: number): void {
    this.state.chunkSize = Math.max(1, Math.min(5, size));
    this.emit("stateChange", { ...this.state });
  }

  getState(): PlaybackState {
    return { ...this.state };
  }

  getDocument(): ParsedDocument {
    return this.document;
  }

  getCurrentToken(): Token | null {
    return this.tokens[this.state.currentTokenIndex] ?? null;
  }

  private startTimer(): void {
    const intervalMs = 60000 / this.state.wpm;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (this.state.currentTokenIndex >= this.tokens.length) {
      this.stopTimer();
      this.state.status = "paused";
      this.emit("complete", null);
      this.emit("stateChange", { ...this.state });
      return;
    }

    const prevToken = this.tokens[this.state.currentTokenIndex];
    this.emitCurrentTick();

    const nextIndex = this.state.currentTokenIndex + this.state.chunkSize;
    this.state.currentTokenIndex = Math.min(nextIndex, this.tokens.length);

    if (this.state.currentTokenIndex < this.tokens.length) {
      const nextToken = this.tokens[this.state.currentTokenIndex];
      if (nextToken.sectionIndex !== prevToken.sectionIndex) {
        this.emit("sectionChange", {
          sectionIndex: nextToken.sectionIndex,
          section: this.document.sections[nextToken.sectionIndex],
        } as SectionChangePayload);
      }
      if (
        nextToken.paragraphIndex !== prevToken.paragraphIndex ||
        nextToken.sectionIndex !== prevToken.sectionIndex
      ) {
        this.emit("paragraphChange", {
          sectionIndex: nextToken.sectionIndex,
          paragraphIndex: nextToken.paragraphIndex,
          paragraph:
            this.document.sections[nextToken.sectionIndex].paragraphs[
              nextToken.paragraphIndex
            ],
        } as ParagraphChangePayload);
      }
    }
  }

  private emitCurrentTick(): void {
    const chunk: Token[] = [];
    for (
      let i = 0;
      i < this.state.chunkSize &&
      this.state.currentTokenIndex + i < this.tokens.length;
      i++
    ) {
      chunk.push(this.tokens[this.state.currentTokenIndex + i]);
    }
    this.emit("tick", {
      tokens: chunk,
      state: { ...this.state },
    } as TickPayload);
  }

  private emitBoundaryEvents(): void {
    const token = this.tokens[this.state.currentTokenIndex];
    if (!token) return;
    this.emit("sectionChange", {
      sectionIndex: token.sectionIndex,
      section: this.document.sections[token.sectionIndex],
    } as SectionChangePayload);
  }
}
