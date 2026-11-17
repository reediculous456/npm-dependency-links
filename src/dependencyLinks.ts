import { Node, parseTree } from "jsonc-parser";

export interface DependencyLink {
  packageName: string;
  target: string;
  startOffset: number;
  endOffset: number;
}

export interface RegistrySettings {
  registryUrlPattern?: string;
}

const DEFAULT_REGISTRY_URL_PATTERN = "https://www.npmjs.com/package/{{pkg}}";

const DEPENDENCY_SECTIONS = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundleDependencies",
  "bundledDependencies"
]);

export function findDependencyLinks(
  documentText: string,
  settings: RegistrySettings
): DependencyLink[] {
  const root = parseTree(documentText);

  if (!root || root.type !== "object") {
    return [];
  }

  const links: DependencyLink[] = [];

  for (const sectionNode of getObjectProperties(root)) {
    const sectionName = getPropertyName(sectionNode);

    if (!sectionName || !DEPENDENCY_SECTIONS.has(sectionName)) {
      continue;
    }

    const dependenciesNode = getPropertyValue(sectionNode);

    if (!dependenciesNode || dependenciesNode.type !== "object") {
      continue;
    }

    for (const dependencyNode of getObjectProperties(dependenciesNode)) {
      const packageNameNode = getPropertyKey(dependencyNode);
      const packageVersionNode = getPropertyValue(dependencyNode);
      const packageName = getStringValue(packageNameNode);
      const packageVersion = getStringValue(packageVersionNode);

      if (
        !packageName ||
        packageNameNode.length < 2 ||
        isWorkspaceVersion(packageVersion)
      ) {
        continue;
      }

      links.push({
        packageName,
        target: buildRegistryUrl(packageName, settings),
        startOffset: packageNameNode.offset + 1,
        endOffset: packageNameNode.offset + packageNameNode.length - 1
      });
    }
  }

  return links;
}

export function findPnpmWorkspaceDependencyLinks(
  documentText: string,
  settings: RegistrySettings
): DependencyLink[] {
  const links: DependencyLink[] = [];
  let insideCatalog = false;

  for (const line of iterateLines(documentText)) {
    if (/^catalogs?:/.test(line.text)) {
      insideCatalog = true;
      continue;
    }

    if (!insideCatalog) {
      continue;
    }

    if (/^\w+:/.test(line.text)) {
      insideCatalog = false;
      continue;
    }

    const catalogDependency =
      line.text.match(/^\s+"([^"]+)"\s*:\s+(.+?)\s*$/) ??
      line.text.match(/^\s+([a-z0-9][\w./@-]*):\s+(.+?)\s*$/i);
    const packageName = catalogDependency?.[1];
    const packageVersion = catalogDependency?.[2];

    if (!packageName || isWorkspaceVersion(packageVersion)) {
      continue;
    }

    const startOffset = line.offset + line.text.indexOf(packageName);

    links.push({
      packageName,
      target: buildRegistryUrl(packageName, settings),
      startOffset,
      endOffset: startOffset + packageName.length
    });
  }

  return links;
}

export function buildRegistryUrl(
  packageName: string,
  settings: RegistrySettings
): string {
  const pattern =
    settings.registryUrlPattern?.trim() || DEFAULT_REGISTRY_URL_PATTERN;
  return pattern.replaceAll("{{pkg}}", packageName);
}

export function defaultRegistrySettings(): Required<RegistrySettings> {
  return {
    registryUrlPattern: DEFAULT_REGISTRY_URL_PATTERN
  };
}

function getObjectProperties(node: Node): Node[] {
  return node.children?.filter((child) => child.type === "property") ?? [];
}

function getPropertyKey(propertyNode: Node): Node {
  return propertyNode.children?.[0] as Node;
}

function getPropertyValue(propertyNode: Node): Node | undefined {
  return propertyNode.children?.[1];
}

function getPropertyName(propertyNode: Node): string | undefined {
  return getStringValue(getPropertyKey(propertyNode));
}

function getStringValue(node: Node | undefined): string | undefined {
  return node?.type === "string" && typeof node.value === "string"
    ? node.value
    : undefined;
}

function isWorkspaceVersion(version: string | undefined): boolean {
  return version?.trim().startsWith("workspace:") ?? false;
}

function* iterateLines(
  documentText: string
): Generator<{ text: string; offset: number }> {
  const linePattern = /(.*)(\r\n|\n|\r|$)/g;

  for (const match of documentText.matchAll(linePattern)) {
    if (match[0] === "") {
      break;
    }

    yield {
      text: match[1],
      offset: match.index ?? 0
    };
  }
}
