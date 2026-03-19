import { Section, Token } from "../types";

/**
 * Shows the source text of the current section with the current word highlighted.
 * Words are clickable to seek the reader to that position.
 */
export class ContextPanel {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private currentSection: Section | null = null;
  private currentSectionIndex: number = -1;
  private visible = true;

  /** Called when user clicks a word — passes the token's globalIndex */
  onSeekToToken?: (globalIndex: number) => void;

  constructor(parent: HTMLElement) {
    this.container = parent.createDiv({ cls: "rsvp-context-panel" });
    this.container.createDiv({
      cls: "rsvp-context-label",
      text: "Source Text",
    });
    this.contentEl = this.container.createDiv({ cls: "rsvp-context-content" });
  }

  setSection(section: Section, sectionIndex: number): void {
    this.currentSection = section;
    this.currentSectionIndex = sectionIndex;
    this.renderSection();
  }

  highlightToken(token: Token): void {
    if (
      !this.currentSection ||
      token.sectionIndex !== this.currentSectionIndex
    ) {
      return;
    }

    // Clear previous highlights
    this.contentEl
      .querySelectorAll(".rsvp-context-word.rsvp-highlight")
      .forEach((el) => {
        el.removeClass("rsvp-highlight");
      });

    // Find and highlight the word span by globalIndex
    const wordEl = this.contentEl.querySelector(
      `[data-global-index="${token.globalIndex}"]`
    );
    if (wordEl) {
      wordEl.addClass("rsvp-highlight");
      wordEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /**
   * Render section with each word as a clickable span.
   * This enables both highlighting and click-to-seek.
   */
  private renderSection(): void {
    this.contentEl.empty();
    if (!this.currentSection) return;

    for (const paragraph of this.currentSection.paragraphs) {
      const pEl = this.contentEl.createDiv({
        cls: "rsvp-context-paragraph",
      });

      // Render the original text, but wrap each word in a clickable span
      const text = paragraph.text;
      const wordRegex = /\S+/g;
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      let tokenIdx = 0;

      while ((match = wordRegex.exec(text)) !== null) {
        // Append any whitespace/text before this word
        if (match.index > lastIndex) {
          pEl.appendText(text.slice(lastIndex, match.index));
        }

        const token =
          tokenIdx < paragraph.tokens.length
            ? paragraph.tokens[tokenIdx]
            : null;

        const wordSpan = pEl.createSpan({ cls: "rsvp-context-word" });
        wordSpan.textContent = match[0];

        if (token) {
          wordSpan.dataset.globalIndex = String(token.globalIndex);
          wordSpan.addEventListener("click", () => {
            this.onSeekToToken?.(token.globalIndex);
          });
        }

        lastIndex = match.index + match[0].length;
        tokenIdx++;
      }

      // Trailing text
      if (lastIndex < text.length) {
        pEl.appendText(text.slice(lastIndex));
      }
    }
  }

  toggleVisible(): void {
    this.visible = !this.visible;
    this.container.classList.toggle("rsvp-context-hidden", !this.visible);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.classList.toggle("rsvp-context-hidden", !visible);
  }
}
