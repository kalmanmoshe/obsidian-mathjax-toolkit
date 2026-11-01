import { normalizePath, Notice } from "obsidian";
import MathjaxToolkitPlugin from "./main";

const inputFileRegex = /\\input\{([^}]+)\}/g;

function resolveVaultPath(
    baseDirectory: string,
    requestedPath: string
): string {
    const combinedPath = requestedPath.startsWith("/")
        ? requestedPath.slice(1)
        : baseDirectory
          ? `${baseDirectory}/${requestedPath}`
          : requestedPath;

    const resolvedParts: string[] = [];

    for (const part of combinedPath.split("/")) {
        if (!part || part === ".") {
            continue;
        }

        if (part === "..") {
            if (resolvedParts.length === 0) {
                throw new Error(
                    `Path escapes the vault root: ${requestedPath}`
                );
            }

            resolvedParts.pop();
            continue;
        }

        resolvedParts.push(part);
    }

    return normalizePath(resolvedParts.join("/"));
}

function getParentPath(path: string): string {
    const normalizedPath = normalizePath(path);
    const lastSlashIndex = normalizedPath.lastIndexOf("/");

    return lastSlashIndex === -1
        ? ""
        : normalizedPath.slice(0, lastSlashIndex);
}

function showProcessingError(message: string, error?: unknown): void {
    console.error(message, error);
    new Notice(message, 7000);
}

export async function processPreamble(
    preamblePath: string,
    plugin: MathjaxToolkitPlugin,
    processingStack: Set<string> = new Set()
): Promise<string | undefined> {
    const normalizedPreamblePath = normalizePath(preamblePath);

    if (processingStack.has(normalizedPreamblePath)) {
        const chain = [...processingStack, normalizedPreamblePath].join(" -> ");

        showProcessingError(
            `Preamble processing error: circular \\input{} detected: ${chain}`
        );

        return undefined;
    }

    processingStack.add(normalizedPreamblePath);

    try {
        let preamble: string;

        try {
            preamble = await plugin.app.vault.adapter.read(
                normalizedPreamblePath
            );
        } catch (error) {
            showProcessingError(
                `Preamble processing error: failed to read ` +
                    `"${normalizedPreamblePath}".`,
                error
            );

            return undefined;
        }

        const baseDirectory = getParentPath(normalizedPreamblePath);
        const matches = [...preamble.matchAll(inputFileRegex)];

        let result = "";
        let previousEnd = 0;

        for (const match of matches) {
            const requestedPath = match[1]?.trim();
            const matchIndex = match.index;

            if (!requestedPath || matchIndex === undefined) {
                continue;
            }

            let resolvedPath: string;

            try {
                resolvedPath = resolveVaultPath(
                    baseDirectory,
                    requestedPath
                );
            } catch (error) {
                showProcessingError(
                    `Preamble processing error for ` +
                        `\\input{${requestedPath}} in ` +
                        `"${normalizedPreamblePath}".`,
                    error
                );

                return undefined;
            }

            const inputContent = await processPreamble(
                resolvedPath,
                plugin,
                processingStack
            );

            if (inputContent === undefined) {
                // The recursive call already logged the specific error
                // and displayed a Notice.
                return undefined;
            }

            result += preamble.slice(previousEnd, matchIndex);
            result += inputContent;

            previousEnd = matchIndex + match[0].length;
        }

        result += preamble.slice(previousEnd);

        return result;
    } finally {
        processingStack.delete(normalizedPreamblePath);
    }
}