import * as path from "node:path";
import * as vscode from "vscode";
import {
  DependencyLink,
  RegistrySettings,
  SelectionChangeKind,
  defaultRegistrySettings,
  findDependencyLinks,
  findLinkAtOffset,
  findPnpmWorkspaceDependencyLinks,
  isModifierLinkActivation
} from "./dependencyLinks";

const CONFIG_NAMESPACE = "npmDependencyLinks";
const UNDERLINE_ONLY_WITH_MODIFIER = "underlineOnlyWithModifier";

interface StringConfigurationInspection {
  globalValue?: string;
  workspaceValue?: string;
  workspaceFolderValue?: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const linkProvider = new NpmDependencyLinkProvider();
  const opener = new ModifierPackagePageOpener();
  const definitionProvider = new NpmDependencyDefinitionProvider(opener);
  const hoverProvider = new NpmDependencyHoverProvider();
  const selector: vscode.DocumentSelector = [
    { language: "json", scheme: "*" },
    { language: "jsonc", scheme: "*" },
    { language: "yaml", scheme: "*" }
  ];
  const modifierSelector: vscode.DocumentSelector = [
    { language: "json", scheme: "*", pattern: "**/package.json" },
    { language: "jsonc", scheme: "*", pattern: "**/package.json" },
    { language: "yaml", scheme: "*", pattern: "**/pnpm-workspace.yaml" }
  ];

  let modifierRegistration: vscode.Disposable | undefined;

  const syncModifierProviders = (): void => {
    const modifierEnabled = underlineOnlyWithModifier();

    if (modifierEnabled && !modifierRegistration) {
      modifierRegistration = vscode.Disposable.from(
        vscode.languages.registerDefinitionProvider(
          modifierSelector,
          definitionProvider
        ),
        vscode.languages.registerHoverProvider(modifierSelector, hoverProvider)
      );
    } else if (!modifierEnabled && modifierRegistration) {
      modifierRegistration.dispose();
      modifierRegistration = undefined;
      opener.clear();
    }

    linkProvider.refresh();
  };

  syncModifierProviders();

  context.subscriptions.push(
    linkProvider,
    opener,
    vscode.languages.registerDocumentLinkProvider(selector, linkProvider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(
          `${CONFIG_NAMESPACE}.${UNDERLINE_ONLY_WITH_MODIFIER}`
        ) ||
        event.affectsConfiguration(`${CONFIG_NAMESPACE}.registryUrlPattern`)
      ) {
        syncModifierProviders();
      }
    }),
    {
      dispose() {
        modifierRegistration?.dispose();
      }
    }
  );
}

export function deactivate(): void {
  // No resources need manual disposal; VS Code owns the registered provider.
}

class NpmDependencyLinkProvider implements vscode.DocumentLinkProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;

  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    if (underlineOnlyWithModifier()) {
      return [];
    }

    const settings = getRegistrySettings();

    if (isPackageJson(document)) {
      return toDocumentLinks(
        document,
        findDependencyLinks(document.getText(), settings)
      );
    }

    if (isPnpmWorkspace(document)) {
      return toDocumentLinks(
        document,
        findPnpmWorkspaceDependencyLinks(document.getText(), settings)
      );
    }

    return [];
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

class NpmDependencyDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly opener: ModifierPackagePageOpener) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.DefinitionLink[] | undefined {
    const link = findLink(document, position);

    if (!link) {
      return;
    }

    const originSelectionRange = linkRange(document, link);
    // Document links always paint an underline. Go to Definition only underlines
    // while the modifier is held, then moves the cursor to this sentinel so the
    // click can be told apart from ordinary edits.
    const sentinel = sentinelPosition(document, originSelectionRange);
    this.opener.arm(document, link.target, originSelectionRange, sentinel);

    const target = new vscode.Range(sentinel, sentinel);
    return [
      {
        originSelectionRange,
        targetUri: document.uri,
        targetRange: target,
        targetSelectionRange: target
      }
    ];
  }
}

class NpmDependencyHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const link = findLink(document, position);

    if (!link) {
      return;
    }

    const contents = new vscode.MarkdownString();
    contents.appendText(`Open ${link.packageName} package page`);
    return new vscode.Hover(contents, linkRange(document, link));
  }
}

class ModifierPackagePageOpener implements vscode.Disposable {
  private pending:
    | {
        documentUri: string;
        target: string;
        origin: vscode.Range;
        sentinel: vscode.Position;
        armedAt: number;
      }
    | undefined;
  private restoring = false;
  private disposed = false;
  private readonly lastSelections = new Map<string, vscode.Selection>();
  private readonly selectionListener = vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      this.onSelectionChange(event);
    }
  );

  arm(
    document: vscode.TextDocument,
    target: string,
    origin: vscode.Range,
    sentinel: vscode.Position
  ): void {
    const documentUri = document.uri.toString();
    // Ctrl+click moves the cursor onto the package name before asking for a
    // definition. Remember that selection even if its change event has not
    // arrived yet, so the following jump still counts as a link activation.
    const editor = vscode.window.visibleTextEditors.find(
      (candidate) =>
        candidate.document.uri.toString() === documentUri &&
        selectionTouches(candidate.selection, origin)
    );

    if (editor) {
      this.lastSelections.set(documentUri, editor.selection);
    }

    this.pending = {
      documentUri,
      target,
      origin,
      sentinel,
      armedAt: Date.now()
    };
  }

  clear(): void {
    this.pending = undefined;
    this.lastSelections.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.selectionListener.dispose();
    this.clear();
  }

  private onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    const selection = event.selections[0];

    if (!selection || this.restoring || !underlineOnlyWithModifier()) {
      return;
    }

    const key = event.textEditor.document.uri.toString();
    const pending = this.pending;
    const previous = this.lastSelections.get(key);

    if (
      pending &&
      key === pending.documentUri &&
      isModifierLinkActivation({
        kind: toSelectionChangeKind(event.kind),
        atSentinel: isCollapsedAt(selection, pending.sentinel),
        ageMs: Date.now() - pending.armedAt,
        previousOnLink:
          previous !== undefined && selectionTouches(previous, pending.origin)
      })
    ) {
      const target = pending.target;
      this.pending = undefined;
      this.restoreSoon(event.textEditor, previous);
      openPackagePage(target);
      return;
    }

    this.lastSelections.set(key, selection);
  }

  private restoreSoon(
    editor: vscode.TextEditor,
    selection: vscode.Selection | undefined
  ): void {
    if (!selection) {
      return;
    }

    setTimeout(() => {
      if (this.disposed || editor.document.isClosed) {
        return;
      }

      this.restoring = true;
      editor.selection = selection;
      this.restoring = false;
    }, 0);
  }
}

function toDocumentLinks(
  document: vscode.TextDocument,
  dependencyLinks: ReturnType<typeof findDependencyLinks>
): vscode.DocumentLink[] {
  return dependencyLinks.map((link) => {
    const range = linkRange(document, link);
    const documentLink = new vscode.DocumentLink(
      range,
      vscode.Uri.parse(link.target)
    );

    documentLink.tooltip = `Open ${link.packageName} package page`;
    return documentLink;
  });
}

function findLink(
  document: vscode.TextDocument,
  position: vscode.Position
): DependencyLink | undefined {
  return findLinkAtOffset(dependencyLinks(document), document.offsetAt(position));
}

function dependencyLinks(document: vscode.TextDocument): DependencyLink[] {
  const settings = getRegistrySettings();
  const text = document.getText();

  if (isPackageJson(document)) {
    return findDependencyLinks(text, settings);
  }

  if (isPnpmWorkspace(document)) {
    return findPnpmWorkspaceDependencyLinks(text, settings);
  }

  return [];
}

function linkRange(
  document: vscode.TextDocument,
  link: DependencyLink
): vscode.Range {
  return new vscode.Range(
    document.positionAt(link.startOffset),
    document.positionAt(link.endOffset)
  );
}

function sentinelPosition(
  document: vscode.TextDocument,
  origin: vscode.Range
): vscode.Position {
  return document.lineAt(origin.start.line).range.end;
}

function isCollapsedAt(
  selection: vscode.Selection,
  position: vscode.Position
): boolean {
  return selection.isEmpty && selection.active.isEqual(position);
}

function selectionTouches(
  selection: vscode.Selection,
  origin: vscode.Range
): boolean {
  return origin.contains(selection.active) || origin.contains(selection.anchor);
}

function toSelectionChangeKind(
  kind: vscode.TextEditorSelectionChangeKind | undefined
): SelectionChangeKind {
  switch (kind) {
    case vscode.TextEditorSelectionChangeKind.Keyboard:
      return "keyboard";
    case vscode.TextEditorSelectionChangeKind.Mouse:
      return "mouse";
    case vscode.TextEditorSelectionChangeKind.Command:
      return "command";
    default:
      return "unknown";
  }
}

function openPackagePage(target: string): void {
  let uri: vscode.Uri;

  try {
    uri = vscode.Uri.parse(target, true);
  } catch {
    return;
  }

  if (uri.scheme === "http" || uri.scheme === "https") {
    void vscode.env.openExternal(uri);
    return;
  }

  void vscode.commands.executeCommand("vscode.open", uri);
}

function isPackageJson(document: vscode.TextDocument): boolean {
  return getDocumentBasename(document) === "package.json";
}

function isPnpmWorkspace(document: vscode.TextDocument): boolean {
  return getDocumentBasename(document) === "pnpm-workspace.yaml";
}

function getDocumentBasename(document: vscode.TextDocument): string {
  if (document.uri.scheme === "untitled") {
    return path.basename(document.fileName).toLowerCase();
  }

  const uriPath = document.uri.path || document.fileName;
  return path.posix.basename(uriPath).toLowerCase();
}

function underlineOnlyWithModifier(): boolean {
  return (
    vscode.workspace
      .getConfiguration(CONFIG_NAMESPACE)
      .get(UNDERLINE_ONLY_WITH_MODIFIER) === true
  );
}

function getRegistrySettings(): RegistrySettings {
  const defaults = defaultRegistrySettings();
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const patternInspection = config.inspect<string>("registryUrlPattern");
  const explicitPattern = getConfiguredValue(patternInspection);

  if (explicitPattern !== undefined) {
    return {
      registryUrlPattern: explicitPattern
    };
  }

  return defaults;
}

function getConfiguredValue(
  inspection: StringConfigurationInspection | undefined
): string | undefined {
  const configuredValue =
    inspection?.workspaceFolderValue ??
    inspection?.workspaceValue ??
    inspection?.globalValue;

  return typeof configuredValue === "string" ? configuredValue : undefined;
}
