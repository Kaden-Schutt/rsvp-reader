# RSVP Reader for Obsidian

Speed read your markdown files using RSVP (Rapid Serial Visual Presentation) with contextual highlighting, sentence-level navigation, and an optional LLM reading partner.

## Features

- **ORP-aligned word display** — pivot letter always centered, matching proven speed reading technique
- **Live context panel** — source text with highlighted current word, click any word to jump there
- **Sentence/paragraph navigation** — arrow keys skip by sentence, double-tap to jump paragraphs
- **Section awareness** — parses `##` headings as chapters, auto-pauses at boundaries
- **Configurable speed** — 50-1000 WPM with preset buttons (Beginner through Expert)
- **Keyboard-driven** — Space, arrows, T/H/W/C for full control without touching the mouse
- **Clean, hideable UI** — toolbar and context panel toggle away for distraction-free reading
- **LLM reading partner** — pause and chat about the text with full context awareness
- **Rolling summaries** — auto-compacting summaries of completed sections, so the LLM always knows what you've read without resending the whole document

## Install

Copy `main.js`, `manifest.json`, and `styles.css` to your vault at `.obsidian/plugins/rsvp-reader/`, then enable in Settings > Community plugins.

To build from source:

```bash
npm install
npm run build
```

## Usage

Open any markdown file, then either:
- Right-click > **Open in RSVP Reader**
- Command palette > **Open current file in RSVP Reader**

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| ← | Previous sentence |
| → | Next sentence |
| ←← | Restart paragraph |
| →→ | Next paragraph |
| ↑ / ↓ | Speed ±25 WPM |
| T | Toggle source text |
| H | Toggle toolbar |
| W | Toggle word-level scrubbing |
| C | Open reading partner chat (auto-pauses) |

### Reading Partner (LLM)

The reading partner is a sidebar chat that knows exactly where you are in the text. It receives a rolling summary of everything you've read plus the full text of your current section.

**Setup:** Settings > RSVP Reader > Reading Partner

- **Provider:** Anthropic (Claude) or any OpenAI-compatible API (OpenAI, Ollama, Together, etc.)
- **Model:** Free text — use any model your provider supports
- **Base URL:** Optional override for self-hosted or proxy endpoints
- **System prompt:** Fully configurable per vault — tailor the reading partner for your use case

The system prompt controls how the LLM behaves. The default is a generic reading companion. You can customize it for your specific domain (e.g., legal analysis, philosophy, technical documentation) in the plugin settings.

## Roadmap

- [ ] Commentary file integration for note-taking workflows
- [ ] Append LLM conversation to linked notes

## License

MIT
