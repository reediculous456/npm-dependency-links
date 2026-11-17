# npm-dependency-links

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version/reediculous456.npm-dependency-links.svg)](https://marketplace.visualstudio.com/items?itemName=reediculous456.npm-dependency-links)
[![Visual Studio Marketplace Downloads](https://vsmarketplacebadges.dev/downloads/reediculous456.npm-dependency-links.svg)](https://marketplace.visualstudio.com/items?itemName=reediculous456.npm-dependency-links)
[![Visual Studio Marketplace Rating](https://vsmarketplacebadges.dev/rating/reediculous456.npm-dependency-links.svg)](https://marketplace.visualstudio.com/items?itemName=reediculous456.npm-dependency-links)

[![Open VSX Version](https://img.shields.io/open-vsx/v/reediculous456/npm-dependency-links)](https://open-vsx.org/extension/reediculous456/npm-dependency-links)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/reediculous456/npm-dependency-links)](https://open-vsx.org/extension/reediculous456/npm-dependency-links)

Links the dependencies in your package.json to their npmjs.com profile.

## Features

Visit the npmjs.com profile of your dependencies by simply `CMD/Ctrl+click` on the package name in your package.json and pnpm-workspace.yaml.

![link example](images/promo.gif)

## Custom Registry URL

To change the URL, you can set the configuration value in `settings.json` as below:

`"npmDependencyLinks.registryUrlPattern": "http://myCustomRegistry/{{pkg}}/package?queryparams"`

Note that `{{pkg}}` is the only part of the pattern that will be set by this extension. E.g., If your pattern is `http://registry.mysite.com/package?name={{pkg}}?version=latest`. If you click on `npm-dependency-links`, then the resulting URL will be `http://registry.mysite.com/package?name=npm-dependency-links?version=latest`

## Attribution

Based on the original [npm-dependency-links](https://github.com/herrmannplatz/npm-dependency-links) extension by [Rene Herrmann](https://github.com/herrmannplatz).

## Requirements

Visual Studio Code > 1.85.0
