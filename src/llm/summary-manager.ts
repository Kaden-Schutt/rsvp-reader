import { Section } from "../types";
import { LlmService } from "./llm-service";

export interface ReadingContext {
  documentTitle: string;
  rollingSummary: string;
  currentSectionText: string;
  currentSectionHeading: string;
  currentTokenIndex: number;
  totalTokens: number;
}

interface SectionSummary {
  sectionIndex: number;
  heading: string;
  summary: string;
}

const COMPACTION_THRESHOLD = 3000; // characters

export class SummaryManager {
  private sectionSummaries: SectionSummary[] = [];
  private rollingSummary = "";
  private summarizing = false;

  constructor(
    private llmService: LlmService,
    private documentTitle: string
  ) {}

  async onSectionComplete(
    sectionIndex: number,
    section: Section
  ): Promise<void> {
    // Skip if already summarizing or section already done
    if (this.summarizing) return;
    if (this.sectionSummaries.some((s) => s.sectionIndex === sectionIndex)) {
      return;
    }

    const sectionText = section.paragraphs
      .map((p) => p.text)
      .join("\n\n");

    if (sectionText.trim().length === 0) return;

    this.summarizing = true;
    try {
      const response = await this.llmService.sendMessage({
        systemPrompt:
          "You summarize sections of texts for a student's reading notes. Be concise but preserve key arguments, names, dates, and references.",
        messages: [
          {
            role: "user",
            content: `Summarize this section of "${this.documentTitle}" titled "${section.heading}" in 2-3 sentences:\n\n${sectionText}`,
          },
        ],
        maxTokens: 256,
      });

      const summary: SectionSummary = {
        sectionIndex,
        heading: section.heading,
        summary: response.content,
      };
      this.sectionSummaries.push(summary);
      this.rollingSummary += `${section.heading}: ${response.content}\n\n`;

      if (this.rollingSummary.length > COMPACTION_THRESHOLD) {
        await this.compact();
      }
    } catch {
      // Degrade gracefully — just record the heading
      this.sectionSummaries.push({
        sectionIndex,
        heading: section.heading,
        summary: "(summary unavailable)",
      });
      this.rollingSummary += `${section.heading}: (read but not summarized)\n\n`;
    } finally {
      this.summarizing = false;
    }
  }

  private async compact(): Promise<void> {
    try {
      const response = await this.llmService.sendMessage({
        systemPrompt:
          "Condense reading summaries into a shorter form. Preserve all key arguments, people, concepts, and references.",
        messages: [
          {
            role: "user",
            content: `Condense this reading summary to under 1500 characters while keeping all essential information:\n\n${this.rollingSummary}`,
          },
        ],
        maxTokens: 512,
      });
      this.rollingSummary = response.content;
    } catch {
      // Keep the uncompacted version
    }
  }

  getReadingContext(
    currentSection: Section,
    currentSectionIndex: number,
    currentTokenIndex: number,
    totalTokens: number
  ): ReadingContext {
    const currentSectionText = currentSection.paragraphs
      .map((p) => p.text)
      .join("\n\n");

    return {
      documentTitle: this.documentTitle,
      rollingSummary: this.rollingSummary || "(Nothing read yet)",
      currentSectionText,
      currentSectionHeading: currentSection.heading,
      currentTokenIndex,
      totalTokens,
    };
  }

  getRollingSummary(): string {
    return this.rollingSummary;
  }

  reset(): void {
    this.sectionSummaries = [];
    this.rollingSummary = "";
    this.summarizing = false;
  }
}
