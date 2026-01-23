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

### Updating to a new version

This dependency approach can result in `npm install` not correctly updating the package when changing the version. To fix this, use the following inside your Electric Book Template after changing the version:

```sh
rm -rf node_modules/@electricbookworks/electric-book-modules && rm package-lock.json && npm install
```

Your template should also have shortcut command for this: `npm run update-modules`.

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

Then, inside the template repo that is consuming this package, run:

```
yalc link @electricbookworks/electric-book-modules
```

To push changes the book server template consuming it, run this inside this repo:

```
yalc push
```

To watch for changes and have them automatically pushed with yalc:

```
npm run watch
```

This will have no effect on deployments external to your local machine. To publish all your changes as a new release, follow the instructions under 'Publishing changes' above.