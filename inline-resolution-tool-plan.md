# Plan: Inline Resolution Writing Tool

## Context
A minimal writing tool where you type freely. When you need info, type `/Question what is X?` + Enter → answer replaces the query inline. No context switching.

## Stack — All Existing Libraries
- **Next.js** (App Router) — framework + API route for Groq
- **Tiptap** (`@tiptap/react`, `@tiptap/starter-kit`) — rich text editor library, handles all contenteditable complexity (cursor, newlines, keyboard events, extensions)
- **Groq SDK** (`groq-sdk`) — official Groq client
- **Tailwind CSS** — styling
- **Anthropic frontend-design skill** — design guidelines

**Why Tiptap:** No hand-rolled contenteditable. Tiptap gives us cursor management, keyboard event handling, text node manipulation, and an extension system for the `/Question` pattern — all battle-tested.

## Project Structure

```
seemless_design/
├── CLAUDE.md                          # "Always use frontend-design skill for UI work"
├── TODO.md                            # Task checklist
├── the-friction-collapse.md           # (existing)
├── .claude/skills/frontend-design/
│   └── SKILL.md                       # Anthropic design skill
├── app/
│   ├── layout.tsx                     # Font imports, minimal shell
│   ├── page.tsx                       # Mounts the Editor component
│   ├── globals.css                    # Tiptap + page styling
│   └── api/resolve/route.ts           # Groq API route
├── components/
│   └── Editor.tsx                     # Tiptap editor + /Question extension logic
├── .env.local                         # GROQ_API_KEY
├── package.json
└── next.config.js
```

## TODO

- [ ] Create CLAUDE.md + install frontend-design skill
- [ ] Scaffold Next.js app
- [ ] Install deps: @tiptap/react @tiptap/starter-kit @tiptap/pm groq-sdk
- [ ] Create .env.local with GROQ_API_KEY
- [ ] Build API route (app/api/resolve/route.ts)
- [ ] Build Editor component (components/Editor.tsx) with Tiptap
- [ ] Add /Question + Enter detection via Tiptap keyboard handler
- [ ] Style the page following frontend-design skill
- [ ] Test: normal typing + Enter = newlines
- [ ] Test: /Question query + Enter = inline answer replacement

## Implementation Details

### API Route (`app/api/resolve/route.ts`)
- POST `{ question: string }` → Groq `llama-3.3-70b-versatile` → `{ answer: string }`
- System prompt: "Answer in 1-2 concise sentences. No preamble. Just the direct answer."

### Editor Component (`components/Editor.tsx`)
- Uses `useEditor` from `@tiptap/react` with `StarterKit`
- Tiptap's `addKeyboardShortcuts` or `handleKeyDown` on the `EditorContent` to intercept Enter
- On Enter: get current line text via Tiptap's `state.doc` → check if line starts with `/Question `
  - **Yes**: prevent default, extract query, call `/api/resolve`, use Tiptap's `chain().deleteRange().insertContent()` to replace the line with the answer
  - **No**: normal Enter (Tiptap handles it)
- Placeholder via Tiptap's `placeholder` extension (`@tiptap/extension-placeholder`)
- Loading state: while awaiting response, set the line's text color to gray via Tiptap mark or CSS class

### Styling
- Read `.claude/skills/frontend-design/SKILL.md` first
- Distinctive font (Google Fonts import in layout), not Inter/Arial/system
- White/cream page, no UI chrome, centered ~650px editor
- Tiptap's `.ProseMirror` class for editor styling

## Verification
1. `npm run dev` → localhost:3000
2. White page, placeholder text, auto-focused
3. Normal typing works, Enter = new line
4. Type `/Question what format are iPhone photos in?` + Enter
5. Text goes gray briefly → replaced with answer inline
6. Cursor after answer, keep typing
