# RSVP Reader for Obsidian

Speed read your markdown files using RSVP (Rapid Serial Visual Presentation) with contextual highlighting and sentence-level navigation.

## Features

- **ORP-aligned word display** — pivot letter always centered, matching proven speed reading technique
- **Live context panel** — source text with highlighted current word, click any word to jump there
- **Sentence/paragraph navigation** — arrow keys skip by sentence, double-tap to jump paragraphs
- **Section awareness** — parses `##` headings as chapters, auto-pauses at boundaries
- **Configurable speed** — 50-1000 WPM with preset buttons (Beginner through Expert)
- **Keyboard-driven** — Space, arrows, T/H/W for full control without touching the mouse
- **Clean, hideable UI** — toolbar and context panel toggle away for distraction-free reading

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

## Roadmap

- [ ] LLM reading partner — pause and chat about the text with full context awareness
- [ ] Rolling summaries with auto-compaction
- [ ] Commentary file integration for note-taking workflows

## License

MIT
