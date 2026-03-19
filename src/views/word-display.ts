import { Token } from "../types";
import { ICON_PLAY } from "../icons";

/**
 * Renders the current RSVP word with ORP (Optimal Recognition Point) highlighting.
 * The pivot letter is always fixed at the center point using fixed-width
 * before/after containers with opposing text alignment.
 */
export class WordDisplay {
  private container: HTMLElement;
  private wordContainer: HTMLElement;
  private preEl: HTMLSpanElement;
  private orpEl: HTMLSpanElement;
  private postEl: HTMLSpanElement;

  constructor(parent: HTMLElement) {
    this.container = parent.createDiv({ cls: "rsvp-word-display" });
    this.wordContainer = this.container.createDiv({ cls: "rsvp-word-container" });

    // Pivot markers — hidden in idle state
    this.wordContainer.createDiv({ cls: "rsvp-pivot-marker rsvp-pivot-marker-top" });
    this.wordContainer.createDiv({ cls: "rsvp-pivot-marker rsvp-pivot-marker-bottom" });

    const wordEl = this.wordContainer.createDiv({ cls: "rsvp-word" });
    this.preEl = wordEl.createSpan({ cls: "rsvp-pre" });
    this.orpEl = wordEl.createSpan({ cls: "rsvp-orp" });
    this.postEl = wordEl.createSpan({ cls: "rsvp-post" });
  }

  update(tokens: Token[]): void {
    this.wordContainer.classList.remove("rsvp-idle");

    if (tokens.length === 0) {
      this.preEl.textContent = "";
      this.orpEl.textContent = "";
      this.postEl.textContent = "";
      return;
    }

    if (tokens.length === 1) {
      const word = tokens[0].word;
      const pivot = this.getOrpIndex(word);
      this.preEl.textContent = word.slice(0, pivot);
      this.orpEl.textContent = word[pivot] || "";
      this.postEl.textContent = word.slice(pivot + 1);
    } else {
      const first = tokens[0].word;
      const pivot = this.getOrpIndex(first);
      const rest = tokens.slice(1).map((t) => t.word).join(" ");
      this.preEl.textContent = first.slice(0, pivot);
      this.orpEl.textContent = first[pivot] || "";
      this.postEl.textContent = first.slice(pivot + 1) + " " + rest;
    }
  }

  /**
   * Calculate the Optimal Recognition Point index.
   * Matches the-speed-reader.vercel.app implementation.
   */
  private getOrpIndex(word: string): number {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return 4;
  }

  clear(): void {
    this.wordContainer.classList.add("rsvp-idle");
    this.preEl.textContent = "";
    this.orpEl.innerHTML = ICON_PLAY;
    this.postEl.textContent = "";
  }
}
