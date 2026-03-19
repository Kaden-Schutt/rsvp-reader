import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import {
  VIEW_TYPE_RSVP,
  ParsedDocument,
  RsvpSettings,
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

export class RsvpView extends ItemView {
  private engine: RsvpEngine | null = null;
  private wordDisplay: WordDisplay | null = null;
  private sectionHeader: SectionHeader | null = null;
  private contextPanel: ContextPanel | null = null;
  private controls: RsvpControls | null = null;
  private document: ParsedDocument | null = null;
  private filePath: string = "";
  private settings: RsvpSettings;
  private infoBar: HTMLElement | null = null;
  private wpmOverlay: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, settings: RsvpSettings) {
    super(leaf);
    this.settings = settings;
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

    // === Top region: centers the reader window vertically in available space ===
    const topRegion = container.createDiv({ cls: "rsvp-top-region" });

    // Info bar
    this.infoBar = topRegion.createDiv({ cls: "rsvp-info-bar" });
    const infoLeft = this.infoBar.createDiv({ cls: "rsvp-info-left" });
    infoLeft.createDiv({
      cls: "rsvp-info-title",
      text: this.document.title,
    });
    infoLeft.createDiv({ cls: "rsvp-info-meta" });

    // Centering wrapper — pushes window to vertical center of remaining space
    const centerWrap = topRegion.createDiv({ cls: "rsvp-center-wrap" });

    // Reader window (fixed size)
    const readerWindow = centerWrap.createDiv({ cls: "rsvp-reader-window" });

    // Toast
    this.toastEl = readerWindow.createDiv({
      cls: "rsvp-toast rsvp-toast-hidden",
    });

    // Section header
    this.sectionHeader = new SectionHeader(readerWindow);
    if (this.document.sections.length > 0) {
      this.sectionHeader.update(this.document.sections[0].heading);
    }

    // Word display — click anywhere in reader to play/pause
    const readerArea = readerWindow.createDiv({ cls: "rsvp-reader-area" });
    readerArea.addEventListener("click", () => this.engine?.togglePlayPause());
    readerArea.style.cursor = "pointer";
    this.wordDisplay = new WordDisplay(readerArea);
    this.wordDisplay.clear();

    // WPM overlay
    this.wpmOverlay = readerWindow.createDiv({ cls: "rsvp-wpm-overlay" });
    this.wpmOverlay.textContent = `${this.engine.getState().wpm} wpm`;

    // === Controls ===
    this.controls = new RsvpControls(container, this.engine, this.document);
    this.controls.onToggleContext = () => this.contextPanel?.toggleVisible();
    this.controls.onShowToast = (msg: string) => this.showToast(msg);
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
    });

    this.engine.on("stateChange", () => {
      const state = this.engine?.getState();
      if (state && this.wpmOverlay) {
        this.wpmOverlay.textContent = `${state.wpm} wpm`;
      }
    });

    this.engine.on("sectionChange", (payload: SectionChangePayload) => {
      this.sectionHeader?.update(payload.section.heading);
      this.contextPanel?.setSection(payload.section, payload.sectionIndex);
      this.controls?.setCurrentSection(payload.sectionIndex);

      if (this.settings.pauseOnSectionChange) {
        this.engine?.pause();
      }
    });

    this.engine.on("paragraphChange", (_payload: ParagraphChangePayload) => {});

    this.engine.on("complete", () => {
      this.wordDisplay?.clear();
    });

    this.updateInfoBar(0, this.engine.getState());
    container.focus();
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

  async onClose(): Promise<void> {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.engine?.pause();
    this.engine = null;
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
