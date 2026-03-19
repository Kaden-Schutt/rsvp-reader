export type LlmProvider = "anthropic" | "openai";

export interface RsvpSettings {
  defaultWpm: number;
  defaultChunkSize: number;
  showContextPanel: boolean;
  pauseOnSectionChange: boolean;
  highlightStyle: "word" | "sentence";
  // LLM
  llmEnabled: boolean;
  llmProvider: LlmProvider;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  llmSystemPrompt: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are a reading companion. The user is speed-reading a document and may pause to ask questions, take notes, or think out loud about what they're reading.

You have access to:
- A summary of everything read so far in this session
- The text of the current section UP TO the user's reading position (not the full section)
- The user's position in the document

Important constraints:
- Only reference text the user has already read. The context you receive is truncated to their current position — do not speculate about what comes next.
- Do not reference upcoming sections or readings the user hasn't reached yet.
- Be concise. When referencing the text, quote specific passages from what's been read.
- If they share observations or notes, engage with those thoughtfully.`;

export const DEFAULT_SETTINGS: RsvpSettings = {
  defaultWpm: 300,
  defaultChunkSize: 1,
  showContextPanel: true,
  pauseOnSectionChange: true,
  highlightStyle: "word",
  llmEnabled: false,
  llmProvider: "anthropic",
  llmApiKey: "",
  llmModel: "claude-sonnet-4-6",
  llmBaseUrl: "",
  llmSystemPrompt: DEFAULT_SYSTEM_PROMPT,
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
  charOffset: number;
  charLength: number;
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
