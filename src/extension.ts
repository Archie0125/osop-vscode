import * as vscode from 'vscode';
import * as yaml from 'yaml';

// --- Constants ---

const VALID_NODE_TYPES = [
    'human', 'agent', 'api', 'cli', 'db', 'git',
    'docker', 'cicd', 'mcp', 'system', 'infra', 'data',
] as const;

const VALID_EDGE_MODES = [
    'sequential', 'conditional', 'parallel', 'loop',
    'event', 'fallback', 'error', 'timeout', 'spawn', 'switch',
] as const;

const NODE_TYPE_COLORS: Record<string, string> = {
    human:  '#3B82F6',
    agent:  '#8B5CF6',
    api:    '#10B981',
    cli:    '#F59E0B',
    db:     '#6B7280',
    git:    '#EF4444',
    docker: '#3B82F6',
    cicd:   '#F97316',
    mcp:    '#3B82F6',
    system: '#6B7280',
    infra:  '#10B981',
    data:   '#10B981',
};

// --- Interfaces ---

interface OsopNode {
    id?: unknown;
    type?: unknown;
    subtype?: unknown;
    name?: unknown;
    description?: unknown;
    [key: string]: unknown;
}

interface OsopEdge {
    from?: unknown;
    to?: unknown;
    mode?: unknown;
    label?: unknown;
    condition?: unknown;
    [key: string]: unknown;
}

interface OsopWorkflow {
    osop_version?: unknown;
    id?: unknown;
    name?: unknown;
    description?: unknown;
    nodes?: unknown;
    edges?: unknown;
    [key: string]: unknown;
}

// --- Activation ---

export function activate(context: vscode.ExtensionContext): void {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('osop');
    context.subscriptions.push(diagnosticCollection);

    // Validate on open and save
    if (vscode.window.activeTextEditor) {
        validateDocument(vscode.window.activeTextEditor.document, diagnosticCollection);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                validateDocument(editor.document, diagnosticCollection);
            }
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            validateDocument(document, diagnosticCollection);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            validateDocument(event.document, diagnosticCollection);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri);
        }),
    );

    // Command: Validate
    context.subscriptions.push(
        vscode.commands.registerCommand('osop.validate', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('OSOP: No active editor.');
                return;
            }
            const diagnostics = validateDocument(editor.document, diagnosticCollection);
            if (diagnostics.length === 0) {
                vscode.window.showInformationMessage('OSOP: Validation passed — no issues found.');
            } else {
                vscode.window.showWarningMessage(`OSOP: Found ${diagnostics.length} issue(s). See Problems panel.`);
            }
        }),
    );

    // Command: Preview
    context.subscriptions.push(
        vscode.commands.registerCommand('osop.preview', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('OSOP: No active editor.');
                return;
            }
            showPreview(editor.document, context);
        }),
    );

    // Command: New Workflow
    context.subscriptions.push(
        vscode.commands.registerCommand('osop.newWorkflow', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Workflow ID (e.g., my-workflow)',
                placeHolder: 'my-workflow',
                validateInput: (value) => {
                    if (!value) { return 'Workflow ID is required.'; }
                    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                        return 'ID must contain only letters, numbers, hyphens, and underscores.';
                    }
                    return null;
                },
            });
            if (!name) { return; }
            await createNewWorkflow(name);
        }),
    );

    // Command: Generate Report (placeholder)
    context.subscriptions.push(
        vscode.commands.registerCommand('osop.generateReport', () => {
            vscode.window.showInformationMessage('OSOP: Report generation requires the OSOP CLI. Run: npx osop report <file.osop>');
        }),
    );

    // Auto-preview on open
    const config = vscode.workspace.getConfiguration('osop');
    if (config.get<boolean>('diagram.autoPreview')) {
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor && isOsopDocument(editor.document)) {
                    showPreview(editor.document, context);
                }
            }),
        );
    }
}

export function deactivate(): void {
    // Nothing to clean up
}

// --- Helpers ---

function isOsopDocument(document: vscode.TextDocument): boolean {
    if (document.languageId === 'osop') { return true; }
    const fileName = document.fileName;
    return fileName.endsWith('.osop.yaml') || fileName.endsWith('.osop.yml');
}

// --- Validation ---

function validateDocument(
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection,
): vscode.Diagnostic[] {
    if (!isOsopDocument(document)) { return []; }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    // Try to parse YAML
    let parsed: OsopWorkflow;
    try {
        parsed = yaml.parse(text) as OsopWorkflow;
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid YAML';
        const yamlError = err as { linePos?: Array<{ line: number; col: number }> };
        let range = new vscode.Range(0, 0, 0, 1);
        if (yamlError.linePos && yamlError.linePos.length > 0) {
            const line = Math.max(0, yamlError.linePos[0].line - 1);
            const col = Math.max(0, yamlError.linePos[0].col - 1);
            range = new vscode.Range(line, col, line, col + 1);
        }
        diagnostics.push(new vscode.Diagnostic(range, `YAML parse error: ${message}`, vscode.DiagnosticSeverity.Error));
        diagnosticCollection.set(document.uri, diagnostics);
        return diagnostics;
    }

    if (!parsed || typeof parsed !== 'object') {
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            'OSOP: File must contain a YAML mapping at the top level.',
            vscode.DiagnosticSeverity.Error,
        ));
        diagnosticCollection.set(document.uri, diagnostics);
        return diagnostics;
    }

    // Check required top-level fields
    const requiredFields = ['osop_version', 'id', 'nodes', 'edges'] as const;
    for (const field of requiredFields) {
        if (parsed[field] === undefined || parsed[field] === null) {
            const line = findKeyLine(text, field);
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(line, 0, line, 1),
                `OSOP: Missing required field "${field}".`,
                vscode.DiagnosticSeverity.Error,
            ));
        }
    }

    // Validate nodes
    const nodeIds = new Set<string>();
    if (Array.isArray(parsed.nodes)) {
        for (const node of parsed.nodes as OsopNode[]) {
            if (!node || typeof node !== 'object') { continue; }

            const nodeId = typeof node.id === 'string' ? node.id : undefined;
            const nodeLine = nodeId ? findValueLine(text, 'id', nodeId) : findKeyLine(text, 'nodes');

            if (!nodeId) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(nodeLine, 0, nodeLine, 1),
                    'OSOP: Node is missing required "id" field.',
                    vscode.DiagnosticSeverity.Error,
                ));
            } else {
                if (nodeIds.has(nodeId)) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(nodeLine, 0, nodeLine, 100),
                        `OSOP: Duplicate node ID "${nodeId}".`,
                        vscode.DiagnosticSeverity.Error,
                    ));
                }
                nodeIds.add(nodeId);
            }

            if (node.type === undefined || node.type === null) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(nodeLine, 0, nodeLine, 1),
                    `OSOP: Node "${nodeId ?? '(unknown)'}" is missing required "type" field.`,
                    vscode.DiagnosticSeverity.Error,
                ));
            } else if (typeof node.type === 'string' && !(VALID_NODE_TYPES as readonly string[]).includes(node.type)) {
                const typeLine = findValueLine(text, 'type', node.type);
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(typeLine, 0, typeLine, 100),
                    `OSOP: Invalid node type "${node.type}". Valid types: ${VALID_NODE_TYPES.join(', ')}.`,
                    vscode.DiagnosticSeverity.Warning,
                ));
            }
        }
    }

    // Validate edges
    if (Array.isArray(parsed.edges)) {
        for (const edge of parsed.edges as OsopEdge[]) {
            if (!edge || typeof edge !== 'object') { continue; }

            const fromId = typeof edge.from === 'string' ? edge.from : undefined;
            const toId = typeof edge.to === 'string' ? edge.to : undefined;

            if (!fromId) {
                const line = findKeyLine(text, 'edges');
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 1),
                    'OSOP: Edge is missing required "from" field.',
                    vscode.DiagnosticSeverity.Error,
                ));
            } else if (nodeIds.size > 0 && !nodeIds.has(fromId)) {
                const line = findValueLine(text, 'from', fromId);
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 100),
                    `OSOP: Edge "from" references unknown node "${fromId}".`,
                    vscode.DiagnosticSeverity.Error,
                ));
            }

            if (!toId) {
                const line = findKeyLine(text, 'edges');
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 1),
                    'OSOP: Edge is missing required "to" field.',
                    vscode.DiagnosticSeverity.Error,
                ));
            } else if (nodeIds.size > 0 && !nodeIds.has(toId)) {
                const line = findValueLine(text, 'to', toId);
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 100),
                    `OSOP: Edge "to" references unknown node "${toId}".`,
                    vscode.DiagnosticSeverity.Error,
                ));
            }

            if (edge.mode !== undefined && edge.mode !== null) {
                if (typeof edge.mode === 'string' && !(VALID_EDGE_MODES as readonly string[]).includes(edge.mode)) {
                    const modeLine = findValueLine(text, 'mode', edge.mode);
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(modeLine, 0, modeLine, 100),
                        `OSOP: Invalid edge mode "${edge.mode}". Valid modes: ${VALID_EDGE_MODES.join(', ')}.`,
                        vscode.DiagnosticSeverity.Warning,
                    ));
                }
            }
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
    return diagnostics;
}

function findKeyLine(text: string, key: string): number {
    const lines = text.split('\n');
    const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
    for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) { return i; }
    }
    return 0;
}

function findValueLine(text: string, key: string, value: string): number {
    const lines = text.split('\n');
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*["']?${escapeRegExp(value)}["']?`);
    for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) { return i; }
    }
    return findKeyLine(text, key);
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Preview ---

let previewPanel: vscode.WebviewPanel | undefined;

function showPreview(document: vscode.TextDocument, context: vscode.ExtensionContext): void {
    if (!isOsopDocument(document)) {
        vscode.window.showWarningMessage('OSOP: Active file is not an OSOP workflow.');
        return;
    }

    const text = document.getText();
    let parsed: OsopWorkflow;
    try {
        parsed = yaml.parse(text) as OsopWorkflow;
    } catch {
        vscode.window.showErrorMessage('OSOP: Cannot preview — YAML parse error.');
        return;
    }

    if (!parsed || typeof parsed !== 'object') {
        vscode.window.showErrorMessage('OSOP: Cannot preview — file is not a valid OSOP workflow.');
        return;
    }

    const mermaidCode = generateMermaid(parsed);

    if (previewPanel) {
        previewPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        previewPanel = vscode.window.createWebviewPanel(
            'osopPreview',
            'OSOP Preview',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            },
        );
        previewPanel.onDidDispose(() => {
            previewPanel = undefined;
        }, null, context.subscriptions);
    }

    previewPanel.title = `OSOP: ${typeof parsed.name === 'string' ? parsed.name : typeof parsed.id === 'string' ? parsed.id : 'Preview'}`;
    previewPanel.webview.html = getPreviewHtml(mermaidCode, parsed);

    // Live-update on change
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString() && previewPanel) {
            try {
                const updated = yaml.parse(event.document.getText()) as OsopWorkflow;
                if (updated && typeof updated === 'object') {
                    const updatedMermaid = generateMermaid(updated);
                    previewPanel.webview.html = getPreviewHtml(updatedMermaid, updated);
                }
            } catch {
                // Ignore parse errors during editing
            }
        }
    });
    context.subscriptions.push(changeDisposable);
}

function generateMermaid(workflow: OsopWorkflow): string {
    const lines: string[] = ['graph TD'];
    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes as OsopNode[] : [];
    const edges = Array.isArray(workflow.edges) ? workflow.edges as OsopEdge[] : [];

    // Collect unique types for classDef generation
    const usedTypes = new Set<string>();

    for (const node of nodes) {
        if (!node || typeof node !== 'object') { continue; }
        const id = typeof node.id === 'string' ? node.id : 'unknown';
        const label = typeof node.name === 'string' ? node.name : id;
        const nodeType = typeof node.type === 'string' ? node.type : '';
        const safeLabel = label.replace(/"/g, '#quot;');
        lines.push(`    ${sanitizeMermaidId(id)}["${safeLabel}"]`);
        if (nodeType) { usedTypes.add(nodeType); }
    }

    for (const edge of edges) {
        if (!edge || typeof edge !== 'object') { continue; }
        const from = typeof edge.from === 'string' ? sanitizeMermaidId(edge.from) : 'unknown';
        const to = typeof edge.to === 'string' ? sanitizeMermaidId(edge.to) : 'unknown';
        const label = typeof edge.label === 'string' ? edge.label :
            typeof edge.mode === 'string' && edge.mode !== 'sequential' ? edge.mode : '';
        const safeLabel = label.replace(/"/g, '#quot;');

        if (safeLabel) {
            lines.push(`    ${from} -->|"${safeLabel}"| ${to}`);
        } else {
            lines.push(`    ${from} --> ${to}`);
        }
    }

    // Add classDefs for node types
    for (const nodeType of usedTypes) {
        const color = NODE_TYPE_COLORS[nodeType];
        if (color) {
            lines.push(`    classDef cls_${nodeType} fill:${color},stroke:${color},color:#fff`);
        }
    }

    // Assign classes
    for (const node of nodes) {
        if (!node || typeof node !== 'object') { continue; }
        const id = typeof node.id === 'string' ? node.id : '';
        const nodeType = typeof node.type === 'string' ? node.type : '';
        if (id && nodeType && NODE_TYPE_COLORS[nodeType]) {
            lines.push(`    class ${sanitizeMermaidId(id)} cls_${nodeType}`);
        }
    }

    return lines.join('\n');
}

function sanitizeMermaidId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function getPreviewHtml(mermaidCode: string, workflow: OsopWorkflow): string {
    const title = typeof workflow.name === 'string' ? workflow.name :
        typeof workflow.id === 'string' ? workflow.id : 'OSOP Workflow';
    const description = typeof workflow.description === 'string' ? workflow.description : '';
    const escapedTitle = escapeHtml(title);
    const escapedDesc = escapeHtml(description);
    const escapedMermaid = escapeHtml(mermaidCode);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapedTitle}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #d4d4d4);
        }
        h1 {
            font-size: 1.4em;
            margin: 0 0 4px 0;
            color: var(--vscode-editor-foreground, #d4d4d4);
        }
        .description {
            font-size: 0.9em;
            margin-bottom: 16px;
            opacity: 0.75;
        }
        .mermaid {
            display: flex;
            justify-content: center;
            margin-top: 16px;
        }
        .legend {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 20px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border, #333);
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.8em;
        }
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <h1>${escapedTitle}</h1>
    ${escapedDesc ? `<div class="description">${escapedDesc}</div>` : ''}
    <div class="mermaid">
${escapedMermaid}
    </div>
    <div class="legend">
        ${Object.entries(NODE_TYPE_COLORS).map(([type, color]) =>
            `<span class="legend-item"><span class="legend-color" style="background:${color}"></span>${type}</span>`
        ).join('\n        ')}
    </div>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: 'dark',
            themeVariables: {
                primaryColor: '#3B82F6',
                primaryTextColor: '#fff',
                primaryBorderColor: '#3B82F6',
                lineColor: '#6B7280',
                secondaryColor: '#1e1e1e',
                tertiaryColor: '#1e1e1e',
            }
        });
    </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- New Workflow ---

async function createNewWorkflow(id: string): Promise<void> {
    const scaffold = `osop_version: "1.0"
id: ${id}
name: "${id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}"
description: "Describe what this workflow does."
version: "1.0.0"
tags: []

nodes:
  - id: start
    type: human
    name: Start
    description: "Initial trigger or input."

  - id: process
    type: agent
    subtype: llm
    name: Process
    description: "Main processing step."

  - id: done
    type: system
    name: Done
    description: "Workflow completed."

edges:
  - from: start
    to: process
    mode: sequential

  - from: process
    to: done
    mode: sequential
`;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const baseUri = workspaceFolder ? workspaceFolder.uri : undefined;

    const defaultUri = baseUri
        ? vscode.Uri.joinPath(baseUri, `${id}.osop.yaml`)
        : undefined;

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'OSOP Workflow': ['osop.yaml', 'osop.yml'] },
        title: 'Save New OSOP Workflow',
    });

    if (!saveUri) { return; }

    await vscode.workspace.fs.writeFile(saveUri, Buffer.from(scaffold, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(saveUri);
    await vscode.window.showTextDocument(doc);
}
