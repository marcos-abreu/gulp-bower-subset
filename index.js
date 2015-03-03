/*
 * Custom bower plugin to extract dependencies taking into consideration
 * subsets when required
 */

var bower     = require( 'bower' ),
    path      = require( 'path' ),
    fs        = require( 'fs' ),
    through   = require( 'through2' ),
    gutil     = require( 'gulp-util' ),
    _         = require( 'lodash' ),
    when      = require( 'when' ),
    walk      = require( 'walk' ),
    minimatch = require( 'minimatch' );

/*
 * Promise based read file method, with optional JSON parsing
 *
 * @param   string    path      file absolute path to read
 * @param   boolean   outJson   optional flag indicating if the result should be parsed before returned
 *
 * @returns mixed               file content either as a string, or a JSON object depending on the optional JSON flag
 */
var readFile = function( path, outJson ) {
  return when.promise( function( resolve, reject ) {
    fs.readFile( path, function( error, data ) {
      // if gets an error reading the file then emit a stream error and stop the stream
      if ( error ) {
        return reject( error );
      }
      // parse the json data into a consumable object
      if ( outJson ) {
        return resolve( JSON.parse( data ) );
      }
      else {
        return resolve( data );
      }
    } );
  } );
};

/*
 * Search a js file name that starts with the provided string, but is not minified
 *
 * @param   string    name              name of the component
 * @param   string    baseDir           base dependencies folder
 * @returns string                      path to the found file or undefined
 */
var searchJSMatch = function( name, baseDir ) {
  return when.promise( function( resolve, reject ) {

    var folder = path.join( baseDir, name ),
        startsWith = name;

    fs.readdir( folder, function( err, files ) {
      var found;

      if ( err ) {
        return reject( err );
      }

      // find files starting with the component's name
      found = minimatch.match( files, ( startsWith + '*.js' ), { matchBase: true } );

      // if not found then verify if the name ends with js and if so strips it on a new search
      //    this happens because some components include js in their name, but not in the main file
      //    e.g: momentjs (component's name) moment.js (main file's name)
      if ( found.length === 0 && name.indexOf( 'js' ) === name.length - 2 ) {
        startsWith = name.substr( 0, name.length - 2 );
        found = minimatch.match( files, ( startsWith + '*.js' ), { matchBase: true } );
      }

      // if not found then search for anything that has at least half of the component's name
      //    jquery plugins (specially the ones bower install using the source)
      //    e.g: jquery.elastic-1.6.11 (component's name) jquery.elastic.source.js (main file's name)
      if ( found.length === 0 ) {
        startsWith = name.substr( 0, Math.ceil( name.length / 2 ) );
        found = minimatch.match( files, ( startsWith + '*.js' ), { matchBase: true } );
      }

      // if not found then search for `index`
      //    when installing file as a bowser component, bower will create a folder with the name of the component,
      //    and the file will be called index.js
      if ( found.length === 0 ) {
        startsWith = 'index';
        found = minimatch.match( files, ( startsWith + '*.js' ), { matchBase: true } );
      }

      // exclude any minified file
      found = minimatch.match( found, '!*.min.js', { matchBase: true } );

      if ( found && found.length > 0 ) {
        return resolve( path.join( baseDir, name, found[ 0 ] ) );
      }

      reject( 'didn\'t find file for: ' + name );
    } );
  } );
};

/*
 * Promised based dependency processing method
 *   fetch dependency file path and add its content to the stream
 *
 * @param   stream    stream        file stream
 * @param   string    baseDir       base folder path for dependencies
 * @param   object    name          dependency object where key is the dependency name, and value its version
 * @param   object    subsetConf    subset configuration object
 *
 * @returns
 */
var processDependency = function( stream, baseDir, name, subsetConf ) {
  var subset,
      getFilePath,
      filePath,
      manifestPath,
      internalManifestPath;

  // verify if only a subset of the module should used
  if ( subsetConf ) {
    try {
      subset = require( './subset/' + name );
    }
    catch( e ) {
      stream.emit( 'error', new gutil.PluginError( 'gulp-wp-bower', e.message || e ) );
      return;
    }

    getFilePath = subset.process( path.join( baseDir, name ), subsetConf );
  }

  // otherwise use main submodule file
  else {

    manifestPath = path.join( baseDir, name, 'bower.json' );
    internalManifestPath = path.join( baseDir, name, '.bower.json' );
    manifestPath = fs.existsSync( manifestPath ) ? manifestPath : ( fs.existsSync( internalManifestPath ) ? internalManifestPath : void 0 );

    if ( manifestPath ) {
      getFilePath = readFile( manifestPath, true )
        .then( function( data ) {
          if ( data.main ) {
            if ( Array.isArray( data.main ) ) {
              // filter only for js files first
              data.main = minimatch.match( data.main, '*.js', { matchBase: true } );
              data.main = data.main[ 0 ]; // todo: verify what to do if the main entry is an array, instead of just getting
                                          //       the first item as it is currently implemented.
                                          // based on the bootstrap example the only thing we have to do is filter by files
                                          // (hopefully just one) with `.js` extension
            }

            return path.join( baseDir, name, data.main );
          }
          // this is a fallback for example for backbone 1.0 where the bower file doesn't have the main entry
          else {
            return searchJSMatch( name, baseDir );
          }
        } );
    }
    else {
      getFilePath = searchJSMatch( name, baseDir );
    }
  }

  return when( getFilePath )
    .then( function( fPath ) {
      filePath = fPath;
      return readFile( fPath );
    } )
    .then( function( fileContent ) {
      var result = {};
      result[ name ] = {
        path: filePath,
        content: fileContent
      };
      return result;
    } )
    .catch( function( e ) {
      stream.emit( 'error', new gutil.PluginError( 'gulp-wp-bower', e.message || e ) );
      return;
    } );
};

/*
 * Stream project dependencies based on bower - with custom optional subset per dependency
 *        by default the script will attempt to run 'bower update' or whatever bower command
 *        the developer specifies, and only then create the stream of dependencies for the project
 *
 * @param   object    options     plugin options
 * @returns stream
 *
 * Options:
 *    command     - bower command to execute before extracting the dependencies - defaults to `update`
 *    cwd         - absolute path to the application folder (defaults to the current folder path)
 *    directory   - bower modules directory (relative to `cwd`) - if not informed the script will try
 *                    to access the `.bowerrc` and it will default to `./bower_components` otherwise
 *    ...         - any other options will be passed to the `command`
 */
module.exports = function( options ) {
  var stream,           // result stream
      dependencies,     // list of dependencies as defined by the bower manifest file
      baseDir,          // absolute path to the bower components folder
      bowerrc,          // absolute path to `.bowerrc` config file
      bowerOptions,     // bower options from `.bowerrc`
      command;          // command to execute before creating stream

  // create the stream
  stream = through.obj( function( file, enc, callback ) {
    this.push( file );
    callback();
  } );

  // parse options
  options = options || {};

  // base application folder
  options.cwd = options.cwd || process.cwd(); // default to current folder if base folder not provided

  // bower components folder
  if ( !options.directory ) {
    bowerrc = path.join( options.cwd, '.bowerrc' );
    if ( fs.existsSync( bowerrc ) ) {
      try {
        bowerOptions = JSON.parse( fs.readFileSync( bowerrc ) );
      }
      catch( e ) {
        bowerOptions = {};
      }

      options.directory = bowerOptions.directory;
    }
    options.directory = options.directory || './bower_components';
  }

  // bower command to perform
  command = options.command || 'update';
  delete options.command; // remove since the remaining properties will be passed as arguments to the bower command

  baseDir = path.join( options.cwd, options.directory );

  // execute bower command
  bower.commands[ command ].apply( bower.commands, options )
    // log bower messages
    .on( 'log', function( result ) {
      gutil.log( [ 'bower', gutil.colors.cyan( result.id ), result.message ].join( ' ' ) );
    } )

    // stop the stream on error and log it
    .on( 'error', function( error ) {
      stream.emit( 'error', new gutil.PluginError( 'gulp-wp-bower', error ) );
      stream.end(); // end the stream if got an error on the bower command since files won't be processed
    } )

    // after executing the command lets process the dependencies
    .on( 'end', function() {

      readFile( path.join( options.cwd, 'bower.json' ), true )
        .then( function( data ) {
          var processed = [];

          dependencies = data.dependencies || [];
          _.each( dependencies, function( key, dependency ) {
            var subsetConf = data[ 'dependencies-subset' ] ? data[ 'dependencies-subset' ][ dependency ] : void 0;

            processed.push( processDependency( stream, baseDir, dependency, subsetConf ) );
          } );

          return when.all( processed );
        } )
        .then( function( results ) {

          // write all files following the dependency order
          // doing this after, since the dependencies were processed async
          _.each( dependencies, function( key, dependency ) {
            var dep = _.find( results, dependency );

            dep = dep[ dependency ];
            if ( dep && dep.path && dep.content ) {
              stream.write( new gutil.File( {
                path: dep.path,
                contents: dep.content
              } ) );
            }
          } );

          // close the stream after writing all files
          stream.end();
        } )
        .catch( function( e ) {
          stream.emit( 'error', new gutil.PluginError( 'gulp-wp-bower', e.message || e ) );
          stream.end();
        } );
    } );

  // return the stream
  return stream;
};
