import { Section } from "../types";
import { LlmService } from "./llm-service";
import { SectionSummaryData } from "./session-store";

export interface ReadingContext {
  documentTitle: string;
  filePath: string;
  rollingSummary: string;
  currentSectionText: string;
  currentSectionHeading: string;
  currentTokenIndex: number;
  totalTokens: number;
}

type SectionSummary = SectionSummaryData;

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

  /**
   * Build reading context. If tokenOffsetInSection is provided,
   * only include text up to that word position within the section
   * so the LLM doesn't see ahead of the reader.
   */
  getReadingContext(
    currentSection: Section,
    currentSectionIndex: number,
    currentTokenIndex: number,
    totalTokens: number,
    filePath: string = "",
    tokenOffsetInSection?: number
  ): ReadingContext {
    let currentSectionText: string;

    if (tokenOffsetInSection !== undefined && tokenOffsetInSection >= 0) {
      // Only include paragraphs and words up to current position
      const parts: string[] = [];
      let tokensConsumed = 0;
      for (const paragraph of currentSection.paragraphs) {
        if (tokensConsumed >= tokenOffsetInSection) break;
        const remainingTokens = tokenOffsetInSection - tokensConsumed;
        if (paragraph.tokens.length <= remainingTokens) {
          parts.push(paragraph.text);
          tokensConsumed += paragraph.tokens.length;
        } else {
          // Partial paragraph — include only words up to the position
          const words = paragraph.text.split(/\s+/);
          parts.push(words.slice(0, remainingTokens).join(" ") + "...");
          tokensConsumed += remainingTokens;
        }
      }
      currentSectionText = parts.join("\n\n");
    } else {
      currentSectionText = currentSection.paragraphs
        .map((p) => p.text)
        .join("\n\n");
    }

    return {
      documentTitle: this.documentTitle,
      filePath,
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

  /** Restore from persisted session data */
  restore(
    sectionSummaries: SectionSummary[],
    rollingSummary: string
  ): void {
    this.sectionSummaries = sectionSummaries;
    this.rollingSummary = rollingSummary;
  }

  getSectionSummaries(): SectionSummary[] {
    return [...this.sectionSummaries];
  }
}
