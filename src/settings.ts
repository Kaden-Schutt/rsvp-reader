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
  }
}
