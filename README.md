# MathJax Toolkit

Loads a vault-relative LaTeX preamble (including nested `\input{...}` files)
and enables native browser bidirectional layout in `\text{...}`.

The bidi implementation targets the MathJax 4.1.3 CommonHTML renderer used in
Obsidian. It inherits the surrounding text font, supplies a font family to
direct conversions, and marks browser-rendered text with `dir="auto"` and
`unicode-bidi: isolate`. Input characters remain in their original order.
The equation container keeps LTR layout. Both synchronous and asynchronous
CommonHTML conversion functions are wrapped and restored on plugin unload.

Requires Obsidian **1.14.1** or newer, the release that introduced MathJax 4.1.3.

## Use

Build with `npm run build`, then fully restart Obsidian once to clear any old
renderer patches and temporary console settings. Enable MathJax Toolkit.
Remove experimental CSS rules that force direction on MathJax text or letters.
No extra RTL macro is needed:

```latex
$$
\text{אם the claim is true אז הטענה נכונה}
$$
```

Select your preamble file in the plugin settings. Changing the path reloads
definitions; editing the file itself requires reloading the plugin. MathJax's
previous macro definitions are not removed when changing or clearing the path;
restart Obsidian to reset them.

## Fix pasted math

Run **Fix math (selection or current note)** from the command palette or click
the **$** ribbon button. A non-empty selection limits conversion to that text;
multiple selections are supported. Otherwise the active note is processed.
The command uses a single editor transaction, so Undo reverses the conversion.
It does not run automatically on paste or process other notes.

- Converts `\(...\)` to `$...$` and `\[...\]` to display math.
- Detects math in ordinary parentheses and single/multiline square brackets,
  including quoted math, variables, derivatives and formatted numbers.
- Repairs common AI export artifacts in newly converted display blocks,
  including damaged matrix row separators and heading artifacts.
- Normalizes preferred LaTeX commands inside formulas: `\wedge` → `\land`.
  This happens automatically when running **Fix math**, including inside existing
  `$...$` and `$$...$$`. It matches complete commands and skips comments and text
  arguments such as `\text{...}`. Normalization counts are reported separately.
- Preserves existing dollar delimiters, fenced/inline/indented code, links,
  wikilinks, footnotes, frontmatter and HTML comments untouched. This protection
  uses the full document even when the selection is inside a protected block.
- Reports inline/display counts in a notice and status bar, which resets after
  five seconds.

Detection in ordinary parentheses is heuristic: `(p)` and `(42)` are treated as
math, while prose is generally retained. Use a selection to limit the scope.
You can assign a shortcut under Settings → Hotkeys. Display conversions use
`$$` delimiters. Original line endings and final-newline state are
preserved outside converted content.

Under **Settings → MathJax Toolkit → Command normalization**, use
the **+ / Add replacement** control to open the add form. Enter the source and
preferred command, then click **Save**. Click a replacement to edit it, or use
its native delete control to remove it. Command names may include or omit the leading backslash.
Changes are saved and used by the next conversion without reloading the plugin.
Deleting every rule disables normalization. Duplicate sources, invalid command
names and cycles are rejected. Chains resolve to their final preferred command
in one pass.

The preamble file picker and command replacements use Obsidian's declarative
settings API and appear in global settings search. Search by a setting name or
by a command such as `wedge` or `land`. Adding, editing or deleting a replacement
refreshes both the settings list and search index.

The conversion engine is adapted from
[Fix Math for Obsidian](https://github.com/loglux/fix-math-for-obsidian),
Copyright (c) 2025 Vladislav Sorokin, under the MIT license. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development checks

The math conversion feature is grouped in `src/fixMath/`:

- `fixMathCommand.ts`: command, ribbon button and editor integration.
- `fixMath.ts`: Markdown protection and conversion ranges.
- `fixMathConversions.ts`: conversion engine adapted from Fix Math.
- `normalizeLatexCommands.ts`: preferred command mappings and token-aware normalization.
- `normalizationSettings.ts`: add/edit/remove interface for saved command mappings.

`npm test` checks conversion behavior, Markdown protection and editor transactions.
`npm run build` type-checks and creates `main.js`.

Check these examples visually in both Reading view and Live Preview:

```latex
\text{שלילה (הפיכת טענה מאמת לשקר וההפך)}
\text{אם the claim is true אז הטענה נכונה}
\text{נבדקו 123 מקרים בגרסה version 4.1.3}
\text{This claim נכון רק לפעמים}
\frac{\text{מספר valid cases}}{\text{כל המקרים}} + x^{\text{חזקה}}
\begin{array}{|c|c|}\hline A & \text{טענה (true or false)}\\\hline\end{array}
\text{טענה \textbf{חשובה} עם English words}
```

Plain mixed text and parentheses were verified interactively during development.
Nested formatting or math can produce separate text runs, each with its own
automatic direction; full paragraph ordering across such runs is not guaranteed.
Table layout, nested formatting, and other renderers still need visual checks
in Obsidian. Inactive views without caller-supplied font information use the
active Markdown view's text font (or the document font as a fallback).
