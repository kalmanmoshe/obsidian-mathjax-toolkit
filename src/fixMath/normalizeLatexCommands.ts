export interface CommandMapping { from: string; to: string }

export const DEFAULT_COMMAND_MAPPINGS: readonly CommandMapping[] = [
    { from: '\\wedge', to: '\\land' },
];

export function commandName(value: string): string {
    return value.trim().replace(/^\\/, '');
}

export function validateCommandMappings(mappings: readonly CommandMapping[]): string | undefined {
    const commands = new Map<string, string>();
    for (const mapping of mappings) {
        const from = commandName(mapping.from);
        const to = commandName(mapping.to);
        if (!/^[A-Za-z@]+$/.test(from) || !/^[A-Za-z@]+$/.test(to)) {
            return 'Enter one command name in each field, for example \\wedge and \\land.';
        }
        if (commands.has(from)) return `A replacement for \\${from} already exists.`;
        commands.set(from, to);
    }
    for (const source of commands.keys()) {
        const visited = new Set<string>();
        let current = source;
        while (commands.has(current)) {
            if (visited.has(current)) return 'Replacements must not form a cycle or replace a command with itself.';
            visited.add(current);
            current = commands.get(current)!;
        }
    }
    return undefined;
}

export function loadCommandMappings(value: unknown): CommandMapping[] {
    const defaults = () => DEFAULT_COMMAND_MAPPINGS.map((rule) => ({ ...rule }));
    if (!Array.isArray(value)) return defaults();
    const rules: CommandMapping[] = [];
    for (const item of value as unknown[]) {
        if (!item || typeof item !== 'object' ||
            !('from' in item) || typeof item.from !== 'string' ||
            !('to' in item) || typeof item.to !== 'string') return defaults();
        rules.push({ from: '\\' + commandName(item.from), to: '\\' + commandName(item.to) });
    }
    return validateCommandMappings(rules) ? defaults() : rules;
}

function preferredCommands(mappings: readonly CommandMapping[]): Map<string, string> {
    const error = validateCommandMappings(mappings);
    if (error) throw new Error(error);
    const commands = new Map(mappings.map(({ from, to }) => [commandName(from), commandName(to)]));
    const resolved = new Map<string, string>();
    for (const [source, target] of commands) {
        let preferred = target;
        while (commands.has(preferred)) preferred = commands.get(preferred)!;
        resolved.set(source, preferred);
    }
    return resolved;
}

const textCommands = new Set([
    'text', 'textrm', 'textnormal', 'textbf', 'textit', 'textsf', 'texttt',
    'textup', 'textsl', 'textsc', 'mbox', 'hbox', 'operatorname',
]);

export interface CommandReplacement {
    from: number;
    to: number;
    text: string;
}

/** Scan a formula in context, changing only complete command tokens in range. */
export function normalizeLatexCommands(
    formula: string,
    from = 0,
    to = formula.length,
    mappings: readonly CommandMapping[] = DEFAULT_COMMAND_MAPPINGS,
): CommandReplacement[] {
    const commands = preferredCommands(mappings);
    const changes: CommandReplacement[] = [];
    let index = 0;
    while (index < formula.length) {
        if (formula[index] === '%') {
            const newline = formula.indexOf('\n', index);
            index = newline === -1 ? formula.length : newline + 1;
            continue;
        }
        if (formula[index] !== '\\') {
            index++;
            continue;
        }
        const start = index++;
        const command = formula.slice(index).match(/^[A-Za-z@]+/)?.[0];
        if (!command) {
            // A control symbol consumes its following character, including \\.
            index++;
            continue;
        }
        index += command.length;
        if (command === 'verb') {
            if (formula[index] === '*') index++;
            const delimiter = formula[index];
            const end = delimiter ? formula.indexOf(delimiter, index + 1) : -1;
            index = end === -1 ? formula.length : end + 1;
            continue;
        }
        if (textCommands.has(command)) {
            let cursor = index;
            if (formula[cursor] === '*') cursor++;
            while (/\s/.test(formula[cursor] ?? '') && cursor < formula.length) cursor++;
            if (formula[cursor] === '{') {
                let depth = 1;
                cursor++;
                while (cursor < formula.length && depth > 0) {
                    const ch = formula[cursor++];
                    if (ch === '\\') cursor++;
                    else if (ch === '{') depth++;
                    else if (ch === '}') depth--;
                }
                index = cursor;
            }
            continue;
        }
        const preferred = commands.get(command);
        if (preferred && start >= from && index <= to) {
            changes.push({ from: start, to: index, text: '\\' + preferred });
        }
    }
    return changes;
}
