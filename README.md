# MathJax Toolkit

Loads a vault-relative LaTeX preamble (including nested `\input{...}` files)
and enables native browser bidirectional layout in `\text{...}`.

The bidi implementation targets the MathJax 4.1.3 CommonHTML renderer used in
Obsidian. It inherits the surrounding text font, supplies a font family to
direct conversions, and marks browser-rendered text with `dir="auto"` and
`unicode-bidi: isolate`. Input characters remain in their original order.
The equation container keeps LTR layout. Both synchronous and asynchronous
CommonHTML conversion functions are wrapped and restored on plugin unload.

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

## Validation

`npm test` checks renderer integration, option forwarding, and unload behavior
with DOM doubles. `npm run build` type-checks and creates `main.js`.

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
