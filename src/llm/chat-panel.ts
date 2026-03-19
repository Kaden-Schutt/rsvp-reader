import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHAT, Section, DEFAULT_SYSTEM_PROMPT } from "../types";
import { LlmService, LlmMessage } from "./llm-service";
import { SummaryManager } from "./summary-manager";
import { ChatMessage } from "./session-store";

const MAX_HISTORY = 6;

export class ChatPanel extends ItemView {
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private messages: ChatMessage[] = [];
  private isLoading = false;

  // Set by the plugin/view
  llmService: LlmService | null = null;
  summaryManager: SummaryManager | null = null;
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT;
  currentSection: Section | null = null;
  currentSectionIndex = 0;
  currentTokenIndex = 0;
  totalTokens = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText(): string {
    return "Reading Partner";
  }

  getIcon(): string {
    return "message-circle";
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("rsvp-chat-panel");

    // Header
    const header = container.createDiv({ cls: "rsvp-chat-header" });
    header.createDiv({ cls: "rsvp-chat-title", text: "Reading Partner" });
    this.statusEl = header.createDiv({ cls: "rsvp-chat-status" });
    this.updateStatus();

    // Messages area
    this.messagesEl = container.createDiv({ cls: "rsvp-chat-messages" });

    if (!this.llmService) {
      this.messagesEl.createDiv({
        cls: "rsvp-chat-notice",
        text: "Set your Anthropic API key in RSVP Reader settings to enable the reading partner.",
      });
    } else {
      this.messagesEl.createDiv({
        cls: "rsvp-chat-notice",
        text: "Pause the reader and ask a question about what you're reading.",
      });
    }

    // Input area
    const inputArea = container.createDiv({ cls: "rsvp-chat-input-area" });
    this.inputEl = inputArea.createEl("textarea", {
      cls: "rsvp-chat-input",
      attr: { placeholder: "Ask about the text...", rows: "2" },
    });
    this.sendBtn = inputArea.createEl("button", {
      cls: "rsvp-chat-send",
      text: "Send",
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    this.sendBtn.addEventListener("click", () => this.handleSend());
  }

  private async handleSend(): Promise<void> {
    if (!this.inputEl || this.isLoading) return;
    const text = this.inputEl.value.trim();
    if (!text) return;

    if (!this.llmService) {
      this.addMessage({
        role: "assistant",
        content:
          "Please set your Anthropic API key in Settings > RSVP Reader to use the reading partner.",
      });
      return;
    }

    this.inputEl.value = "";
    this.addMessage({ role: "user", content: text });
    this.setLoading(true);

    try {
      // Build context
      let contextBlock = "";
      if (this.summaryManager && this.currentSection) {
        const ctx = this.summaryManager.getReadingContext(
          this.currentSection,
          this.currentSectionIndex,
          this.currentTokenIndex,
          this.totalTokens
        );
        contextBlock = [
          `Document: ${ctx.documentTitle}`,
          `Progress: ${ctx.currentTokenIndex}/${ctx.totalTokens} words`,
          `\nSummary of prior sections:\n${ctx.rollingSummary}`,
          `\nCurrent section "${ctx.currentSectionHeading}":\n${ctx.currentSectionText}`,
        ].join("\n");
      }

      // Build messages for the API
      const apiMessages: LlmMessage[] = [];

      // Include recent chat history
      const recentHistory = this.messages.slice(-(MAX_HISTORY + 1), -1);
      for (const msg of recentHistory) {
        apiMessages.push({ role: msg.role, content: msg.content });
      }

      // Current user message with context
      const userMsg = contextBlock
        ? `[Reading context:\n${contextBlock}]\n\nQuestion: ${text}`
        : text;
      apiMessages.push({ role: "user", content: userMsg });

      const response = await this.llmService.sendMessage({
        systemPrompt: this.systemPrompt,
        messages: apiMessages,
        maxTokens: 1024,
      });

      this.addMessage({ role: "assistant", content: response.content });
    } catch (err: any) {
      this.addMessage({
        role: "assistant",
        content: `Error: ${err.message ?? "Failed to get response"}`,
      });
    } finally {
      this.setLoading(false);
    }
  }

  /** Called whenever messages change so the session can be persisted */
  onMessagesChanged?: () => void;

  private addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    this.renderMessage(msg);
    this.onMessagesChanged?.();
  }

  private renderMessage(msg: ChatMessage): void {
    if (!this.messagesEl) return;

    // Remove initial notice if this is the first real message
    const notice = this.messagesEl.querySelector(".rsvp-chat-notice");
    if (notice) notice.remove();

    const bubble = this.messagesEl.createDiv({
      cls: `rsvp-chat-msg rsvp-chat-${msg.role}`,
    });
    // Render with basic markdown-like formatting
    bubble.textContent = msg.content;

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    if (this.sendBtn) {
      this.sendBtn.textContent = loading ? "..." : "Send";
      this.sendBtn.disabled = loading;
    }
    if (this.inputEl) {
      this.inputEl.disabled = loading;
    }

    // Show/remove thinking indicator
    if (loading && this.messagesEl) {
      const thinking = this.messagesEl.createDiv({
        cls: "rsvp-chat-msg rsvp-chat-assistant rsvp-chat-thinking",
        text: "Thinking...",
      });
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    } else {
      this.messagesEl
        ?.querySelector(".rsvp-chat-thinking")
        ?.remove();
    }
  }

  updatePosition(
    section: Section,
    sectionIndex: number,
    tokenIndex: number,
    totalTokens: number
  ): void {
    this.currentSection = section;
    this.currentSectionIndex = sectionIndex;
    this.currentTokenIndex = tokenIndex;
    this.totalTokens = totalTokens;
    this.updateStatus();
  }

  private updateStatus(): void {
    if (!this.statusEl) return;
    if (!this.llmService) {
      this.statusEl.textContent = "No API key";
      this.statusEl.classList.add("rsvp-chat-status-error");
    } else if (this.currentSection) {
      this.statusEl.textContent = this.currentSection.heading;
      this.statusEl.classList.remove("rsvp-chat-status-error");
    } else {
      this.statusEl.textContent = "Ready";
      this.statusEl.classList.remove("rsvp-chat-status-error");
    }
  }

  clearMessages(): void {
    this.messages = [];
    if (this.messagesEl) {
      this.messagesEl.empty();
      this.messagesEl.createDiv({
        cls: "rsvp-chat-notice",
        text: "Pause the reader and ask a question about what you're reading.",
      });
    }
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /** Restore messages from a persisted session */
  restoreMessages(messages: ChatMessage[]): void {
    this.messages = [...messages];
    if (this.messagesEl) {
      this.messagesEl.empty();
      if (messages.length === 0) {
        this.messagesEl.createDiv({
          cls: "rsvp-chat-notice",
          text: "Pause the reader and ask a question about what you're reading.",
        });
      } else {
        for (const msg of this.messages) {
          this.renderMessage(msg);
        }
      }
    }
  }

  async onClose(): Promise<void> {}
}
