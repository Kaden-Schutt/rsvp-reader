import { RsvpEngine } from "./rsvp-engine";
import { ParsedDocument, PlaybackState } from "../types";
import {
  ICON_PLAY,
  ICON_PAUSE,
  ICON_PREV,
  ICON_NEXT,
  ICON_MINUS,
  ICON_PLUS,
} from "../icons";

const WPM_PRESETS = [
  { wpm: 200, label: "Beginner" },
  { wpm: 250, label: "Average" },
  { wpm: 300, label: "Fast" },
  { wpm: 450, label: "Advanced" },
  { wpm: 500, label: "Expert" },
];

export class RsvpControls {
  private container: HTMLElement;
  private playBtn: HTMLButtonElement;
  private wpmSlider: HTMLInputElement;
  private wpmValueLabel: HTMLSpanElement;
  private presetBtns: HTMLButtonElement[] = [];
  private chunkSelect: HTMLSelectElement;
  private progressBar: HTMLDivElement;
  private progressFill: HTMLDivElement;
  private progressLabel: HTMLSpanElement;
  private timeLeftLabel: HTMLSpanElement;
  private sectionSelect: HTMLSelectElement;
  private toolbarVisible = true;
  private wordScrubbing = false;

  /** Persistent shortcut hints shown even when toolbar is hidden */
  private persistentHints: HTMLElement;

  onToggleContext?: () => void;
  onShowToast?: (message: string) => void;

  /** Double-tap tracking for arrow keys */
  private lastLeftTap = 0;
  private lastRightTap = 0;
  private doubleTapWindow = 350; // ms

  constructor(
    parent: HTMLElement,
    private engine: RsvpEngine,
    doc: ParsedDocument
  ) {
    this.container = parent.createDiv({ cls: "rsvp-controls" });

    // --- Navigation row: < ▶ > ---
    const navRow = this.container.createDiv({ cls: "rsvp-nav-row" });

    const prevBtn = navRow.createEl("button", { cls: "rsvp-nav-btn" });
    prevBtn.innerHTML = ICON_PREV;
    prevBtn.setAttribute("aria-label", "Previous sentence");
    prevBtn.addEventListener("click", () => {
      engine.seekPrevSentence();
      this.onShowToast?.("Previous sentence");
    });

    this.playBtn = navRow.createEl("button", { cls: "rsvp-play-btn" });
    this.playBtn.innerHTML = ICON_PLAY;
    this.playBtn.addEventListener("click", () => engine.togglePlayPause());

    const nextBtn = navRow.createEl("button", { cls: "rsvp-nav-btn" });
    nextBtn.innerHTML = ICON_NEXT;
    nextBtn.setAttribute("aria-label", "Next sentence");
    nextBtn.addEventListener("click", () => {
      engine.seekNextSentence();
      this.onShowToast?.("Next sentence");
    });

    // --- Speed panel ---
    const speedPanel = this.container.createDiv({ cls: "rsvp-speed-panel" });

    const speedHeader = speedPanel.createDiv({ cls: "rsvp-speed-header" });
    speedHeader.createSpan({ text: "Reading Speed" });
    this.wpmValueLabel = speedHeader.createSpan({ cls: "rsvp-wpm-big" });
    this.wpmValueLabel.innerHTML = `<strong>${engine.getState().wpm}</strong> wpm`;

    const sliderRow = speedPanel.createDiv({ cls: "rsvp-slider-row" });
    const minusBtn = sliderRow.createEl("button", {
      cls: "rsvp-speed-adj-btn",
    });
    minusBtn.innerHTML = ICON_MINUS;
    minusBtn.addEventListener("click", () =>
      engine.setWpm(engine.getState().wpm - 25)
    );

    this.wpmSlider = sliderRow.createEl("input", {
      type: "range",
      cls: "rsvp-wpm-slider",
    });
    this.wpmSlider.min = "50";
    this.wpmSlider.max = "1000";
    this.wpmSlider.step = "25";
    this.wpmSlider.value = String(engine.getState().wpm);
    this.wpmSlider.addEventListener("input", () => {
      engine.setWpm(parseInt(this.wpmSlider.value));
    });

    const plusBtn = sliderRow.createEl("button", {
      cls: "rsvp-speed-adj-btn",
    });
    plusBtn.innerHTML = ICON_PLUS;
    plusBtn.addEventListener("click", () =>
      engine.setWpm(engine.getState().wpm + 25)
    );

    // Preset buttons
    const presetsRow = speedPanel.createDiv({ cls: "rsvp-presets-row" });
    for (const preset of WPM_PRESETS) {
      const btn = presetsRow.createEl("button", { cls: "rsvp-preset-btn" });
      btn.createSpan({ text: String(preset.wpm) });
      btn.createEl("small", { text: preset.label });
      btn.addEventListener("click", () => engine.setWpm(preset.wpm));
      this.presetBtns.push(btn);
    }

    // Chunk size
    const chunkRow = speedPanel.createDiv({ cls: "rsvp-controls-row" });
    chunkRow.createSpan({ cls: "rsvp-label-text", text: "Words per flash:" });
    this.chunkSelect = chunkRow.createEl("select", {
      cls: "rsvp-chunk-select",
    });
    for (const n of [1, 2, 3]) {
      const opt = this.chunkSelect.createEl("option", {
        value: String(n),
        text: String(n),
      });
      if (n === engine.getState().chunkSize) opt.selected = true;
    }
    this.chunkSelect.addEventListener("change", () => {
      engine.setChunkSize(parseInt(this.chunkSelect.value));
    });

    // Section selector
    const sectionRow = speedPanel.createDiv({ cls: "rsvp-controls-row" });
    sectionRow.createSpan({ cls: "rsvp-label-text", text: "Section:" });
    this.sectionSelect = sectionRow.createEl("select", {
      cls: "rsvp-section-select",
    });
    doc.sections.forEach((section, i) => {
      this.sectionSelect.createEl("option", {
        value: String(i),
        text: section.heading,
      });
    });
    this.sectionSelect.addEventListener("change", () => {
      engine.seekToSection(parseInt(this.sectionSelect.value));
    });

    // --- Progress row ---
    const progressRow = this.container.createDiv({
      cls: "rsvp-progress-row",
    });
    this.progressBar = progressRow.createDiv({ cls: "rsvp-progress-bar" });
    this.progressFill = this.progressBar.createDiv({
      cls: "rsvp-progress-fill",
    });

    const progressInfo = progressRow.createDiv({ cls: "rsvp-progress-info" });
    this.progressLabel = progressInfo.createSpan({
      cls: "rsvp-progress-label",
    });
    this.timeLeftLabel = progressInfo.createSpan({
      cls: "rsvp-time-left",
    });

    this.progressBar.addEventListener("click", (e) => {
      const rect = this.progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const targetIndex = Math.floor(pct * engine.getState().totalTokens);
      engine.seekToToken(targetIndex);
    });

    // --- Keyboard shortcut hints (inside toolbar) ---
    const shortcutHints = this.container.createDiv({ cls: "rsvp-shortcuts" });
    const hints: [string, string, string?][] = [
      ["Space", "Play/Pause"],
      ["\u2190", "Prev sentence"],
      ["\u2192", "Next sentence"],
      ["\u2190\u2190", "Restart paragraph"],
      ["\u2191 \u2193", "Speed"],
      ["T", "Full Text"],
      ["H", "Hide toolbar"],
      [
        "W",
        "Word scrub",
        "Toggle word-level scrubbing: when on, \u2190/\u2192 move one word at a time instead of by sentence",
      ],
    ];
    for (const [key, label, tooltip] of hints) {
      const hint = shortcutHints.createSpan({ cls: "rsvp-shortcut-hint" });
      if (tooltip) hint.dataset.tooltip = tooltip;
      if (tooltip) hint.classList.add("rsvp-has-tooltip");
      hint.createSpan({ cls: "rsvp-shortcut-key", text: key });
      hint.createSpan({ text: ` ${label}` });
    }

    // --- Persistent hints (always visible, outside toolbar) ---
    this.persistentHints = parent.createDiv({
      cls: "rsvp-persistent-hints rsvp-persistent-hints-hidden",
    });
    const allKeybindsTooltip = [
      "Space \u2014 Play/Pause",
      "\u2190 \u2014 Previous sentence",
      "\u2192 \u2014 Next sentence",
      "\u2190\u2190 \u2014 Restart paragraph",
      "\u2192\u2192 \u2014 Next paragraph",
      "\u2191 \u2014 Speed up (+25 WPM)",
      "\u2193 \u2014 Slow down (-25 WPM)",
      "W \u2014 Toggle word-level scrubbing",
      "T \u2014 Toggle source text",
      "H \u2014 Show/hide toolbar",
    ].join("\n");

    const phints: [string, string, string?][] = [
      ["Space", "Play/Pause", allKeybindsTooltip],
      ["H", "Show toolbar"],
      ["T", "Full Text"],
    ];
    for (const [key, label, tooltip] of phints) {
      const hint = this.persistentHints.createSpan({
        cls: "rsvp-shortcut-hint",
      });
      if (tooltip) {
        hint.dataset.tooltip = tooltip;
        hint.classList.add("rsvp-has-tooltip");
      }
      hint.createSpan({ cls: "rsvp-shortcut-key", text: key });
      hint.createSpan({ text: ` ${label}` });
    }

    // Listen for state changes
    engine.on("stateChange", (state: PlaybackState) =>
      this.onStateChange(state)
    );
    engine.on("tick", (payload: { state: PlaybackState }) =>
      this.onTick(payload.state)
    );

    this.updateTimeLeft(engine.getState());
    this.updatePresetHighlight(engine.getState().wpm);
  }

  private onStateChange(state: PlaybackState): void {
    this.playBtn.innerHTML =
      state.status === "playing" ? ICON_PAUSE : ICON_PLAY;
    this.playBtn.classList.toggle("rsvp-playing", state.status === "playing");
    this.wpmValueLabel.innerHTML = `<strong>${state.wpm}</strong> wpm`;
    this.wpmSlider.value = String(state.wpm);
    this.updatePresetHighlight(state.wpm);
    this.updateTimeLeft(state);
  }

  private onTick(state: PlaybackState): void {
    const pct =
      state.totalTokens > 0
        ? (state.currentTokenIndex / state.totalTokens) * 100
        : 0;
    this.progressFill.style.width = `${pct}%`;
    this.progressLabel.textContent = `${state.currentTokenIndex} / ${state.totalTokens} words`;
    this.updateTimeLeft(state);
  }

  private updateTimeLeft(state: PlaybackState): void {
    const remaining = state.totalTokens - state.currentTokenIndex;
    if (remaining <= 0 || state.wpm <= 0) {
      this.timeLeftLabel.textContent = "done";
      return;
    }
    const totalMinutes = remaining / state.wpm;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.ceil(totalMinutes % 60);

    if (hours > 0) {
      this.timeLeftLabel.textContent = `${hours}h ${mins}m left`;
    } else if (mins <= 1) {
      this.timeLeftLabel.textContent = "< 1 min left";
    } else {
      this.timeLeftLabel.textContent = `${mins} min left`;
    }
  }

  private updatePresetHighlight(wpm: number): void {
    this.presetBtns.forEach((btn, i) => {
      btn.classList.toggle(
        "rsvp-preset-active",
        WPM_PRESETS[i].wpm === wpm
      );
    });
  }

  setCurrentSection(sectionIndex: number): void {
    this.sectionSelect.value = String(sectionIndex);
  }

  toggleToolbar(): void {
    this.toolbarVisible = !this.toolbarVisible;
    this.container.classList.toggle(
      "rsvp-controls-hidden",
      !this.toolbarVisible
    );
    this.persistentHints.classList.toggle(
      "rsvp-persistent-hints-hidden",
      this.toolbarVisible
    );
  }

  registerKeyboard(viewEl: HTMLElement): void {
    viewEl.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      switch (e.code) {
        case "Space":
          e.preventDefault();
          this.engine.togglePlayPause();
          break;

        case "ArrowUp":
          e.preventDefault();
          this.engine.setWpm(this.engine.getState().wpm + 25);
          this.onShowToast?.(
            `Speed: ${this.engine.getState().wpm} WPM`
          );
          break;

        case "ArrowDown":
          e.preventDefault();
          this.engine.setWpm(this.engine.getState().wpm - 25);
          this.onShowToast?.(
            `Speed: ${this.engine.getState().wpm} WPM`
          );
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (this.wordScrubbing) {
            this.engine.seekToToken(
              this.engine.getState().currentTokenIndex - 1
            );
          } else {
            const now = Date.now();
            if (now - this.lastLeftTap < this.doubleTapWindow) {
              this.engine.seekParagraphStart();
              this.onShowToast?.("Restart paragraph");
              this.lastLeftTap = 0;
            } else {
              this.lastLeftTap = now;
              this.engine.seekPrevSentence();
              this.onShowToast?.("Previous sentence");
            }
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (this.wordScrubbing) {
            this.engine.seekToToken(
              this.engine.getState().currentTokenIndex + 1
            );
          } else {
            const now = Date.now();
            if (now - this.lastRightTap < this.doubleTapWindow) {
              this.engine.seekNextParagraph();
              this.onShowToast?.("Next paragraph");
              this.lastRightTap = 0;
            } else {
              this.lastRightTap = now;
              this.engine.seekNextSentence();
              this.onShowToast?.("Next sentence");
            }
          }
          break;

        case "KeyH":
          e.preventDefault();
          this.toggleToolbar();
          break;

        case "KeyT":
          e.preventDefault();
          this.onToggleContext?.();
          break;

        case "KeyW":
          e.preventDefault();
          this.wordScrubbing = !this.wordScrubbing;
          this.onShowToast?.(
            `Word scrub: ${this.wordScrubbing ? "on" : "off"}`
          );
          break;
      }
    });
    viewEl.tabIndex = 0;
  }
}
