import { PluginSettingTab, setIcon, Setting } from "obsidian";
import MathjaxToolkitPlugin from "./main";
import { addFileSearchSetting, setPluginInstance } from "obsidian-dev-utils";

export interface MathjaxToolkitPluginSettings {
    mathjaxPreambleFilePath: string;
}

export const DEFAULT_SETTINGS: MathjaxToolkitPluginSettings = {
    mathjaxPreambleFilePath: '',
};

export class MathjaxToolkitPluginSettingTab extends PluginSettingTab {
    plugin: MathjaxToolkitPlugin;

    constructor(plugin: MathjaxToolkitPlugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
        setPluginInstance(plugin);
    }

    addHeading(containerEl: HTMLElement, name: string, icon = 'math') {
        const heading = new Setting(containerEl).setName(name).setHeading();
        const parentEl = heading.settingEl;
        const iconEl = parentEl.createDiv();
        setIcon(iconEl, icon);
        iconEl.addClass('latex-compiler-math-settings-icon');
        parentEl.prepend(iconEl);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        this.displayPreambleSettings();
    }

    private displayPreambleSettings() {
        const containerEl = this.containerEl;
        this.addHeading(containerEl, 'Preamble', 'pencil');

        addFileSearchSetting(
            containerEl,
            (value: unknown) => {
                if (typeof value !== 'string') return;
                this.plugin.settings.mathjaxPreambleFilePath = value;
                void this.plugin.saveSettings(true).catch((error: unknown) => {
                    console.error('MathJax Toolkit: could not save settings.', error);
                });
            },
            {
                name: 'Mathjax preamble file path',
                description:
                    'Path relative to the vault. Loads shared LaTeX definitions and files referenced with \\input{...}. Changes reload the preamble.',
                placeholder: DEFAULT_SETTINGS.mathjaxPreambleFilePath,
                defValue: this.plugin.settings.mathjaxPreambleFilePath,
                debounce: { timeout: 5000, resetTimer: true },
            },
        );
    }
}
