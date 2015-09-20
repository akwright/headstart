'use strict';

// Require modules

var
	deps                = require('../dependencies'),
	utils               = require('../utils'),
	cli                 = require('../cli'),
	settings            = require('../settings')
;

// Define task

deps.undertaker.task('templates', deps.gulp.series('clean-rev', function (cb) {
	cli.toggleTaskSpinner('Compiling templates');

	// If assebly is off, export all folders and files
	if (!settings.config.assembleTemplates) {
		deps.fs.src([settings.templatesFolder + '/**/*', '!' + settings.templatesFolder + '/*.*', '!_*'])
			.pipe(deps.fs.dest(settings.config.exportTemplates));
	}

	// Find number of "root" templates to parse and keep count
	var numTemplates = deps.globule.find([settings.templatesFolder + '/*.*', '!_*']).length,
		count = 0,
		unvalidatedFiles = [];

	// Go over all root template files
	deps.fs.src([settings.templatesFolder + '/*.*', '!_*'])
		.pipe(deps.plugins.tap(function (htmlFile) {
			var
				// Extract bits from filename
				baseName =     deps.path.basename(htmlFile.path),
				nameParts =    baseName.split('.'),
				ext =          deps.lodash.without(nameParts, deps.lodash.first(nameParts)).join('.'),
				viewBaseName = deps.lodash.last(nameParts[0].split('view-')),
				// Make sure Windows paths work down below
				cwdParts =     settings.cwd.replace(/\\/g, '/').split('/'),

				// Make a collection of file globs
				// Production will get 1 file only
				// Development gets raw base files
				injectItems =  settings.isProduction ?
					[
						settings.config.exportAssetsJs + '/core-libs*.min.js',
						settings.config.exportAssetsJs + '/view-' + viewBaseName + '*.min.js'
					]
					:
					[
						settings.config.exportAssetsJs + '/libs/jquery*.js',
						settings.config.exportAssetsJs + '/libs/ender*.js',

						(settings.isProduction ? '!' : '') + settings.config.exportAssetsJs + '/dev/**/*.js',

						settings.config.exportAssetsJs + '/libs/**/*.js',
						settings.config.exportAssetsJs + '/**/*.js',

						'!' + settings.config.exportAssetsJs + '/**/_*.js',
						'!' + settings.config.exportAssetsJs + '/ie/**',
						'!' + settings.config.exportAssetsJs + '/ie*.js'
					]
			;

			// Include the css
			injectItems.push(settings.config.exportAssetsCss + '/main*.css');
			injectItems.push(settings.config.exportAssetsCss + '/view-' + viewBaseName + '*.css');

			// Put items in a stream and order dependencies
			injectItems = deps.fs.src(injectItems)
				.pipe(deps.plumber())
				.pipe(deps.plugins.ignore.include(function (file) {
					var fileBase = deps.path.basename(file.path);

					// Exclude filenames with "view-" not matching the current view
					if (fileBase.indexOf('view-') > -1 && fileBase.indexOf('.js') > -1 && fileBase.indexOf(viewBaseName) < 0) {
						return false;
					}

					// Pass through all the other files
					return true;
				}))
				.pipe(deps.plugins.deporder());

			// On the current template
			deps.fs.src(settings.templatesFolder + '/' + baseName)
				.pipe(deps.plumber())
				// Piping deps.plugins.newer() blocks refreshes on partials and layout parts :(
				//.pipe(deps.plugins.newer(settings.config.exportTemplates + '/' + baseName))
				.pipe(deps.if(settings.config.assembleTemplates, deps.plugins.compileHandlebars({
						templateName: baseName
					}, {
						batch:   [settings.templatesFolder + '/layout', settings.templatesFolder + '/partials'],
						helpers: {
							equal: function (v1, v2, options) {
								v2 = v2.split('|');
								return (deps.lodash.indexOf(v2, v1) > -1) ? options.fn(this) : options.inverse(this);
							}
						}
				})))
				.pipe(deps.plugins.inject(injectItems, {
					ignorePath:   settings.config.exportAssets,
					addRootSlash: false,
					addPrefix:    settings.config.templateAssetPrefix || ''
				}))
				.pipe(deps.if(settings.config.w3c && ext === 'html', deps.plugins.w3cjs({
					doctype: 'HTML5',
					charset: 'utf-8'
				})))
				.pipe(deps.if(settings.config.minifyHTML, deps.plugins.htmlmin(settings.htmlminOptions)))
				.pipe(deps.fs.dest(settings.config.exportTemplates))
				.on('end', function () {
					// Since above changes are made in a tapped stream
					// We have to count to make sure everything is parsed
					count = count + 1;
					if (count == numTemplates) {
						// Reload when serving
						if (settings.lrStarted) {
							deps.browserSync.reload();
						}

						// Report unvalidated files
						if (unvalidatedFiles.length) {
							console.log(deps.chalk.yellow('✘  Couldn\'t validate: ' + unvalidatedFiles.join(', ')));
							console.log(deps.chalk.yellow.inverse('W3C validation only works for HTML files'));
						}

						// Report the end of this task
						cb(null);
					}
				})
			;

			if (settings.config.w3c && ext !== 'html') {
				unvalidatedFiles.push(baseName);
			}
		}))
	;
}));
