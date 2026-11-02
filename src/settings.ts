import { PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type MathjaxToolkitPlugin from './main';
import { DEFAULT_COMMAND_MAPPINGS, CommandMapping } from './fixMath/normalizeLatexCommands';
import { getNormalizationSettingDefinitions } from './fixMath/normalizationSettings';

export interface MathjaxToolkitPluginSettings {
    mathjaxPreambleFilePath: string;
    commandMappings: CommandMapping[];
}

export const DEFAULT_SETTINGS: MathjaxToolkitPluginSettings = {
    mathjaxPreambleFilePath: '',
    commandMappings: DEFAULT_COMMAND_MAPPINGS.map((rule) => ({ ...rule })),
};

export class MathjaxToolkitPluginSettingTab extends PluginSettingTab {
    constructor(public plugin: MathjaxToolkitPlugin) {
        super(plugin.app, plugin);
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                name: 'Preamble file',
                desc: 'Load shared LaTeX definitions and files referenced with \\input{...}.',
                aliases: ['mathjax', 'latex', 'macros', 'preamble', 'input'],
                control: {
                    type: 'file',
                    key: 'mathjaxPreambleFilePath',
                    defaultValue: '',
                    placeholder: 'folder/preamble.tex',
                },
            },
            ...getNormalizationSettingDefinitions(this.plugin, () => this.update()),
        ];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        if (key !== 'mathjaxPreambleFilePath' || typeof value !== 'string') {
            throw new Error(`Unsupported setting: ${key}`);
        }
        const previous = this.plugin.settings.mathjaxPreambleFilePath;
        this.plugin.settings.mathjaxPreambleFilePath = value;
        try {
            await this.plugin.saveSettings(true);
        } catch (error) {
            this.plugin.settings.mathjaxPreambleFilePath = previous;
            throw error;
        }
    }
}
