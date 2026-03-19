import { ParsedDocument, Section, Paragraph, Token } from "../types";

/**
 * Parse a markdown string into a structured document for RSVP playback.
 * Splits on ## headings, then into paragraphs, then tokenizes words.
 */
export function parseMarkdown(
  content: string,
  fallbackTitle: string
): ParsedDocument {
  // Strip frontmatter
  const stripped = content.replace(/^---[\s\S]*?---\n*/, "");

  const sections: Section[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const matches: { level: number; heading: string; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(stripped)) !== null) {
    matches.push({
      level: match[1].length,
      heading: match[2].trim(),
      index: match.index,
    });
  }

  if (matches.length === 0) {
    // No headings — treat entire content as one section
    const paragraphs = parseParagraphs(stripped, 0);
    sections.push({ heading: fallbackTitle, level: 1, paragraphs });
  } else {
    // Content before first heading (if any)
    if (matches[0].index > 0) {
      const preContent = stripped.slice(0, matches[0].index).trim();
      if (preContent.length > 0) {
        const paragraphs = parseParagraphs(preContent, 0);
        sections.push({
          heading: fallbackTitle,
          level: 1,
          paragraphs,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const start =
        matches[i].index + stripped.slice(matches[i].index).indexOf("\n") + 1;
      const end = i + 1 < matches.length ? matches[i + 1].index : stripped.length;
      const body = stripped.slice(start, end).trim();

      const paragraphs = parseParagraphs(body, sections.length);
      sections.push({
        heading: matches[i].heading,
        level: matches[i].level,
        paragraphs,
      });
    }
  }

  // Assign global indices
  let globalIndex = 0;
  for (let si = 0; si < sections.length; si++) {
    for (let pi = 0; pi < sections[si].paragraphs.length; pi++) {
      for (const token of sections[si].paragraphs[pi].tokens) {
        token.sectionIndex = si;
        token.paragraphIndex = pi;
        token.globalIndex = globalIndex++;
      }
    }
  }

  const title =
    matches.length > 0 && matches[0].level === 1
      ? matches[0].heading
      : fallbackTitle;

  return { title, sections };
}

function parseParagraphs(text: string, sectionIndex: number): Paragraph[] {
  // Split on blank lines
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return rawParagraphs.map((rawText) => {
    // Clean markdown formatting for display but keep original for context
    const tokens = tokenize(rawText, sectionIndex, 0);
    return { text: rawText, tokens };
  });
}

function tokenize(
  text: string,
  sectionIndex: number,
  paragraphIndex: number
): Token[] {
  const tokens: Token[] = [];
  // Strip markdown formatting for word extraction
  const cleaned = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "");

  const wordRegex = /\S+/g;
  let wordMatch: RegExpExecArray | null;
  while ((wordMatch = wordRegex.exec(cleaned)) !== null) {
    tokens.push({
      word: wordMatch[0],
      sectionIndex,
      paragraphIndex,
      charOffset: wordMatch.index,
      charLength: wordMatch[0].length,
      globalIndex: 0, // assigned later
    });
  }

  return tokens;
}

/** Get all tokens from a document in order */
export function getAllTokens(doc: ParsedDocument): Token[] {
  const tokens: Token[] = [];
  for (const section of doc.sections) {
    for (const paragraph of section.paragraphs) {
      tokens.push(...paragraph.tokens);
    }
  }
  return tokens;
}
