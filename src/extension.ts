import * as path from "node:path";
import * as vscode from "vscode";
import {
  RegistrySettings,
  defaultRegistrySettings,
  findDependencyLinks,
  findPnpmWorkspaceDependencyLinks
} from "./dependencyLinks";

const CONFIG_NAMESPACE = "npmDependencyLinks";

interface StringConfigurationInspection {
  globalValue?: string;
  workspaceValue?: string;
  workspaceFolderValue?: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new NpmDependencyLinkProvider();
  const selector: vscode.DocumentSelector = [
    { language: "json", scheme: "*" },
    { language: "jsonc", scheme: "*" },
    { language: "yaml", scheme: "*" }
  ];

  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(selector, provider)
  );
}

export function deactivate(): void {
  // No resources need manual disposal; VS Code owns the registered provider.
}

class NpmDependencyLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
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
}

function toDocumentLinks(
  document: vscode.TextDocument,
  dependencyLinks: ReturnType<typeof findDependencyLinks>
): vscode.DocumentLink[] {
  return dependencyLinks.map((link) => {
    const range = new vscode.Range(
      document.positionAt(link.startOffset),
      document.positionAt(link.endOffset)
    );
    const documentLink = new vscode.DocumentLink(
      range,
      vscode.Uri.parse(link.target)
    );

    documentLink.tooltip = `Open ${link.packageName} package page`;
    return documentLink;
  });
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
