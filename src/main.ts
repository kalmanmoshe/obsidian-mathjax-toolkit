import { Plugin, Notice, MarkdownView, loadMathJax } from 'obsidian';
import { MathjaxToolkitPluginSettingTab, DEFAULT_SETTINGS, MathjaxToolkitPluginSettings } from './settings';
import { processPreamble } from './processPreamble';
import { MathJaxBidiPatcher, MathJaxEngine } from './mathjaxBidi';

export default class MathjaxToolkitPlugin extends Plugin {
    settings: MathjaxToolkitPluginSettings = { ...DEFAULT_SETTINGS };
    private bidiPatcher?: MathJaxBidiPatcher;
    private disposed = false;
    private configurationVersion = 0;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new MathjaxToolkitPluginSettingTab(this));
        this.app.workspace.onLayoutReady(() => {
            void this.configMathJax();
        });
    }

    onunload(): void {
        this.disposed = true;
        this.configurationVersion++;
        this.bidiPatcher?.destroy();
        this.bidiPatcher = undefined;
        this.refreshMathViews();
    }

    async configMathJax(): Promise<void> {
        const version = ++this.configurationVersion;
        try {
            await loadMathJax();
            const mathJax = (window as unknown as { MathJax?: MathJaxEngine }).MathJax;
            if (!mathJax?.startup?.promise) {
                throw new Error('MathJax is not available.');
            }
            await mathJax.startup.promise;
            if (this.disposed || version !== this.configurationVersion) return;

            if (!this.bidiPatcher) {
                this.bidiPatcher = new MathJaxBidiPatcher(mathJax, () => this.getTextFont());
            }

            const path = this.settings.mathjaxPreambleFilePath.trim();
            if (path) {
                const preamble = await processPreamble(path, this);
                if (this.disposed || version !== this.configurationVersion) return;
                if (preamble?.trim()) {
                    mathJax.tex2mml(preamble);
                }
            }
            this.refreshMathViews();
        } catch (error) {
            if (this.disposed || version !== this.configurationVersion) return;
            console.error('MathJax Toolkit: configuration failed.', error);
            new Notice('Could not configure the math renderer. See the console for details.');
        }
    }

    private getTextFont(): string {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const element = view?.contentEl.querySelector<HTMLElement>(
            '.cm-content, .markdown-preview-view',
        ) ?? view?.contentEl ?? document.body;
        const ownerWindow = element.ownerDocument.defaultView;
        return ownerWindow?.getComputedStyle(element).fontFamily || 'serif';
    }

    private refreshMathViews(): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {
                leaf.view.editor?.refresh();
                leaf.view.previewMode.rerender(true);
            }
        });
    }

    private async loadSettings(): Promise<void> {
        const data: unknown = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings(didMathjaxFileLocationChange = false): Promise<void> {
        await this.saveData(this.settings);
        if (didMathjaxFileLocationChange) {
            this.app.workspace.onLayoutReady(() => {
                void this.configMathJax();
            });
        }
    }
}
