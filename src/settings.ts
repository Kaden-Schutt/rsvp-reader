import { App, PluginSettingTab, Setting } from "obsidian";
import type RsvpPlugin from "./main";
import { DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPT } from "./types";

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
      .setName("Provider")
      .setDesc("LLM API provider")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            anthropic: "Anthropic (Claude)",
            openai: "OpenAI / Compatible",
          })
          .setValue(this.plugin.settings.llmProvider)
          .onChange(async (value) => {
            this.plugin.settings.llmProvider = value as "anthropic" | "openai";
            await this.plugin.saveSettings();
            this.plugin.updateLlmService();
            this.display(); // re-render to update model options
          })
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Stored locally in the plugin's data.json file")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.style.width = "300px";
        text
          .setPlaceholder(
            this.plugin.settings.llmProvider === "anthropic"
              ? "sk-ant-..."
              : "sk-..."
          )
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
      .addText((text) => {
        text
          .setPlaceholder(
            this.plugin.settings.llmProvider === "anthropic"
              ? "claude-sonnet-4-6"
              : "gpt-4o"
          )
          .setValue(this.plugin.settings.llmModel)
          .onChange(async (value) => {
            this.plugin.settings.llmModel = value;
            await this.plugin.saveSettings();
            this.plugin.updateLlmService();
          });
      });

    new Setting(containerEl)
      .setName("Base URL (optional)")
      .setDesc(
        "Override the API endpoint. Leave empty for defaults. Useful for proxies or OpenAI-compatible APIs (e.g. Ollama, Together)."
      )
      .addText((text) =>
        text
          .setPlaceholder("https://api.example.com")
          .setValue(this.plugin.settings.llmBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.llmBaseUrl = value;
            await this.plugin.saveSettings();
            this.plugin.updateLlmService();
          })
      );

    new Setting(containerEl)
      .setName("System prompt")
      .setDesc(
        "Instructions for the reading partner. Customize for your use case."
      )
      .addTextArea((textarea) => {
        textarea.inputEl.rows = 8;
        textarea.inputEl.style.width = "100%";
        textarea.inputEl.style.fontFamily = "var(--font-monospace)";
        textarea.inputEl.style.fontSize = "0.85em";
        textarea
          .setPlaceholder(DEFAULT_SYSTEM_PROMPT)
          .setValue(this.plugin.settings.llmSystemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.llmSystemPrompt = value;
            await this.plugin.saveSettings();
          });
      });
  }
}
