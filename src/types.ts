export interface RsvpSettings {
  defaultWpm: number;
  defaultChunkSize: number;
  showContextPanel: boolean;
  pauseOnSectionChange: boolean;
  highlightStyle: "word" | "sentence";
  // Phase 2
  llmEnabled: boolean;
  llmApiKey: string;
  llmModel: string;
}

export const DEFAULT_SETTINGS: RsvpSettings = {
  defaultWpm: 300,
  defaultChunkSize: 1,
  showContextPanel: true,
  pauseOnSectionChange: true,
  highlightStyle: "word",
  llmEnabled: false,
  llmApiKey: "",
  llmModel: "claude-sonnet-4-6",
};

export interface ParsedDocument {
  title: string;
  sections: Section[];
}

export interface Section {
  heading: string;
  level: number;
  paragraphs: Paragraph[];
}

export interface Paragraph {
  text: string;
  tokens: Token[];
}

export interface Token {
  word: string;
  sectionIndex: number;
  paragraphIndex: number;
  /** Character offset within the paragraph text */
  charOffset: number;
  /** Length of the original word in the source text */
  charLength: number;
  /** Global token index across the entire document */
  globalIndex: number;
}

export interface PlaybackState {
  status: "idle" | "playing" | "paused";
  currentTokenIndex: number;
  wpm: number;
  chunkSize: number;
  totalTokens: number;
}

export type EngineEvent =
  | "tick"
  | "sectionChange"
  | "paragraphChange"
  | "complete"
  | "stateChange";

export interface TickPayload {
  tokens: Token[];
  state: PlaybackState;
}

export interface SectionChangePayload {
  sectionIndex: number;
  section: Section;
}

export interface ParagraphChangePayload {
  sectionIndex: number;
  paragraphIndex: number;
  paragraph: Paragraph;
}

export const VIEW_TYPE_RSVP = "rsvp-reader";
export const VIEW_TYPE_CHAT = "rsvp-chat";
