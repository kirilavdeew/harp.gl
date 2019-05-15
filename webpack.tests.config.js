const webpack = require("webpack");
const glob = require("glob");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HardSourceWebpackPlugin = require("hard-source-webpack-plugin");

const testResourceDirs = glob.sync(path.join(__dirname, "@here/*/test/resources"));
const testResources = testResourceDirs.map(dir => {
    return {
        from: dir,
        to: path.relative(__dirname, dir)
    };
});

const harpMapThemePath = path.dirname(require.resolve("@here/harp-map-theme/package.json"));
const harpDataSourceProtocolPath = path.dirname(
    require.resolve("@here/harp-datasource-protocol/package.json")
);
const harpFontResourcesPath = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

const browserTestsConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".web.js", ".js"],
        modules: [".", "node_modules"]
    },
    entry: {
        test: glob.sync("@here/*/test/**/*.js").filter(path => !path.includes("generator-harp.gl")),
        "performance-test": glob.sync("test/performance/**/*.js")
    },
    output: {
        path: path.join(__dirname, "dist/test"),
        filename: "[name].bundle.js"
    },
    plugins: [
        new HardSourceWebpackPlugin(),
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: process.env.NODE_ENV || "development"
        }),
        new CopyWebpackPlugin([
            path.join(__dirname, "test/index.html"),
            path.join(__dirname, "test/performance.html"),
            require.resolve("three/build/three.min.js"),
            require.resolve("mocha/mocha.js"),
            require.resolve("mocha/mocha.css"),
            require.resolve("mocha-webdriver-runner/dist/mocha-webdriver-client.js"),
            ...testResources,
            path.join(harpMapThemePath, "resources/berlin*.json"),
            {
                from: path.join(harpDataSourceProtocolPath, "theme.schema.json"),
                to: "./@here/harp-datasource-protocol",
                toType: "dir"
            },
            {
                from: path.join(harpFontResourcesPath, "resources"),
                to: "@here/harp-fontcatalog/resources"
            }
        ])
    ],
    externals: [
        {
            fs: "undefined",
            perf_hooks: "undefined",
            three: "THREE",
            typestring: "undefined"
        },
        function(context, request, callback) {
            return /three\.module\.js$/.test(request) ? callback(null, "THREE") : callback();
        }
    ],
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
    watchOptions: {
        aggregateTimeout: 300,
        poll: 1000
    },
    mode: process.env.NODE_ENV || "development"
};

module.exports = browserTestsConfig;
