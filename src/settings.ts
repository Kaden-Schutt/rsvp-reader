import { App, PluginSettingTab, Setting } from "obsidian";
import type RsvpPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

export class RsvpSettingTab extends PluginSettingTab {
  plugin: RsvpPlugin;

  constructor(app: App, plugin: RsvpPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default WPM")
      .setDesc("Default words per minute when opening the reader")
      .addSlider((slider) =>
        slider
          .setLimits(50, 1000, 25)
          .setValue(this.plugin.settings.defaultWpm)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.defaultWpm = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default chunk size")
      .setDesc("Number of words to display at once")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ "1": "1", "2": "2", "3": "3" })
          .setValue(String(this.plugin.settings.defaultChunkSize))
          .onChange(async (value) => {
            this.plugin.settings.defaultChunkSize = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show context panel")
      .setDesc("Display the source text with highlighting below the reader")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showContextPanel)
          .onChange(async (value) => {
            this.plugin.settings.showContextPanel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Pause on section change")
      .setDesc("Automatically pause when reaching a new heading")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.pauseOnSectionChange)
          .onChange(async (value) => {
            this.plugin.settings.pauseOnSectionChange = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Highlight style")
      .setDesc("What to highlight in the context panel")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ word: "Current word", sentence: "Current sentence" })
          .setValue(this.plugin.settings.highlightStyle)
          .onChange(async (value) => {
            this.plugin.settings.highlightStyle = value as "word" | "sentence";
            await this.plugin.saveSettings();
          })
      );

    // --- Reading Partner (LLM) ---
    containerEl.createEl("h3", { text: "Reading Partner (LLM)" });

    new Setting(containerEl)
      .setName("Enable reading partner")
      .setDesc("Enable AI-powered reading companion in the sidebar")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.llmEnabled)
          .onChange(async (value) => {
            this.plugin.settings.llmEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.updateLlmService();
          })
      );

    new Setting(containerEl)
      .setName("Anthropic API key")
      .setDesc("Stored locally in the plugin's data.json file")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.style.width = "300px";
        text
          .setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.llmApiKey)
          .onChange(async (value) => {
            this.plugin.settings.llmApiKey = value;
            await this.plugin.saveSettings();
            this.plugin.updateLlmService();
          });
      });

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Model used for chat and summaries")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "claude-sonnet-4-6": "Claude Sonnet 4.6",
            "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
          })
          .setValue(this.plugin.settings.llmModel)
          .onChange(async (value) => {
            this.plugin.settings.llmModel = value;
            await this.plugin.saveSettings();
            this.plugin.updateLlmService();
          })
      );
  }
}
