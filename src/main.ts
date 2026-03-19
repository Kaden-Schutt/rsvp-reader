import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_RSVP, RsvpSettings, DEFAULT_SETTINGS } from "./types";
import { RsvpView } from "./views/rsvp-view";
import { RsvpSettingTab } from "./settings";

export default class RsvpPlugin extends Plugin {
  settings: RsvpSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_RSVP, (leaf) => new RsvpView(leaf, this.settings));

    // Command: open active file in RSVP reader
    this.addCommand({
      id: "rsvp-open",
      name: "Open current file in RSVP Reader",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "md") {
          if (!checking) {
            this.openRsvpView(file);
          }
          return true;
        }
        return false;
      },
    });

    // File menu: right-click to open in RSVP
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("Open in RSVP Reader")
              .setIcon("book-open")
              .onClick(() => this.openRsvpView(file));
          });
        }
      })
    );

    this.addSettingTab(new RsvpSettingTab(this.app, this));
  }

  async openRsvpView(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_RSVP,
      active: true,
    });

    const view = leaf.view;
    if (view instanceof RsvpView) {
      await view.loadFile(file);
    }
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_RSVP);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
