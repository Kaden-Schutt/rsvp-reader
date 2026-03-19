import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import {
  VIEW_TYPE_RSVP,
  ParsedDocument,
  TickPayload,
  SectionChangePayload,
  ParagraphChangePayload,
} from "../types";
import { parseMarkdown, getAllTokens } from "../parser/markdown-parser";
import { RsvpEngine } from "../player/rsvp-engine";
import { WordDisplay } from "./word-display";
import { SectionHeader } from "./section-header";
import { ContextPanel } from "./context-panel";
import { RsvpControls } from "../player/rsvp-controls";
import { SummaryManager } from "../llm/summary-manager";
import type RsvpPlugin from "../main";

export class RsvpView extends ItemView {
  private plugin: RsvpPlugin;
  private engine: RsvpEngine | null = null;
  private wordDisplay: WordDisplay | null = null;
  private sectionHeader: SectionHeader | null = null;
  private contextPanel: ContextPanel | null = null;
  private controls: RsvpControls | null = null;
  private document: ParsedDocument | null = null;
  private filePath: string = "";
  private infoBar: HTMLElement | null = null;
  private wpmOverlay: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private summaryManager: SummaryManager | null = null;
  private prevSectionIndex = 0;

  constructor(leaf: WorkspaceLeaf, plugin: RsvpPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  get settings() {
    return this.plugin.settings;
  }

  getViewType(): string {
    return VIEW_TYPE_RSVP;
  }

  getDisplayText(): string {
    return this.document?.title ?? "RSVP Reader";
  }

  getIcon(): string {
    return "book-open";
  }

  async loadFile(file: TFile): Promise<void> {
    this.filePath = file.path;
    const content = await this.app.vault.cachedRead(file);
    this.document = parseMarkdown(content, file.basename);
    this.buildUI();
  }

  private buildUI(): void {
    if (!this.document) return;

    const container = this.contentEl;
    container.empty();
    container.addClass("rsvp-view-container");

    this.engine = new RsvpEngine(
      this.document,
      this.settings.defaultWpm,
      this.settings.defaultChunkSize
    );

    // Set up summary manager if LLM is available
    if (this.plugin.llmService) {
      this.summaryManager = new SummaryManager(
        this.plugin.llmService,
        this.document.title
      );
    }

    // Restore persisted session
    const session = this.plugin.sessionStore.getSession(this.filePath);
    if (session) {
      if (session.tokenIndex > 0) {
        this.engine.seekToToken(session.tokenIndex);
      }
      if (this.summaryManager) {
        this.summaryManager.restore(
          session.sectionSummaries,
          session.rollingSummary
        );
      }
      const chat = this.plugin.getChatPanel();
      if (chat) {
        chat.restoreMessages(session.messages);
        chat.summaryManager = this.summaryManager;
        chat.llmService = this.plugin.llmService;
      }
    }

    this.prevSectionIndex = 0;

    // === Top region ===
    const topRegion = container.createDiv({ cls: "rsvp-top-region" });

    this.infoBar = topRegion.createDiv({ cls: "rsvp-info-bar" });
    const infoLeft = this.infoBar.createDiv({ cls: "rsvp-info-left" });
    infoLeft.createDiv({
      cls: "rsvp-info-title",
      text: this.document.title,
    });
    infoLeft.createDiv({ cls: "rsvp-info-meta" });

    const centerWrap = topRegion.createDiv({ cls: "rsvp-center-wrap" });
    const readerWindow = centerWrap.createDiv({ cls: "rsvp-reader-window" });

    this.toastEl = readerWindow.createDiv({
      cls: "rsvp-toast rsvp-toast-hidden",
    });

    this.sectionHeader = new SectionHeader(readerWindow);
    if (this.document.sections.length > 0) {
      this.sectionHeader.update(this.document.sections[0].heading);
    }

    const readerArea = readerWindow.createDiv({ cls: "rsvp-reader-area" });
    readerArea.addEventListener("click", () => {
      this.engine?.togglePlayPause();
      this.contentEl.focus();
    });
    readerArea.style.cursor = "pointer";
    this.wordDisplay = new WordDisplay(readerArea);
    this.wordDisplay.clear();

    this.wpmOverlay = readerWindow.createDiv({ cls: "rsvp-wpm-overlay" });
    this.wpmOverlay.textContent = `${this.engine.getState().wpm} wpm`;

    // === Controls ===
    this.controls = new RsvpControls(container, this.engine, this.document);
    this.controls.onToggleContext = () => this.contextPanel?.toggleVisible();
    this.controls.onShowToast = (msg: string) => this.showToast(msg);
    this.controls.onToggleChat = () => this.openChat();
    this.controls.registerKeyboard(container);

    // === Context panel ===
    this.contextPanel = new ContextPanel(container);
    this.contextPanel.setVisible(this.settings.showContextPanel);
    this.contextPanel.onSeekToToken = (globalIndex: number) => {
      this.engine?.seekToToken(globalIndex);
    };
    if (this.document.sections.length > 0) {
      this.contextPanel.setSection(this.document.sections[0], 0);
    }

    // === Wire engine events ===
    this.engine.on("tick", (payload: TickPayload) => {
      this.wordDisplay?.update(payload.tokens);
      if (payload.tokens.length > 0 && this.contextPanel) {
        this.contextPanel.highlightToken(payload.tokens[0]);
      }
      this.updateInfoBar(payload.state.currentTokenIndex, payload.state);

      // Update chat panel position
      if (payload.tokens.length > 0) {
        const token = payload.tokens[0];
        const chat = this.plugin.getChatPanel();
        if (chat && this.document) {
          chat.updatePosition(
            this.document.sections[token.sectionIndex],
            token.sectionIndex,
            payload.state.currentTokenIndex,
            payload.state.totalTokens
          );
        }
      }
    });

    this.engine.on("stateChange", () => {
      const state = this.engine?.getState();
      if (state && this.wpmOverlay) {
        this.wpmOverlay.textContent = `${state.wpm} wpm`;
      }
      // Persist on pause
      if (state?.status === "paused") {
        this.persistSession();
      }
    });

    this.engine.on("sectionChange", (payload: SectionChangePayload) => {
      this.sectionHeader?.update(payload.section.heading);
      this.contextPanel?.setSection(payload.section, payload.sectionIndex);
      this.controls?.setCurrentSection(payload.sectionIndex);

      // Summarize the completed section
      if (
        this.summaryManager &&
        this.document &&
        this.prevSectionIndex !== payload.sectionIndex
      ) {
        const prevSection = this.document.sections[this.prevSectionIndex];
        if (prevSection) {
          this.summaryManager
            .onSectionComplete(this.prevSectionIndex, prevSection)
            .catch(() => {});
        }
      }
      this.prevSectionIndex = payload.sectionIndex;

      if (this.settings.pauseOnSectionChange) {
        this.engine?.pause();
      }
    });

    this.engine.on("paragraphChange", (_payload: ParagraphChangePayload) => {});

    this.engine.on("complete", () => {
      this.wordDisplay?.clear();
      // Summarize final section
      if (this.summaryManager && this.document) {
        const lastSection = this.document.sections[this.prevSectionIndex];
        if (lastSection) {
          this.summaryManager
            .onSectionComplete(this.prevSectionIndex, lastSection)
            .catch(() => {});
        }
      }
    });

    this.updateInfoBar(0, this.engine.getState());
    container.focus();
  }

  private async openChat(): Promise<void> {
    // Auto-pause when opening chat
    this.engine?.pause();
    const chat = await this.plugin.toggleChatPanel();
    if (chat) {
      chat.summaryManager = this.summaryManager;
      chat.llmService = this.plugin.llmService;
      chat.systemPrompt = this.plugin.settings.llmSystemPrompt;
      chat.sourceFilePath = this.filePath;
      chat.onMessagesChanged = () => this.persistSession();

      // Restore messages from session if chat was just opened fresh
      if (chat.getMessages().length === 0) {
        const session = this.plugin.sessionStore.getSession(this.filePath);
        if (session && session.messages.length > 0) {
          chat.restoreMessages(session.messages);
        }
      }

      if (this.document && this.engine) {
        const token = this.engine.getCurrentToken();
        const si = token?.sectionIndex ?? 0;
        chat.updatePosition(
          this.document.sections[si],
          si,
          this.engine.getState().currentTokenIndex,
          this.engine.getState().totalTokens
        );
      }
    }
  }

  private showToast(message: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.remove("rsvp-toast-hidden");
    this.toastEl.classList.add("rsvp-toast-visible");

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl?.classList.remove("rsvp-toast-visible");
      this.toastEl?.classList.add("rsvp-toast-hidden");
    }, 1200);
  }

  private updateInfoBar(
    currentIndex: number,
    state: { totalTokens: number; wpm: number }
  ): void {
    if (!this.infoBar) return;
    const meta = this.infoBar.querySelector(".rsvp-info-meta") as HTMLElement;
    if (!meta) return;

    const remaining = state.totalTokens - currentIndex;
    const totalMinutes = remaining / state.wpm;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.ceil(totalMinutes % 60);

    let timeStr: string;
    if (remaining <= 0) {
      timeStr = "done";
    } else if (hours > 0) {
      timeStr = `${hours}h ${mins}m left`;
    } else if (mins <= 1) {
      timeStr = "< 1 min left";
    } else {
      timeStr = `${mins} min left`;
    }

    meta.textContent = `${currentIndex} / ${state.totalTokens} words \u00B7 ${timeStr}`;
  }

  /** Persist current session state (debounced by SessionStore) */
  private persistSession(): void {
    if (!this.filePath) return;
    const chat = this.plugin.getChatPanel();
    this.plugin.sessionStore.saveSession({
      filePath: this.filePath,
      tokenIndex: this.engine?.getState().currentTokenIndex ?? 0,
      messages: chat?.getMessages() ?? [],
      sectionSummaries: this.summaryManager?.getSectionSummaries() ?? [],
      rollingSummary: this.summaryManager?.getRollingSummary() ?? "",
      lastAccessed: Date.now(),
    });
  }

  async onClose(): Promise<void> {
    this.persistSession();
    await this.plugin.sessionStore.persist();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.engine?.pause();
    this.engine = null;
    this.summaryManager = null;
  }

  getState(): Record<string, any> {
    return {
      filePath: this.filePath,
      tokenIndex: this.engine?.getState().currentTokenIndex ?? 0,
    };
  }

  async setState(state: Record<string, any>, result: any): Promise<void> {
    if (state.filePath) {
      const file = this.app.vault.getAbstractFileByPath(state.filePath);
      if (file instanceof TFile) {
        await this.loadFile(file);
        if (state.tokenIndex && this.engine) {
          this.engine.seekToToken(state.tokenIndex);
        }
      }
    }
    await super.setState(state, result);
  }
}
