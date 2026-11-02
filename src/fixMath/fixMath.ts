import { convertMath, ConversionStats } from './fixMathConversions';
import { normalizeLatexCommands, DEFAULT_COMMAND_MAPPINGS, CommandMapping } from './normalizeLatexCommands';

export interface TextRange { from: number; to: number }
export interface MathFixChange extends TextRange { text: string }
export interface MathFixStats extends ConversionStats { normalizedCount: number }
export interface MathFixResult {
    changes: MathFixChange[];
    stats: MathFixStats;
}

interface ProtectedRange extends TextRange { math: boolean }

function escaped(text: string, index: number): boolean {
    let count = 0;
    while (index > 0 && text[--index] === '\\') count++;
    return count % 2 === 1;
}

function closing(text: string, token: string, start: number): number {
    let index = text.indexOf(token, start);
    while (index !== -1 && escaped(text, index)) {
        index = text.indexOf(token, index + token.length);
    }
    return index;
}

function balancedEnd(text: string, start: number, open: string, close: string): number {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (escaped(text, i)) continue;
        if (text[i] === open) depth++;
        if (text[i] === close && --depth === 0) return i + 1;
    }
    return -1;
}

/** Locate protected content in the FULL document, even for partial selections. */
function protectedRanges(text: string): ProtectedRange[] {
    const ranges: ProtectedRange[] = [];
    let i = 0;
    while (i < text.length) {
        let end = -1;
        let math = false;
        if (i === 0 || text[i - 1] === '\n') {
            const lineEnd = text.indexOf('\n', i);
            const next = lineEnd === -1 ? text.length : lineEnd + 1;
            const line = text.slice(i, next).replace(/\r?\n$/, '');
            const unquoted = line.replace(/^[ \t]*(?:>[ \t]*)*/, '');
            const fence = unquoted.match(/^(`{3,}|~{3,})(.*)$/);
            if (fence) {
                const marker = fence[1]!;
                end = text.length;
                let pos = next;
                while (pos < text.length) {
                    const newline = text.indexOf('\n', pos);
                    const after = newline === -1 ? text.length : newline + 1;
                    const candidate = text.slice(pos, after)
                        .replace(/^[ \t]*(?:>[ \t]*)*/, '').trimEnd();
                    if (candidate.length >= marker.length &&
                        Array.from(candidate).every((ch) => ch === marker[0])) {
                        end = after;
                        break;
                    }
                    pos = after;
                }
            } else if (i === 0 && line.replace(/^\uFEFF/, '') === '---') {
                const match = /^(?:---|\.\.\.)[ \t]*\r?$/gm;
                match.lastIndex = next;
                const found = match.exec(text);
                end = found ? found.index + found[0].length : text.length;
            } else if (/^(?: {4}|\t)/.test(line) ||
                /^[ \t]*(?:>[ \t]*)*\[[^\]\n]+\]:/.test(line)) {
                end = next;
            }
        }

        if (end === -1 && text.startsWith('<!--', i)) {
            const close = text.indexOf('-->', i + 4);
            end = close === -1 ? text.length : close + 3;
        }
        if (end === -1 && text[i] === '`' && !escaped(text, i)) {
            const run = text.slice(i).match(/^`+/)![0];
            let pos = i + run.length;
            while ((pos = text.indexOf(run, pos)) !== -1) {
                if (text[pos - 1] !== '`' && text[pos + run.length] !== '`') {
                    end = pos + run.length;
                    break;
                }
                pos += run.length;
            }
        }
        if (end === -1 && text[i] === '$' && !escaped(text, i)) {
            const token = text.startsWith('$$', i) ? '$$' : '$';
            const close = closing(text, token, i + token.length);
            if (close !== -1) {
                end = close + token.length;
                math = true;
            }
            else if (token === '$$') end = text.length;
        }
        if (end === -1 && text[i] === '[' && !escaped(text, i)) {
            if (text.startsWith('[[', i)) {
                const close = text.indexOf(']]', i + 2);
                if (close !== -1) end = close + 2;
            } else {
                const labelEnd = balancedEnd(text, i, '[', ']');
                if (labelEnd !== -1) {
                    if (text[i + 1] === '^') end = labelEnd;
                    else if (text[labelEnd] === '(') {
                        end = balancedEnd(text, labelEnd, '(', ')');
                    } else if (text[labelEnd] === '[') {
                        end = balancedEnd(text, labelEnd, '[', ']');
                    }
                }
            }
        }
        if (end === -1 && text[i] === '<') {
            const match = text.slice(i).match(/^<(?:https?:\/\/[^>\n]+|[^<>\s]+@[^<>\s]+|\/?[a-zA-Z][^>\n]*)>/);
            if (match) end = i + match[0].length;
        }
        if (end > i) {
            ranges.push({ from: i, to: end, math });
            i = end;
            continue;
        }
        // Explicit LaTeX math is eligible for conversion as one unit. Do not
        // mistake its internal brackets/dollars for Markdown syntax.
        if (text[i] === '\\' && !escaped(text, i) &&
            (text[i + 1] === '(' || text[i + 1] === '[')) {
            const token = text[i + 1] === '(' ? '\\)' : '\\]';
            const close = closing(text, token, i + 2);
            if (close !== -1) {
                i = close + 2;
                continue;
            }
        }
        i++;
    }
    return ranges;
}

/** Return editor changes without writing to the vault or normalizing newlines. */
export function fixMath(
    text: string,
    selections?: TextRange[],
    mappings: readonly CommandMapping[] = DEFAULT_COMMAND_MAPPINGS,
): MathFixResult {
    const stats: MathFixStats = { inlineCount: 0, blockCount: 0, normalizedCount: 0 };
    const changes: MathFixChange[] = [];
    const protectedSpans = protectedRanges(text);
    const selected = selections?.length ? selections : [{ from: 0, to: text.length }];
    const ranges: TextRange[] = [];
    for (const range of [...selected].sort((a, b) => a.from - b.from)) {
        const from = Math.max(0, Math.min(range.from, text.length));
        const to = Math.max(from, Math.min(range.to, text.length));
        const previous = ranges[ranges.length - 1];
        if (previous && from <= previous.to) previous.to = Math.max(previous.to, to);
        else ranges.push({ from, to });
    }
    const convert = (from: number, to: number) => {
        if (from >= to) return;
        const original = text.slice(from, to);
        const counts: ConversionStats = { inlineCount: 0, blockCount: 0 };
        const newline = text.includes('\r\n') ? '\r\n' : '\n';
        let converted = convertMath(original.replace(/\r\n/g, '\n'), counts)
            .replace(/\n/g, newline);
        if (converted !== original && counts.inlineCount + counts.blockCount > 0) {
            const replacements = protectedRanges(converted).filter((span) => span.math)
                .flatMap((span) => normalizeLatexCommands(converted.slice(span.from, span.to), 0, span.to - span.from, mappings)
                    .map((change) => ({
                        ...change, from: change.from + span.from, to: change.to + span.from,
                    })));
            for (const replacement of [...replacements].reverse()) {
                converted = converted.slice(0, replacement.from) + replacement.text + converted.slice(replacement.to);
            }
            changes.push({ from, to, text: converted });
            stats.inlineCount += counts.inlineCount;
            stats.blockCount += counts.blockCount;
            stats.normalizedCount += replacements.length;
        }
    };
    for (const range of ranges) {
        let cursor = range.from;
        for (const span of protectedSpans) {
            if (span.to <= cursor) continue;
            if (span.from >= range.to) break;
            convert(cursor, Math.min(span.from, range.to));
            if (span.math) {
                const replacements = normalizeLatexCommands(
                    text.slice(span.from, span.to),
                    Math.max(range.from, span.from) - span.from,
                    Math.min(range.to, span.to) - span.from,
                    mappings,
                );
                changes.push(...replacements.map((change) => ({
                    ...change, from: change.from + span.from, to: change.to + span.from,
                })));
                stats.normalizedCount += replacements.length;
            }
            cursor = Math.max(cursor, Math.min(span.to, range.to));
        }
        convert(cursor, range.to);
    }
    return { changes, stats };
}
