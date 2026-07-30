# Electric Book Modules

A distributable package of modules used in the Electric Book Template and derivations thereof.

## Publishing changes

Commit all changes and push to origin.

To automatically publish the package changes as an incremental patch, run:

```
npm run release
```

This will bump the current patch version (the third value) by one.

To update to a new minor or major verion, first change the version in the package.json file, and then run:

```
npm run first-release
```

### Installing in your Electric Book Template

Add it as a dependency using the direct GitHub repo and tag version approach, replacing `{tag}` with the version:

```js
"dependencies": {
  "@electricbookworks/electric-book-modules": "github:electricbookworks/electric-book-modules#{tag}"
}
```

Then install it: `npm install`.

## Installation copies files into parent package

When you install this package via npm, the `postinstall` script automatically runs and:

1. Copies root folders defined in `FOLDERS_TO_SYNC` inside `install.js` from this package to the parent package.
2. Creates `.gitignore` files in copied folders to prevent tracking their contents
3. Syncs custom files. The parent package can customise the contents of these folders by using the `{folder-name}-custom` pattern. For example, `_tools-custom/some/file.js` in the parent package will be copied into the resulting `_tools/some/file.js` that gets installed in the parent package. It will overwrite any same named file.
3. Creates a `gulpfile.js` in the root of the parent package that imports the full source of `_tools/gulpfile.js`
4. Creates a log file (`electric-book-modules-install.log`) for debugging purposes if there are any errors.

### Updating to a new version

This dependency approach can result in `npm install` not correctly updating the package when changing the version. To fix this, use the following inside your Electric Book Template after changing the version:

```sh
rm -rf node_modules/@electricbookworks/electric-book-modules && rm package-lock.json && npm install
```

Your template should also have a shortcut command for this: `npm run update-modules`.

# Using [yalc](https://github.com/wclr/yalc) for local development

To view changes to this package locally from the template importing it without having to create a new release each time, use [yalc](https://github.com/wclr/yalc).

Install `yalc`:

```
npm i yalc -g
```

Publish this package to your local machine store, by running this in the root of this repo:

```
yalc publish
```

Inside the template that is consuming this package, run:

```
yalc link @electricbookworks/electric-book-modules
```

Add this `postyalc` property to `scripts` inside the consuming template's package.json:

```
"scripts": {
  "postyalc": "node node_modules/@electricbookworks/electric-book-modules/install.js"
}
```

To push changes to the book template consuming it, run this inside this repo:

```
yalc push
```

To watch for changes and have them automatically pushed with yalc:

```
npm run watch
```

This will have no effect on deployments external to your local machine. To publish all your changes as a new release, follow the instructions under 'Publishing changes' above.

When you're done, run `yalc remove @electricbookworks/electric-book-modules` in the template to restore the GitHub-tag dependency and clean up `.yalc`/`yalc.lock`.
