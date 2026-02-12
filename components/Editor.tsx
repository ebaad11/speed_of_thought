"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/core";
import { useState } from "react";

/** Find the last "/" in text preceded by whitespace or at start */
function findSlashIndex(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "/" && (i === 0 || /\s/.test(text[i - 1]))) {
      return i;
    }
  }
  return -1;
}

// Inline decoration: purple highlight on /query text only
const questionDecoKey = new PluginKey("questionDecoration");

const QuestionHighlight = Extension.create({
  name: "questionHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: questionDecoKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return;
              const text = node.textContent;
              const slashIdx = findSlashIndex(text);
              if (slashIdx !== -1) {
                decorations.push(
                  Decoration.inline(pos + 1 + slashIdx, pos + 1 + text.length, {
                    class: "question-query",
                  })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

async function resolveQuestion(
  query: string,
  context?: { preceding: string; prefix: string; suffix: string }
): Promise<string> {
  const res = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: query, ...context }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to resolve");
  return data.answer;
}

export default function Editor() {
  const [isResolving, setIsResolving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Type your first thought",
      }),
      QuestionHighlight,
    ],
    immediatelyRender: false,
    autofocus: true,
    editorProps: {
      attributes: {
        class: "editor-content",
      },
      handleKeyDown(view, event) {
        if (event.key !== "Enter") return false;
        if (event.shiftKey) return false;

        const { state } = view;
        const { $from } = state.selection;
        const lineText = $from.parent.textContent;
        const cursorOffset = $from.parentOffset;
        const textBeforeCursor = lineText.substring(0, cursorOffset);
        const slashIndex = findSlashIndex(textBeforeCursor);
        if (slashIndex === -1) return false;

        const query = textBeforeCursor.substring(slashIndex + 1).trim();
        if (!query && slashIndex === 0 && !state.doc.textContent.replace(lineText, "").trim()) {
          // Bare / on first line with no context — nothing to resolve
          return false;
        }

        event.preventDefault();

        // Absolute positions
        const contentStart = $from.start();
        const slashPos = contentStart + slashIndex;
        const queryEndPos = contentStart + cursorOffset;

        // Context: preceding paragraphs, text before /, text after cursor
        const nodeStart = $from.before($from.depth);
        const precedingParts: string[] = [];
        state.doc.nodesBetween(0, nodeStart, (node) => {
          if (node.isTextblock && node.textContent.trim()) {
            precedingParts.push(node.textContent);
          }
        });
        const preceding = precedingParts.slice(-5).join("\n");
        const prefix = lineText.substring(0, slashIndex); // text before / on this line
        const suffix = lineText.substring(cursorOffset); // text after cursor on this line
        const context = (preceding || prefix || suffix)
          ? { preceding, prefix, suffix }
          : undefined;

        // Replace /query with "Resolving…" inline
        const RESOLVING = "Resolving\u2026";
        const tr = state.tr.insertText(RESOLVING, slashPos, queryEndPos);
        view.dispatch(tr);
        setIsResolving(true);

        const resolvingStart = slashPos;
        const resolvingLen = RESOLVING.length;

        function findResolving(doc: typeof state.doc) {
          const maxPos = doc.content.size;
          if (resolvingStart + resolvingLen <= maxPos) {
            try {
              const text = doc.textBetween(resolvingStart, resolvingStart + resolvingLen, "");
              if (text === RESOLVING) {
                return { from: resolvingStart, to: resolvingStart + resolvingLen };
              }
            } catch { /* position invalid, fall through */ }
          }
          let result: { from: number; to: number } | null = null;
          doc.descendants((node, pos) => {
            if (result) return false;
            if (node.isTextblock) {
              const idx = node.textContent.indexOf(RESOLVING);
              if (idx !== -1) {
                result = { from: pos + 1 + idx, to: pos + 1 + idx + resolvingLen };
                return false;
              }
            }
          });
          return result;
        }

        // Track whether the original line had prefix/suffix text
        const hadTemplate = !!(prefix || suffix);

        resolveQuestion(query, context)
          .then((answer) => {
            const { state: newState } = view;
            const schema = newState.schema;
            const target = findResolving(newState.doc);

            if (target) {
              const tr = newState.tr;

              if (hadTemplate) {
                // API returned full sentence — replace the entire paragraph
                const $pos = newState.doc.resolve(target.from);
                const paraStart = $pos.before($pos.depth);
                const paraEnd = $pos.after($pos.depth);
                const fullPara = schema.nodes.paragraph.create(null, schema.text(answer));
                tr.replaceWith(paraStart, paraEnd, fullPara);
                const cursorPos = paraStart + 1 + answer.length;
                tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(cursorPos, tr.doc.content.size))));
              } else {
                // No surrounding text — just replace the Resolving… inline
                const answerNode = schema.text(answer);
                tr.replaceWith(target.from, target.to, answerNode);
                const afterAnswer = target.from + answer.length;
                tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(afterAnswer, tr.doc.content.size))));
              }

              view.dispatch(tr);
              view.focus();
            }
            setIsResolving(false);
          })
          .catch(() => {
            const { state: newState } = view;
            const schema = newState.schema;
            const target = findResolving(newState.doc);

            if (target) {
              const errorNode = schema.text("[error]", [schema.marks.italic.create()]);
              const tr = newState.tr;
              tr.replaceWith(target.from, target.to, errorNode);
              const afterError = target.from + "[error]".length;
              tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(afterError, tr.doc.content.size))));
              tr.removeStoredMark(schema.marks.italic);
              view.dispatch(tr);
              view.focus();
            }
            setIsResolving(false);
          });

        return true;
      },
    },
  });

  return (
    <div className="editor-wrapper">
      <div className="editor-title" contentEditable suppressContentEditableWarning>
        Untitled
      </div>
      <EditorContent editor={editor} />
      {isResolving && (
        <div className="resolving-indicator">
          <span className="resolving-dot" />
          Thinking...
        </div>
      )}
    </div>
  );
}
