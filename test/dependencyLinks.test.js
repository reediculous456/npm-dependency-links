const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  buildRegistryUrl,
  findDependencyLinks,
  findLinkAtOffset,
  findPnpmWorkspaceDependencyLinks,
  isModifierLinkActivation
} = require("../dist/dependencyLinks");

describe("findDependencyLinks", () => {
  it("links package names in supported dependency sections", () => {
    const text = `{
  "name": "demo",
  "dependencies": {
    "react": "^19.0.0",
    "@types/node": "^26.0.0"
  },
  "devDependencies": {
    "node:test": "^1.0.0"
  },
  "scripts": {
    "test": "node --test"
  }
}`;

    const links = findDependencyLinks(text, {
      registryUrlPattern: "https://registry.example/{{pkg}}"
    });

    assert.deepEqual(
      links.map((link) => link.packageName),
      ["react", "@types/node", "node:test"]
    );
    assert.deepEqual(
      links.map((link) => text.slice(link.startOffset, link.endOffset)),
      ["react", "@types/node", "node:test"]
    );
    assert.equal(links[1].target, "https://registry.example/@types/node");
  });

  it("ignores invalid JSON and non-object dependency sections", () => {
    assert.deepEqual(findDependencyLinks("{", {}), []);
    assert.deepEqual(
      findDependencyLinks(`{ "dependencies": ["react"] }`, {}),
      []
    );
  });

  it("parses JSONC package files with comments and trailing commas", () => {
    const text = `{
  // package deps
  "optionalDependencies": {
    "fsevents": "^2.0.0",
  },
}`;

    assert.deepEqual(
      findDependencyLinks(text, {}).map((link) => link.packageName),
      ["fsevents"]
    );
  });

  it("skips local workspace protocol dependencies", () => {
    const text = `{
  "dependencies": {
    "@acme/local": "workspace:*",
    "@acme/local-caret": "workspace:^",
    "react": "^19.0.0"
  }
}`;

    assert.deepEqual(
      findDependencyLinks(text, {}).map((link) => link.packageName),
      ["react"]
    );
  });
});

describe("findPnpmWorkspaceDependencyLinks", () => {
  it("links packages in default and named pnpm catalogs", () => {
    const text = `packages:
  - packages/*

catalog:
  react: ^19.0.0
  "@types/node": ^26.0.0

catalogs:
  react18:
    react: ^18.0.0
    "react-dom": ^18.0.0

ignored:
  lodash: ^4.0.0
`;

    const links = findPnpmWorkspaceDependencyLinks(text, {
      registryUrlPattern: "https://registry.example/{{pkg}}"
    });

    assert.deepEqual(
      links.map((link) => link.packageName),
      ["react", "@types/node", "react", "react-dom"]
    );
    assert.deepEqual(
      links.map((link) => text.slice(link.startOffset, link.endOffset)),
      ["react", "@types/node", "react", "react-dom"]
    );
    assert.equal(links[1].target, "https://registry.example/@types/node");
  });

  it("skips local workspace protocol catalog entries", () => {
    const text = `catalog:
  "@acme/local": workspace:*
  react: ^19.0.0
`;

    assert.deepEqual(
      findPnpmWorkspaceDependencyLinks(text, {}).map((link) => link.packageName),
      ["react"]
    );
  });
});

describe("buildRegistryUrl", () => {
  it("replaces every package token in a registry URL pattern", () => {
    assert.equal(
      buildRegistryUrl("npm-dependency-links", {
        registryUrlPattern: "https://example.test/{{pkg}}?name={{pkg}}"
      }),
      "https://example.test/npm-dependency-links?name=npm-dependency-links"
    );
  });

  it("falls back to the default registry URL pattern", () => {
    assert.equal(
      buildRegistryUrl("react", {
        registryUrlPattern: ""
      }),
      "https://www.npmjs.com/package/react"
    );
  });
});

describe("findLinkAtOffset", () => {
  it("returns the link whose range contains the offset, including the end boundary", () => {
    const links = [
      { packageName: "react", target: "https://example.test/react", startOffset: 10, endOffset: 15 },
      { packageName: "vite", target: "https://example.test/vite", startOffset: 30, endOffset: 34 }
    ];

    assert.equal(findLinkAtOffset(links, 10)?.packageName, "react");
    assert.equal(findLinkAtOffset(links, 15)?.packageName, "react");
    assert.equal(findLinkAtOffset(links, 16), undefined);
    assert.equal(findLinkAtOffset(links, 32)?.packageName, "vite");
  });
});

describe("isModifierLinkActivation", () => {
  it("accepts a recent command or unknown jump onto the sentinel", () => {
    assert.equal(
      isModifierLinkActivation({
        kind: "command",
        atSentinel: true,
        ageMs: 20,
        previousOnLink: true
      }),
      true
    );
    assert.equal(
      isModifierLinkActivation({
        kind: "unknown",
        atSentinel: true,
        ageMs: 20,
        previousOnLink: true
      }),
      true
    );
  });

  it("ignores keyboard and mouse selections, stale jumps, and other positions", () => {
    assert.equal(
      isModifierLinkActivation({
        kind: "keyboard",
        atSentinel: true,
        ageMs: 20,
        previousOnLink: true
      }),
      false
    );
    assert.equal(
      isModifierLinkActivation({
        kind: "mouse",
        atSentinel: true,
        ageMs: 20,
        previousOnLink: true
      }),
      false
    );
    assert.equal(
      isModifierLinkActivation({
        kind: "command",
        atSentinel: true,
        ageMs: 1501,
        previousOnLink: true
      }),
      false
    );
    assert.equal(
      isModifierLinkActivation({
        kind: "command",
        atSentinel: false,
        ageMs: 20,
        previousOnLink: true
      }),
      false
    );
    assert.equal(
      isModifierLinkActivation({
        kind: "command",
        atSentinel: true,
        ageMs: 20,
        previousOnLink: false
      }),
      false
    );
  });
});
