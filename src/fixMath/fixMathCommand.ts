import { MarkdownView, Notice, Plugin } from 'obsidian';
import type { Editor } from 'obsidian';
import { fixMath } from './fixMath';
import type { MathFixStats } from './fixMath';
import { DEFAULT_COMMAND_MAPPINGS, CommandMapping } from './normalizeLatexCommands';

/** A single undoable editor transaction, including multiple selections. */
export function fixMathInEditor(editor: Editor, mappings: readonly CommandMapping[] = DEFAULT_COMMAND_MAPPINGS): MathFixStats {
    const selections = editor.listSelections().map(({ anchor, head }) => {
        const a = editor.posToOffset(anchor);
        const b = editor.posToOffset(head);
        return { from: Math.min(a, b), to: Math.max(a, b) };
    }).filter(({ from, to }) => from !== to);
    const result = fixMath(editor.getValue(), selections, mappings);
    if (result.changes.length) {
        editor.transaction({
            changes: result.changes.map(({ from, to, text }) => ({
                from: editor.offsetToPos(from),
                to: editor.offsetToPos(to),
                text,
            })),
        });
    }
    return result.stats;
}

export function registerFixMathCommand(
    plugin: Plugin,
    getMappings: () => readonly CommandMapping[] = () => DEFAULT_COMMAND_MAPPINGS,
): void {
    const status = plugin.addStatusBarItem();
    status.setText('Math: ready');
    let resetTimer: number | undefined;
    const updateStatus = (message: string) => {
        if (resetTimer !== undefined) window.clearTimeout(resetTimer);
        status.setText(message);
        resetTimer = window.setTimeout(() => {
            status.setText('Math: ready');
            resetTimer = undefined;
        }, 5000);
    };
    plugin.register(() => {
        if (resetTimer !== undefined) window.clearTimeout(resetTimer);
    });

    const run = () => {
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
            new Notice('Open a Markdown note first.');
            return;
        }
        try {
            const { inlineCount, blockCount, normalizedCount } = fixMathInEditor(view.editor, getMappings());
            const total = inlineCount + blockCount;
            const messages: string[] = [];
            if (total) messages.push(`Converted ${total} formulas (${inlineCount} inline, ${blockCount} display).`);
            if (normalizedCount) messages.push(`Normalized ${normalizedCount} commands.`);
            const message = messages.join(' ') || 'No math conversions needed.';
            new Notice(message);
            updateStatus(message);
        } catch (error) {
            console.error('MathJax Toolkit: math conversion failed.', error);
            new Notice('Could not convert math. See the console for details.');
            updateStatus('Math conversion failed.');
        }
    };
    plugin.addCommand({
        id: 'fix-math',
        name: 'Fix math (selection or current note)',
        checkCallback: (checking) => {
            if (!plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file) return false;
            if (!checking) run();
            return true;
        },
    });
    plugin.addRibbonIcon('dollar-sign', 'Fix math (selection or current note)', run);
}
