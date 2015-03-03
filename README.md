# gulp-bower-subset [![NPM version][npm-image]][npm-url] [![Build status][travis-image]][travis-url]

Automate bower dependencies sources, taking into consideration subsets when specified

## Usage

First, install `gulp-bower-subset` as a development dependency for your project:

```shell
npm install --save-dev gulp-bower-subset
```

Then, add it to your `Gulpfile.js`:

```javascript
var bower = require( 'gulp-bower-subset' );

gulp.task( 'dependencies', function(){
  return bower()
    .pipe( gulp.dest( 'build/' ) );
} );
```

this will output all your bower dependencies in the `./build` folder

## API

`gulp-bower-subset` accepts an optional `options` parameter where you can define the following:

### `options.cwd`
Type: `String`

this options should indicate the application root path, where your `bower.json` file can be found, this will default to the current folder if not specified.

The following example combines (using `gulp-concat`) all the dependencies for a project found in the `module` subfolder into one file

```javascript
var bower   = require( 'gulp-bower-subset' ),
    concat  = require( 'gulp-concat' );

gulp.task( 'dependencies', function(){
  return bower( {
    cwd: './module'
  } )
    .pipe( concat( 'combined.js' ) )
    .pipe( gulp.dest( 'build/' ) );
} );
```

### options.directory
Type: `String`

This is the directory path (relative to `options.cwd`) where your bower components are installed, if not informed it will check the `directory` entry in a possible `.bowerrc` file, falling back to `bower_components` (bower default components folder).

The following example will combine (using `gulp-concat`) and minify (using `gulp-uglify`) your bower dependencies that are installed in a custom `bower_modules` folder

```javascript
var bower   = require( 'gulp-bower-subset' ),
    concat  = require( 'gulp-concat' ),
    uglify  = require( 'gulp-uglify' );

gulp.task( 'dependencies', function(){
  return bower( {
    directory: 'bower_modules'
  } )
    .pipe( concat( 'combined.js' ) )
    .pipe( gulp.dest( 'build/' ) )
    .pipe( uglify() )
    .pipe( gulp.dest( 'build/' ) );
} );
```

### options.command
Type: `String`

By default before streaming bower dependencies this plugin will execute `bower install` command in the `options.pwd` folder, after this command finishes the plugin will process the dependencies. Use the `options.command` to modify the command to be executed by the plugin (e.g: pass `'update'` will execute bower update). If you don't want any command to be executed prior to processing the dependencies then assign `options.command` to `null`;

The following example bypass the bower command by passing `null` to `options.command` - it build on the previous example by providing source maps (using `gulp-sourcemaps`) for the minified file:

```javascript
var bower       = require( 'gulp-bower-subset' ),
    concat      = require( 'gulp-concat' ),
    uglify      = require( 'gulp-uglify' ),
    sourcemaps  = require( 'gulp-sourcemaps' );

gulp.task( 'dependencies', function(){
  return bower( {
    command: null
  } )
    .pipe( concat( 'combined.js' ) )
    .pipe( gulp.dest( 'build/' ) )
    .pipe( sourcemaps.init() )
    .pipe( uglify() )
    .pipe( sourcemaps.write( '.' ) )
    .pipe( gulp.dest( 'build/' ) );
} );
```

Any extra parameters passed to the `options` object will be used by the bower command.

For example the following executes a bower update before processing the project dependencies:

```javascript
var bower       = require( 'gulp-bower-subset' ),
    concat      = require( 'gulp-concat' ),
    uglify      = require( 'gulp-uglify' ),
    sourcemaps  = require( 'gulp-sourcemaps' );

gulp.task( 'dependencies', function(){
  return bower( {
    command: 'update',
    dkdkd: 'dkdkdk'
  } )
    .pipe( concat( 'combined.js' ) )
    .pipe( gulp.dest( 'build/' ) )
    .pipe( sourcemaps.init() )
    .pipe( uglify() )
    .pipe( sourcemaps.write( '.' ) )
    .pipe( gulp.dest( 'build/' ) );
} );
```

### `options.binders`
Type: `String`

Full path to a custom binders folder, where you can create special binders for components subsets not originally supported by `gulp-bower-subset`.

To understand more about `subset` and `binders` read the following section.

## Subsets

More often than not client applications needs only a subset of some of its dependencies - this allows the application to have better control over its dependencies. To active this define a `dependencies-subset` entry in the `bower.json` file for your project with the necessary subset for each component.

How to define subsets will vary from component to component, by default `gulp-bower-subset` will treat each subset item as individual file entries and it will include each in the stream instead of the main component file.

For example to include `handlebars`, but only the runtime as your project dependency you can:

`bower.json` file:
```json
"dependencies": {
  "handlebars": "3.0.0",
},
"dependencies-subset": {
  "handlebars": {
    scripts: [ "handlebars.runtime.js" ]
  }
}
```

Some components though won't come with specific subsets already compiled as files as did `handlebars`, for example when you install `modernizr` using `bower` it comes with all the tests in one file `modernizr.js`, and if you are just interested in some of them, there won't be any pre-compiled files available. In order to solve this `gulp-bower-subset` comes with special binders for common components (see full list here) that will process the subsets for components that don't provide pre-compiled files.

So for example to compile `modernizer` with only a few subset items you can:

`bower.json` file:
```json
"dependencies": {
  "modernizr": "2.8.3",
},
"dependencies-subset": {
  "modernizr": {
    scripts: [
      "css/fontface",
      "inputtypes",
      "testStyles",
      "testProp",
      "domPrefixes",
      "forms/placeholder",
      "load"
    ]
  }
}
```

If the component you are using in your project doesn't have a special binder yet, you can create one by following this template and passing the `options.binders` with the path for the special binders - each binder file should be named the same as the component name in the bower `dependencies` entry.

Each binder is a nodejs file that should export a `process` method, this method should expect two parameters: `cPath` (full path to the component folder) and subset (the subset entry from the bower.json file for the specific component) - and the method should return a list of vinyl files 

[travis-url]: http://travis-ci.org/lazd/gulp-replace
[travis-image]: https://secure.travis-ci.org/lazd/gulp-replace.svg?branch=master
[npm-url]: https://npmjs.org/package/gulp-replace
[npm-image]: https://badge.fury.io/js/gulp-replace.svg
