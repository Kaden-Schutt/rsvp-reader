import { Plugin, TFile } from "obsidian";
import {
  VIEW_TYPE_RSVP,
  VIEW_TYPE_CHAT,
  RsvpSettings,
  DEFAULT_SETTINGS,
} from "./types";
import { RsvpView } from "./views/rsvp-view";
import { ChatPanel } from "./llm/chat-panel";
import { LlmService } from "./llm/llm-service";
import { SessionStore } from "./llm/session-store";
import { RsvpSettingTab } from "./settings";

export default class RsvpPlugin extends Plugin {
  settings: RsvpSettings = DEFAULT_SETTINGS;
  llmService: LlmService | null = null;
  sessionStore: SessionStore = new SessionStore(this);

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.sessionStore.load();
    this.updateLlmService();

    this.registerView(
      VIEW_TYPE_RSVP,
      (leaf) => new RsvpView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_CHAT,
      (leaf) => new ChatPanel(leaf)
    );

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

    this.addCommand({
      id: "rsvp-toggle-chat",
      name: "Toggle reading partner chat",
      callback: () => this.toggleChatPanel(),
    });

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

  async toggleChatPanel(): Promise<ChatPanel | null> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (existing.length > 0) {
      const leaf = existing[0];
      if (leaf.view instanceof ChatPanel) {
        this.app.workspace.revealLeaf(leaf);
        return leaf.view;
      }
    }

    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (!rightLeaf) return null;

    await rightLeaf.setViewState({
      type: VIEW_TYPE_CHAT,
      active: true,
    });

    const chatPanel = rightLeaf.view;
    if (chatPanel instanceof ChatPanel) {
      chatPanel.llmService = this.llmService;
      chatPanel.systemPrompt = this.settings.llmSystemPrompt;
      this.app.workspace.revealLeaf(rightLeaf);
      return chatPanel;
    }
    return null;
  }

  getChatPanel(): ChatPanel | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (leaves.length > 0 && leaves[0].view instanceof ChatPanel) {
      return leaves[0].view;
    }
    return null;
  }

  updateLlmService(): void {
    if (this.settings.llmEnabled && this.settings.llmApiKey) {
      if (this.llmService) {
        this.llmService.updateConfig(
          this.settings.llmProvider,
          this.settings.llmApiKey,
          this.settings.llmModel,
          this.settings.llmBaseUrl
        );
      } else {
        this.llmService = new LlmService(
          this.settings.llmProvider,
          this.settings.llmApiKey,
          this.settings.llmModel,
          this.settings.llmBaseUrl
        );
      }
    } else {
      this.llmService = null;
    }

    const chat = this.getChatPanel();
    if (chat) {
      chat.llmService = this.llmService;
      chat.systemPrompt = this.settings.llmSystemPrompt;
    }
  }

  async onunload(): Promise<void> {
    await this.sessionStore.persist();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_RSVP);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    const allData = (await this.loadData()) ?? {};
    Object.assign(allData, this.settings);
    await this.saveData(allData);
  }
}
