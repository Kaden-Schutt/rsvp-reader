/**
 * Displays the current section heading above the RSVP word display.
 */
export class SectionHeader {
  private container: HTMLElement;
  private headingEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.container = parent.createDiv({ cls: "rsvp-section-header" });
    this.headingEl = this.container.createEl("h3", { cls: "rsvp-heading-text" });
  }

  update(heading: string): void {
    this.headingEl.textContent = heading;
  }
}
