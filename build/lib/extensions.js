"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var es = require("event-stream");
var fs = require("fs");
var glob = require("glob");
var gulp = require("gulp");
var path = require("path");
var File = require("vinyl");
var vsce = require("vsce");
var stats_1 = require("./stats");
var util2 = require("./util");
var remote = require("gulp-remote-src");
var vzip = require('gulp-vinyl-zip');
var filter = require("gulp-filter");
var rename = require("gulp-rename");
var util = require('gulp-util');
var buffer = require('gulp-buffer');
var json = require("gulp-json-editor");
var webpack = require('webpack');
var webpackGulp = require('webpack-stream');
var root = path.resolve(path.join(__dirname, '..', '..'));
function fromLocal(extensionPath, sourceMappingURLBase) {
    var webpackFilename = path.join(extensionPath, 'extension.webpack.config.js');
    if (fs.existsSync(webpackFilename)) {
        return fromLocalWebpack(extensionPath, sourceMappingURLBase);
    }
    else {
        return fromLocalNormal(extensionPath);
    }
}
function fromLocalWebpack(extensionPath, sourceMappingURLBase) {
    var result = es.through();
    var packagedDependencies = [];
    var packageJsonConfig = require(path.join(extensionPath, 'package.json'));
    var webpackRootConfig = require(path.join(extensionPath, 'extension.webpack.config.js'));
    for (var key in webpackRootConfig.externals) {
        if (key in packageJsonConfig.dependencies) {
            packagedDependencies.push(key);
        }
    }
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Yarn, packagedDependencies: packagedDependencies }).then(function (fileNames) {
        var files = fileNames
            .map(function (fileName) { return path.join(extensionPath, fileName); })
            .map(function (filePath) { return new File({
            path: filePath,
            stat: fs.statSync(filePath),
            base: extensionPath,
            contents: fs.createReadStream(filePath)
        }); });
        var filesStream = es.readArray(files);
        // check for a webpack configuration files, then invoke webpack
        // and merge its output with the files stream. also rewrite the package.json
        // file to a new entry point
        var webpackConfigLocations = glob.sync(path.join(extensionPath, '/**/extension.webpack.config.js'), { ignore: ['**/node_modules'] });
        var packageJsonFilter = filter(function (f) {
            if (path.basename(f.path) === 'package.json') {
                // only modify package.json's next to the webpack file.
                // to be safe, use existsSync instead of path comparison.
                return fs.existsSync(path.join(path.dirname(f.path), 'extension.webpack.config.js'));
            }
            return false;
        }, { restore: true });
        var patchFilesStream = filesStream
            .pipe(packageJsonFilter)
            .pipe(buffer())
            .pipe(json(function (data) {
            // hardcoded entry point directory!
            data.main = data.main.replace('/out/', /dist/);
            return data;
        }))
            .pipe(packageJsonFilter.restore);
        var webpackStreams = webpackConfigLocations.map(function (webpackConfigPath) {
            var webpackDone = function (err, stats) {
                util.log("Bundled extension: " + util.colors.yellow(path.join(path.basename(extensionPath), path.relative(extensionPath, webpackConfigPath))) + "...");
                if (err) {
                    result.emit('error', err);
                }
                var compilation = stats.compilation;
                if (compilation.errors.length > 0) {
                    result.emit('error', compilation.errors.join('\n'));
                }
                if (compilation.warnings.length > 0) {
                    result.emit('error', compilation.warnings.join('\n'));
                }
            };
            var webpackConfig = __assign({}, require(webpackConfigPath), { mode: 'production' });
            var relativeOutputPath = path.relative(extensionPath, webpackConfig.output.path);
            return webpackGulp(webpackConfig, webpack, webpackDone)
                .pipe(es.through(function (data) {
                data.stat = data.stat || {};
                data.base = extensionPath;
                this.emit('data', data);
            }))
                .pipe(es.through(function (data) {
                // source map handling:
                // * rewrite sourceMappingURL
                // * save to disk so that upload-task picks this up
                if (sourceMappingURLBase) {
                    var contents = data.contents.toString('utf8');
                    data.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, function (_m, g1) {
                        return "\n//# sourceMappingURL=" + sourceMappingURLBase + "/extensions/" + path.basename(extensionPath) + "/" + relativeOutputPath + "/" + g1;
                    }), 'utf8');
                    if (/\.js\.map$/.test(data.path)) {
                        if (!fs.existsSync(path.dirname(data.path))) {
                            fs.mkdirSync(path.dirname(data.path));
                        }
                        fs.writeFileSync(data.path, data.contents);
                    }
                }
                this.emit('data', data);
            }));
        });
        es.merge.apply(es, webpackStreams.concat([patchFilesStream])).pipe(result);
    }).catch(function (err) {
        console.error(extensionPath);
        console.error(packagedDependencies);
        result.emit('error', err);
    });
    return result.pipe(stats_1.createStatsStream(path.basename(extensionPath)));
}
function fromLocalNormal(extensionPath) {
    var result = es.through();
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Yarn })
        .then(function (fileNames) {
        var files = fileNames
            .map(function (fileName) { return path.join(extensionPath, fileName); })
            .map(function (filePath) { return new File({
            path: filePath,
            stat: fs.statSync(filePath),
            base: extensionPath,
            contents: fs.createReadStream(filePath)
        }); });
        es.readArray(files).pipe(result);
    })
        .catch(function (err) { return result.emit('error', err); });
    return result.pipe(stats_1.createStatsStream(path.basename(extensionPath)));
}
var baseHeaders = {
    'X-Market-Client-Id': 'VSCode Build',
    'User-Agent': 'VSCode Build',
    'X-Market-User-Id': '291C1CD0-051A-4123-9B4B-30D60EF52EE2',
};
function fromMarketplace(extensionName, version, metadata) {
    var _a = extensionName.split('.'), publisher = _a[0], name = _a[1];
    var url = "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/" + publisher + "/vsextensions/" + name + "/" + version + "/vspackage";
    util.log('Downloading extension:', util.colors.yellow(extensionName + "@" + version), '...');
    var options = {
        base: url,
        requestOptions: {
            gzip: true,
            headers: baseHeaders
        }
    };
    var packageJsonFilter = filter('package.json', { restore: true });
    return remote('', options)
        .pipe(vzip.src())
        .pipe(filter('extension/**'))
        .pipe(rename(function (p) { return p.dirname = p.dirname.replace(/^extension\/?/, ''); }))
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
exports.fromMarketplace = fromMarketplace;
var excludedExtensions = [
    'vscode-api-tests',
    'vscode-colorize-tests',
    'ms-vscode.node-debug',
    'ms-vscode.node-debug2',
];
var builtInExtensions = require('../builtInExtensions.json');
/**
 * We're doing way too much stuff at once, with webpack et al. So much stuff
 * that while downloading extensions from the marketplace, node js doesn't get enough
 * stack frames to complete the download in under 2 minutes, at which point the
 * marketplace server cuts off the http request. So, we sequentialize the extensino tasks.
 */
function sequence(streamProviders) {
    var result = es.through();
    function pop() {
        if (streamProviders.length === 0) {
            result.emit('end');
        }
        else {
            var fn = streamProviders.shift();
            fn()
                .on('end', function () { setTimeout(pop, 0); })
                .pipe(result, { end: false });
        }
    }
    pop();
    return result;
}
function packageExtensionsStream(optsIn) {
    var opts = optsIn || {};
    var localExtensionDescriptions = glob.sync('extensions/*/package.json')
        .map(function (manifestPath) {
        var extensionPath = path.dirname(path.join(root, manifestPath));
        var extensionName = path.basename(extensionPath);
        return { name: extensionName, path: extensionPath };
    })
        .filter(function (_a) {
        var name = _a.name;
        return excludedExtensions.indexOf(name) === -1;
    })
        .filter(function (_a) {
        var name = _a.name;
        return opts.desiredExtensions ? opts.desiredExtensions.indexOf(name) >= 0 : true;
    })
        .filter(function (_a) {
        var name = _a.name;
        return builtInExtensions.every(function (b) { return b.name !== name; });
    });
    var localExtensions = function () { return es.merge.apply(es, localExtensionDescriptions.map(function (extension) {
        return fromLocal(extension.path, opts.sourceMappingURLBase)
            .pipe(rename(function (p) { return p.dirname = "extensions/" + extension.name + "/" + p.dirname; }));
    })); };
    var localExtensionDependencies = function () { return gulp.src('extensions/node_modules/**', { base: '.' }); };
    var marketplaceExtensions = function () { return es.merge.apply(es, builtInExtensions
        .filter(function (_a) {
        var name = _a.name;
        return opts.desiredExtensions ? opts.desiredExtensions.indexOf(name) >= 0 : true;
    })
        .map(function (extension) {
        return fromMarketplace(extension.name, extension.version, extension.metadata)
            .pipe(rename(function (p) { return p.dirname = "extensions/" + extension.name + "/" + p.dirname; }));
    })); };
    return sequence([localExtensions, localExtensionDependencies, marketplaceExtensions])
        .pipe(util2.setExecutableBit(['**/*.sh']))
        .pipe(filter(['**', '!**/*.js.map']));
}
exports.packageExtensionsStream = packageExtensionsStream;
