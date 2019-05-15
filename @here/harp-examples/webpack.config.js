/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const merge = require("webpack-merge");
const path = require("path");
const glob = require("glob");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const prepareOnly = process.env["PREPARE_ONLY"] === "true";

const harpMapThemePath = path.dirname(require.resolve("@here/harp-map-theme/package.json"));
const harpFontResourcesPath = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

function resolveOptional(path, message) {
    try {
        return require.resolve(path);
    } catch (error) {
        if (!message) {
            message = "some examples may not work";
        }
        console.log(`warning: unable to find '${path}': ${message}`);
        return undefined;
    }
}

const commonConfig = {
    context: __dirname,
    devtool: prepareOnly ? undefined : "source-map",
    externals: [
        {
            three: "THREE",
            fs: "undefined"
        },
        function(context, request, callback) {
            return /three\.module\.js$/.test(request) ? callback(null, "THREE") : callback();
        }
    ],
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
        alias: {
            "react-native": "react-native-web"
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: /node_modules/,
                options: {
                    onlyCompileBundledFiles: true,
                    projectReferences: true,
                    configFile: path.join(__dirname, "tsconfig-build.json"),
                    onlyCompileBundledFiles: true,
                    transpileOnly: prepareOnly,
                    compilerOptions: {
                        sourceMap: !prepareOnly
                    }
                }
            }
        ]
    },
    output: {
        path: path.join(process.cwd(), "dist/examples"),
        filename: "[name].bundle.js"
    },
    performance: {
        hints: false
    },
    stats: {
        all: false,
        timings: true,
        exclude: "/resources/",
        errors: true,
        entrypoints: true,
        warnings: true
    },
    mode: process.env.NODE_ENV || "development"
};

const decoderConfig = merge(commonConfig, {
    target: "webworker",
    entry: {
        decoder: "./decoder/decoder.ts"
    }
});

const webpackEntries = glob
    .sync(path.join(__dirname, "./src/*.{ts,tsx}"))
    .reduce((result, entry) => {
        const name = path.basename(entry).replace(/.tsx?$/, "");
        if (name.startsWith("common")) {
            return result;
        }
        result[name] = entry;
        return result;
    }, {});

const htmlEntries = glob.sync(path.join(__dirname, "./src/*.html")).reduce((result, entry) => {
    result[path.basename(entry).replace(/.html$/, "")] = entry;
    return result;
}, {});

function filterExamples(pattern) {
    function filterEntries(entries) {
        Object.keys(entries).forEach(entryName => {
            if (entryName.indexOf(pattern) == -1) {
                delete entries[entryName];
            }
        });
    }
    filterEntries(webpackEntries);
    filterEntries(htmlEntries);
}

// Uncomment and adapt to filter built examples and speed up the build significantly
//
//filterExamples("hello");

const browserConfig = merge(commonConfig, {
    entry: webpackEntries,
    output: {
        filename: "[name]_bundle.js"
    },
    optimization: {
        splitChunks: {
            chunks: "all",
            minSize: 1000,
            name: "common"
        }
    }
});

const exampleBrowserConfig = merge(commonConfig, {
    entry: {
        "example-browser": "./example-browser.ts"
    }
});

const codeBrowserConfig = merge(commonConfig, {
    entry: {
        codebrowser: "./codebrowser.ts"
    }
});

browserConfig.plugins = Object.keys(browserConfig.entry).map(
    chunk =>
        new HtmlWebpackPlugin({
            template: "template/example.html",
            chunks: ["common", chunk],
            filename: `${chunk}.html`
        })
);

const allEntries = Object.assign({}, webpackEntries, htmlEntries);

/**
 * Geterate example definitions for 'index.html' in following form:
 *
 * {
 *     [examplePage: string]: string // maps example page to example source
 * }
 */
const exampleDefs = Object.keys(allEntries).reduce(function(r, entry) {
    r[entry + ".html"] = path.relative(__dirname, allEntries[entry]);
    return r;
}, {});

const assets = [
    {
        from: __dirname + "/example-definitions.js.in",
        to: "example-definitions.js",
        transform: content => {
            return content.toString().replace("{{EXAMPLES}}", JSON.stringify(exampleDefs, true, 4));
        }
    },
    ...[path.join(__dirname, "src")].map(srcDir => ({
        from: path.join(srcDir, "*.{ts,tsx,html}"),
        to: "src/[name].[ext]"
    })),
    path.join(__dirname, "index.html"),
    {
        from: path.join(__dirname, "src/*.html"),
        to: "[name].[ext]"
    },
    path.join(__dirname, "codebrowser.html"),
    { from: path.join(__dirname, "resources"), to: "resources", toType: "dir" },
    { from: path.join(harpMapThemePath, "resources"), to: "resources", toType: "dir" },
    {
        from: path.join(harpFontResourcesPath, "resources"),
        to: "resources/fonts",
        toType: "dir"
    },
    require.resolve("three/build/three.min.js"),
    resolveOptional("@here/harp.gl/dist/harp.js", "bundle examples require `yarn build-bundle`"),
    resolveOptional("@here/harp.gl/dist/harp-decoders.js")
].filter(asset => asset); // ignore stuff that is not found

browserConfig.plugins.push(
    new CopyWebpackPlugin(assets, { ignore: ["*.npmignore", "*.gitignore"] })
);

module.exports = [decoderConfig, browserConfig, codeBrowserConfig, exampleBrowserConfig];
