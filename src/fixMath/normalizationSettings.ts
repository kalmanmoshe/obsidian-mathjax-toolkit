import { Modal, Notice, Setting } from 'obsidian';
import type { App, SettingDefinitionItem } from 'obsidian';
import { commandName, CommandMapping, validateCommandMappings } from './normalizeLatexCommands';

interface SettingsHost {
    app: App;
    settings: { commandMappings: CommandMapping[] };
    saveSettings(): Promise<void>;
}

async function persistMappings(host: SettingsHost, next: CommandMapping[], update: () => void): Promise<void> {
    const previous = host.settings.commandMappings;
    host.settings.commandMappings = next;
    try {
        await host.saveSettings();
    } catch (error) {
        if (host.settings.commandMappings === next) host.settings.commandMappings = previous;
        throw error;
    }
    update();
}

/** Definitions are cheap to build and index; no DOM or I/O until an action runs. */
export function getNormalizationSettingDefinitions(host: SettingsHost, update: () => void): SettingDefinitionItem[] {
    const edit = (mapping?: CommandMapping) => new CommandMappingModal(host, update, mapping).open();
    return [
        {
            name: 'Command replacements',
            desc: 'Normalize LaTeX commands when fixing math; removing every replacement disables normalization.',
            aliases: ['normalization', 'symbols', 'preferred commands', 'wedge', 'land', 'replace'],
            action: () => edit(),
        },
        {
            type: 'list',
            heading: 'Command normalization',
            emptyState: 'No command replacements. Normalization is disabled.',
            addItem: { name: 'Add replacement', action: () => edit() },
            onDelete: (index) => {
                void persistMappings(host, host.settings.commandMappings.filter((_, i) => i !== index), update)
                    .catch((error: unknown) => {
                        console.error('MathJax Toolkit: could not remove command replacement.', error);
                        new Notice('Could not remove the replacement. Please try again.');
                        update();
                    });
            },
            items: host.settings.commandMappings.map((mapping) => ({
                name: `${mapping.from} → ${mapping.to}`,
                desc: 'Edit this command replacement.',
                aliases: ['command normalization', commandName(mapping.from), commandName(mapping.to)],
                action: (_element, index) => {
                    const current = host.settings.commandMappings[index];
                    if (current) edit(current);
                },
            })),
        },
    ];
}

class CommandMappingModal extends Modal {
    private source: string;
    private target: string;
    private saving = false;

    constructor(
        private readonly host: SettingsHost,
        private readonly updateSettings: () => void,
        private readonly original?: CommandMapping,
    ) {
        super(host.app);
        this.source = original?.from ?? '';
        this.target = original?.to ?? '';
    }

    onOpen(): void {
        this.setTitle(this.original ? 'Edit command replacement' : 'Add command replacement');
        this.contentEl.empty();
        new Setting(this.contentEl)
            .setName('Source command')
            .setDesc('Command to replace, with or without a backslash.')
            .addText((text) => text.setPlaceholder('\\wedge').setValue(this.source)
                .onChange((value) => { this.source = value; }));
        new Setting(this.contentEl)
            .setName('Preferred command')
            .setDesc('Replacement command, with or without a backslash.')
            .addText((text) => text.setPlaceholder('\\land').setValue(this.target)
                .onChange((value) => { this.target = value; }));
        const errorEl = this.contentEl.createEl('p', {
            cls: 'setting-item-description',
            attr: { role: 'alert' },
        });
        new Setting(this.contentEl)
            .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
            .addButton((button) => button.setButtonText('Save').setCta().onClick(() => {
                if (this.saving) return;
                const replacement = { from: '\\' + commandName(this.source), to: '\\' + commandName(this.target) };
                const next = [...this.host.settings.commandMappings];
                if (this.original) {
                    const index = next.indexOf(this.original);
                    if (index === -1) {
                        errorEl.setText('This replacement was removed. Close this form and add a new one.');
                        return;
                    }
                    next[index] = replacement;
                } else next.push(replacement);
                const error = validateCommandMappings(next);
                if (error) {
                    errorEl.setText(error);
                    return;
                }
                errorEl.setText('');
                this.saving = true;
                button.setDisabled(true);
                void persistMappings(this.host, next, this.updateSettings)
                    .then(() => this.close())
                    .catch((error: unknown) => {
                        console.error('MathJax Toolkit: could not save command replacement.', error);
                        errorEl.setText('Could not save the replacement. Please try again.');
                    })
                    .finally(() => {
                        this.saving = false;
                        button.setDisabled(false);
                    });
            }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
