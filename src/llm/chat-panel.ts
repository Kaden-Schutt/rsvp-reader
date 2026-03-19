import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { VIEW_TYPE_CHAT, Section, DEFAULT_SYSTEM_PROMPT } from "../types";
import { LlmService, LlmMessage } from "./llm-service";
import { SummaryManager } from "./summary-manager";
import { ChatMessage } from "./session-store";

const MAX_HISTORY = 20;

export class ChatPanel extends ItemView {
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private appendBtn: HTMLButtonElement | null = null;
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
  /** Path of the source file being read */
  sourceFilePath = "";

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
    const headerTop = header.createDiv({ cls: "rsvp-chat-header-top" });
    headerTop.createDiv({ cls: "rsvp-chat-title", text: "Reading Partner" });

    // Append to notes button
    this.appendBtn = headerTop.createEl("button", {
      cls: "rsvp-chat-append-btn",
      text: "Append to Notes",
    });
    this.appendBtn.addEventListener("click", () => this.handleAppend());

    this.statusEl = header.createDiv({ cls: "rsvp-chat-status" });
    this.updateStatus();

    // Messages area
    this.messagesEl = container.createDiv({ cls: "rsvp-chat-messages" });

    if (!this.llmService) {
      this.messagesEl.createDiv({
        cls: "rsvp-chat-notice",
        text: "Set your API key in RSVP Reader settings to enable the reading partner.",
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
          "Please set your API key in Settings > RSVP Reader to use the reading partner.",
      });
      return;
    }

    this.inputEl.value = "";
    this.addMessage({ role: "user", content: text });
    this.setLoading(true);

    try {
      let contextBlock = "";
      if (this.summaryManager && this.currentSection) {
        const ctx = this.summaryManager.getReadingContext(
          this.currentSection,
          this.currentSectionIndex,
          this.currentTokenIndex,
          this.totalTokens,
          this.sourceFilePath
        );
        contextBlock = [
          `Document: ${ctx.documentTitle}`,
          `File: ${ctx.filePath}`,
          `Progress: ${ctx.currentTokenIndex}/${ctx.totalTokens} words`,
          `\nSummary of prior sections:\n${ctx.rollingSummary}`,
          `\nCurrent section "${ctx.currentSectionHeading}":\n${ctx.currentSectionText}`,
        ].join("\n");
      }

      const apiMessages: LlmMessage[] = [];

      const recentHistory = this.messages.slice(-(MAX_HISTORY + 1), -1);
      for (const msg of recentHistory) {
        apiMessages.push({ role: msg.role, content: msg.content });
      }

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

  /**
   * Append chat conversation to the corresponding notes file.
   * Finds the notes file by replacing "Source Texts" with
   * "Readings with transcribed commentary" in the filename.
   * Falls back to creating a new file with "-chat" suffix.
   */
  private async handleAppend(): Promise<void> {
    if (this.messages.length === 0) {
      new Notice("No messages to append.");
      return;
    }

    const notesPath = this.findNotesPath();
    if (!notesPath) {
      new Notice("Could not determine notes file. Open a source text first.");
      return;
    }

    // Format messages
    const sectionHeading = this.currentSection?.heading ?? "Reading";
    const timestamp = new Date().toLocaleString();
    let block = `\n\n#### RSVP Chat — ${sectionHeading} (${timestamp})\n`;
    block += `*Appended from RSVP Reader chat*\n\n`;

    for (const msg of this.messages) {
      const prefix = msg.role === "user" ? "**Me:**" : "**Reading Partner:**";
      block += `${prefix} ${msg.content}\n\n`;
    }

    block += `---\n`;

    // Append to file
    const vault = this.app.vault;
    let file = vault.getAbstractFileByPath(notesPath);

    if (file instanceof TFile) {
      await vault.append(file, block);
      new Notice(`Appended to ${file.basename}`);
    } else {
      // Create the file
      file = await vault.create(notesPath, block);
      new Notice(`Created ${notesPath}`);
    }
  }

  private findNotesPath(): string | null {
    if (!this.sourceFilePath) return null;

    // Try: replace "Source Texts" with "Readings with transcribed commentary"
    if (this.sourceFilePath.includes("Source Texts")) {
      return this.sourceFilePath.replace(
        "Source Texts",
        "Readings with transcribed commentary"
      );
    }

    // Fallback: same folder, append "-chat" before extension
    const lastDot = this.sourceFilePath.lastIndexOf(".");
    if (lastDot > 0) {
      return (
        this.sourceFilePath.slice(0, lastDot) +
        "-chat" +
        this.sourceFilePath.slice(lastDot)
      );
    }

    return this.sourceFilePath + "-chat.md";
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

    const notice = this.messagesEl.querySelector(".rsvp-chat-notice");
    if (notice) notice.remove();

    const bubble = this.messagesEl.createDiv({
      cls: `rsvp-chat-msg rsvp-chat-${msg.role}`,
    });
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

    if (loading && this.messagesEl) {
      this.messagesEl.createDiv({
        cls: "rsvp-chat-msg rsvp-chat-assistant rsvp-chat-thinking",
        text: "Thinking...",
      });
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    } else {
      this.messagesEl?.querySelector(".rsvp-chat-thinking")?.remove();
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
