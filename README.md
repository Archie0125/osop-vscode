# OSOP VS Code Extension

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Part of SOP Doc.** Read and write .osop files with full IDE support.

Syntax highlighting, real-time validation, Mermaid preview panel, 16 code snippets. See errors before you run. Author SOP Doc content directly in VS Code.

Website: [osop.ai](https://osop.ai) | GitHub: [github.com/osop/osop-vscode](https://github.com/osop/osop-vscode)

## Features

- **Syntax highlighting** — Custom TextMate grammar for `.osop.yaml` files with semantic token coloring for node types, edge modes, and keywords
- **Schema validation** — Real-time validation against the OSOP JSON Schema with inline error diagnostics
- **Autocomplete** — IntelliSense for node types, edge modes, top-level keys, and field values
- **Hover documentation** — Hover over node types, fields, and keywords to see inline documentation
- **Snippets** — Quick-insert templates for common patterns (new workflow, step node, decision node, fork/join, etc.)
- **Diagram preview** — Side panel rendering of the workflow as a Mermaid diagram (requires Mermaid extension)

## Installation

Search for **OSOP** in the VS Code Extensions Marketplace, or install from the command line:

```bash
code --install-extension osop.osop-vscode
```

## Usage

1. Create or open a file with the `.osop.yaml` extension
2. The extension activates automatically
3. Start typing to see autocomplete suggestions
4. Errors and warnings appear inline as you edit
5. Hover over any node type or keyword for documentation

## Snippets

| Prefix | Description |
|--------|-------------|
| `osop-new` | New OSOP workflow scaffold |
| `osop-step` | Step node |
| `osop-decision` | Decision node with condition |
| `osop-fork-join` | Fork and join pair |
| `osop-approval` | Approval gate node |
| `osop-retry` | Retry wrapper node |
| `osop-loop` | Loop node |
| `osop-webhook` | Webhook node |
| `osop-subprocess` | Subprocess reference |

## Development

```bash
git clone https://github.com/osop/osop-vscode.git
cd osop-vscode
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
