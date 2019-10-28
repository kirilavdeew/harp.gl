/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { Theme } from "@here/harp-datasource-protocol";
import { mercatorProjection, Projection, TileKey, Vector3Like } from "@here/harp-geoutils";
import {
    FontCatalog,
    GlyphData,
    MeasurementParameters,
    TextBufferObject,
    TextCanvas,
    TextLayoutParameters,
    TextRenderParameters,
    TextRenderStyle
} from "@here/harp-text-canvas";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { PoiManager } from "..";
import { PoiRenderer } from "../lib/poi/PoiRenderer";
import { PoiRendererFactory } from "../lib/poi/PoiRendererFactory";
import { ScreenCollisions } from "../lib/ScreenCollisions";
import { ScreenProjector } from "../lib/ScreenProjector";
import { DEFAULT_FONT_CATALOG_NAME, FontCatalogLoader } from "../lib/text/FontCatalogLoader";
import { DEFAULT_FADE_TIME } from "../lib/text/RenderState";
import { TextCanvasFactory } from "../lib/text/TextCanvasFactory";
import { TextElement } from "../lib/text/TextElement";
import { TextElementsRenderer } from "../lib/text/TextElementsRenderer";
import { TextElementsRendererOptions } from "../lib/text/TextElementsRendererOptions";
import { ViewState } from "../lib/text/ViewState";
import { DataSourceTileList } from "../lib/VisibleTileSet";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

function createViewState(worldCenter: THREE.Vector3): ViewState {
    return {
        worldCenter,
        cameraIsMoving: false,
        maxVisibilityDist: 10000,
        zoomLevel: 0,
        frameNumber: 0,
        lookAtDistance: 0,
        isDynamic: false,
        hiddenGeometryKinds: undefined
    };
}

class TextElementBuilder {
    static readonly DEFAULT_TEXT: string = "Text";
    static readonly DEFAULT_RENDER_PARAMS: TextRenderParameters = {};
    static readonly DEFAULT_LAYOUT_PARAMS: TextLayoutParameters = {};
    static readonly DEFAULT_PRIORITY: number = 0;
    static readonly DEFAULT_TILE_CENTER = new THREE.Vector3(0, 0, 1);
    static readonly DEFAULT_POSITION = new THREE.Vector3(0, 0, 0);
    static readonly DEFAULT_PATH = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.1, 0)];
    static readonly DEFAULT_IGNORE_DISTANCE: boolean = true;

    static buildDefaultPoiLabel(sandbox: sinon.SinonSandbox): TextElement {
        return this.build(
            sandbox,
            this.DEFAULT_TEXT,
            this.DEFAULT_POSITION,
            this.DEFAULT_PRIORITY,
            this.DEFAULT_IGNORE_DISTANCE
        );
    }

    static buildDefaultPathLabel(sandbox: sinon.SinonSandbox): TextElement {
        return this.build(
            sandbox,
            this.DEFAULT_TEXT,
            this.DEFAULT_PATH,
            this.DEFAULT_PRIORITY,
            this.DEFAULT_IGNORE_DISTANCE
        );
    }

    private static build(
        sandbox: sinon.SinonSandbox,
        text: string = TextElementBuilder.DEFAULT_TEXT,
        points: THREE.Vector3[] | THREE.Vector3 = TextElementBuilder.DEFAULT_POSITION,
        priority: number = TextElementBuilder.DEFAULT_PRIORITY,
        ignoreDistance: boolean
    ): TextElement {
        const textElement = new TextElement(
            text,
            points,
            this.DEFAULT_RENDER_PARAMS,
            this.DEFAULT_LAYOUT_PARAMS,
            priority
        );
        textElement.tileCenter = this.DEFAULT_TILE_CENTER;
        textElement.ignoreDistance = ignoreDistance;

        // Stub render style setter, so that a spy is installed on the style opacity
        // whenever it's called.
        const renderStyleProperty = Object.getOwnPropertyDescriptor(
            TextElement.prototype,
            "renderStyle"
        )!;

        sandbox.stub(textElement, "renderStyle").set((style: TextRenderStyle) => {
            sandbox.spy(style, "opacity", ["set"]);
            return renderStyleProperty.set!.call(textElement, style);
        });
        sandbox.stub(textElement, "renderStyle").get(renderStyleProperty.get!);
        return textElement;
    }

    private m_text: string = TextElementBuilder.DEFAULT_TEXT;
    private m_priority: number = TextElementBuilder.DEFAULT_PRIORITY;
    private m_points: THREE.Vector3 | THREE.Vector3[] = TextElementBuilder.DEFAULT_POSITION;
    private m_ignoreDistance: boolean = TextElementBuilder.DEFAULT_IGNORE_DISTANCE;

    constructor(private readonly m_sandbox: sinon.SinonSandbox) {}

    withText(text: string): TextElementBuilder {
        this.m_text = text;
        return this;
    }

    withPriority(priority: number): TextElementBuilder {
        this.m_priority = priority;
        return this;
    }

    withPosition(position: THREE.Vector3): TextElementBuilder {
        this.m_points = position;
        return this;
    }

    withPath(path: THREE.Vector3[]): TextElementBuilder {
        this.m_points = path;
        return this;
    }

    withIgnoreDistance(ignoreDistance: boolean): TextElementBuilder {
        this.m_ignoreDistance = ignoreDistance;
        return this;
    }

    build(): TextElement {
        return TextElementBuilder.build(
            this.m_sandbox,
            this.m_text,
            this.m_points,
            this.m_priority,
            this.m_ignoreDistance
        );
    }
}

type OpacityMatcher = (opacity: number) => boolean;

class TestFixture {
    static readonly SCREEN_WIDTH = 1920;
    static readonly SCREEN_HEIGHT = 1080;
    static readonly DEF_TEXT_WIDTH_HEIGHT = 10;
    static readonly DEF_TEXTURE_SIZE = 1;

    readonly screenCollisions: ScreenCollisions;
    projection: Projection = mercatorProjection;

    viewState: ViewState;
    options: TextElementsRendererOptions = {};
    readonly tileLists: DataSourceTileList[] = [];

    private m_canvasAddTextStub: sinon.SinonStub;
    private m_canvasAddBufferObjStub: sinon.SinonStub;
    private m_dataSource: FakeOmvDataSource = new FakeOmvDataSource();
    private m_screenProjector: ScreenProjector | undefined;
    private readonly m_camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera();
    private readonly m_theme: Theme = {};
    private m_textRenderer: TextElementsRenderer | undefined;

    constructor(readonly sandbox: sinon.SinonSandbox) {
        this.viewState = createViewState(new THREE.Vector3());
        this.screenCollisions = new ScreenCollisions();
        this.screenCollisions.update(TestFixture.SCREEN_WIDTH, TestFixture.SCREEN_HEIGHT);
    }

    setUp(): Promise<boolean> {
        this.m_screenProjector = this.stubScreenProjector();
        this.projection = mercatorProjection;
        const defaultTile = this.m_dataSource.getTile(new TileKey(0, 0, 0));
        this.tileLists.push({
            dataSource: this.m_dataSource,
            zoomLevel: 0,
            storageLevel: 0,
            allVisibleTileLoaded: false,
            numTilesLoading: 0,
            visibleTiles: [defaultTile],
            renderedTiles: new Map([[1, defaultTile]])
        });

        const cameraPosition = new THREE.Vector3(0, 0, 0); // center.

        this.viewState = createViewState(cameraPosition);
        this.options = {
            labelDistanceScaleMin: 1, // Disable scaling by default.
            labelDistanceScaleMax: 1
        };

        const fontCatalog = this.stubFontCatalog();
        const fontCatalogLoader = this.stubFontCatalogLoader(fontCatalog);
        const textCanvasFactory = this.stubTextCanvasFactory(fontCatalog);
        const poiManager = this.stubPoiManager();
        const poiRendererFactory = this.stubPoiRendererFactory();
        const dummyUpdateCall = () => {};

        this.m_textRenderer = new TextElementsRenderer(
            this.viewState,
            this.m_camera,
            dummyUpdateCall,
            this.screenCollisions,
            this.m_screenProjector,
            textCanvasFactory,
            poiManager,
            poiRendererFactory,
            fontCatalogLoader,
            this.m_theme,
            this.options
        );

        // Force renderer initialization by calling render with changed text elements.
        this.tileLists[0].visibleTiles[0].textElementsChanged = true;
        const time = 0;
        const tilesChanged = false;
        this.m_textRenderer.placeText(this.tileLists, this.projection, time, tilesChanged);
        return this.m_textRenderer.waitInitialized();
    }

    get textRenderer(): TextElementsRenderer {
        assert(this.m_textRenderer !== undefined);
        return this.m_textRenderer!;
    }

    checkPointLabelRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        const addBufferObjSpy = this.m_canvasAddBufferObjStub.withArgs(
            sinon.match.same(textElement.textBufferObject),
            sinon.match.any
        );

        assert(addBufferObjSpy.calledOnce, this.getErrorHeading(textElement) + "was NOT rendered.");

        const actualOpacity = addBufferObjSpy.firstCall.args[1].opacity;
        this.checkOpacity(actualOpacity, textElement, opacityMatcher);
        return actualOpacity;
    }

    checkPointLabelNotRendered(textElement: TextElement) {
        expect(
            this.m_canvasAddBufferObjStub.neverCalledWith(
                sinon.match.same(textElement.textBufferObject),
                sinon.match.any
            ),
            this.getErrorHeading(textElement) + "was rendered."
        );
    }

    checkPathLabelRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        const addTextSpy = this.m_canvasAddTextStub.withArgs(
            sinon.match.same(textElement.glyphs),
            sinon.match.any,
            sinon.match.any
        );

        const opacitySpy = Object.getOwnPropertyDescriptor(textElement.renderStyle, "opacity")!
            .set! as sinon.SinonSpy;

        assert(opacitySpy.called, this.getErrorHeading(textElement) + "opacity not set");
        assert(addTextSpy.calledOnce, this.getErrorHeading(textElement) + "was NOT rendered.");

        const firstOpacityCallSpy = opacitySpy.firstCall;

        assert(
            firstOpacityCallSpy.calledBefore(addTextSpy.firstCall),
            this.getErrorHeading(textElement) + ", opacity not set before addText"
        );

        const actualOpacity = firstOpacityCallSpy.args[0];

        this.checkOpacity(actualOpacity, textElement, opacityMatcher);
        return actualOpacity;
    }

    checkPathLabelNotRendered(textElement: TextElement) {
        expect(
            this.m_canvasAddTextStub.neverCalledWith(
                sinon.match.same(textElement.glyphs),
                sinon.match.any,
                sinon.match.any
            ),
            this.getErrorHeading(textElement) + "was rendered."
        );
    }

    setTextElement(element: TextElement) {
        this.tileLists[0].visibleTiles[0].addTextElement(element);
    }

    setTextElements(elements: TextElement[]) {
        for (const element of elements) {
            this.tileLists[0].visibleTiles[0].addTextElement(element);
        }
    }

    async renderFrame(time: number) {
        this.sandbox.resetHistory();
        if (this.textRenderer.loading) {
            await this.textRenderer.waitLoaded();
        }
        const tilesChanged = false;
        this.viewState.frameNumber++;
        this.textRenderer.placeText(this.tileLists, this.projection, time, tilesChanged);
    }

    private checkOpacity(
        actualOpacity: number,
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ) {
        expect(
            actualOpacity,
            this.getErrorHeading(textElement) + "has wrong opacity " + actualOpacity
        )
            .gte(0)
            .and.lte(1);

        if (opacityMatcher !== undefined) {
            assert(
                opacityMatcher(actualOpacity),
                this.getErrorHeading(textElement) + "has wrong opacity " + actualOpacity
            );
        }
    }

    private getErrorHeading(textElement: TextElement): string {
        return "Frame " + this.viewState.frameNumber + ", label '" + textElement.text + "': ";
    }

    // Creates a fake projector that takes as input NDC coordinates (from -1 to 1) and outputs
    // screen coordinates.
    private stubScreenProjector(): ScreenProjector {
        const screenProjector = new ScreenProjector(this.m_camera);
        screenProjector.update(this.m_camera, TestFixture.SCREEN_WIDTH, TestFixture.SCREEN_HEIGHT);

        this.sandbox
            .stub(screenProjector, "project")
            .callsFake(function(source: Vector3Like, target: THREE.Vector2 = new THREE.Vector2()) {
                return new THREE.Vector2(
                    (source.x * TestFixture.SCREEN_WIDTH) / 2,
                    (source.y * TestFixture.SCREEN_HEIGHT) / 2
                );
            });

        this.sandbox
            .stub(screenProjector, "project3")
            .callsFake(function(source: Vector3Like, target: THREE.Vector3 = new THREE.Vector3()) {
                return new THREE.Vector3(
                    (source.x * TestFixture.SCREEN_WIDTH) / 2,
                    (source.y * TestFixture.SCREEN_HEIGHT) / 2,
                    source.z
                );
            });
        return screenProjector;
    }

    private stubFontCatalog(): FontCatalog {
        const fontCatalogStub = sinon.createStubInstance(FontCatalog);
        this.sandbox.stub(fontCatalogStub, "isLoading").get(() => {
            return false;
        });
        const defaultTextureSize = new THREE.Vector2(
            TestFixture.DEF_TEXTURE_SIZE,
            TestFixture.DEF_TEXTURE_SIZE
        );
        this.sandbox.stub(fontCatalogStub, "textureSize").get(() => {
            return defaultTextureSize;
        });
        const defaultTexture = new THREE.Texture();
        this.sandbox.stub(fontCatalogStub, "texture").get(() => {
            return defaultTexture;
        });
        fontCatalogStub.loadCharset.resolves([]);
        fontCatalogStub.getGlyphs.callsFake(() => {
            return [(sinon.createStubInstance(GlyphData) as unknown) as GlyphData];
        });

        return (fontCatalogStub as unknown) as FontCatalog;
    }
    private stubFontCatalogLoader(fontCatalog: FontCatalog): FontCatalogLoader {
        const fontCatalogLoaderStub = sinon.createStubInstance(FontCatalogLoader);

        this.sandbox.stub(fontCatalogLoaderStub, "loading").get(() => {
            return false;
        });
        fontCatalogLoaderStub.loadCatalogs
            .yields([DEFAULT_FONT_CATALOG_NAME, fontCatalog])
            .resolves([]);

        return (fontCatalogLoaderStub as unknown) as FontCatalogLoader;
    }

    private stubTextCanvasFactory(fontCatalog: FontCatalog): TextCanvasFactory {
        const renderer = ({} as unknown) as THREE.WebGLRenderer;
        const textCanvas = new TextCanvas({
            renderer,
            fontCatalog,
            minGlyphCount: 1,
            maxGlyphCount: 1
        });

        this.m_canvasAddTextStub = this.sandbox.stub(textCanvas, "addText").returns(true);
        this.sandbox
            .stub(textCanvas, "measureText")
            .callsFake(
                (
                    _text: string | GlyphData[],
                    outputBounds: THREE.Box2,
                    _params?: MeasurementParameters
                ) => {
                    // Return a box centered on origin with dimensions DEF_TEXT_WIDTH_HEIGHT
                    outputBounds.set(
                        new THREE.Vector2(
                            -TestFixture.DEF_TEXT_WIDTH_HEIGHT / 2,
                            -TestFixture.DEF_TEXT_WIDTH_HEIGHT / 2
                        ),
                        new THREE.Vector2(
                            TestFixture.DEF_TEXT_WIDTH_HEIGHT / 2,
                            TestFixture.DEF_TEXT_WIDTH_HEIGHT / 2
                        )
                    );
                    return true;
                }
            );
        this.sandbox.stub(textCanvas, "createTextBufferObject").callsFake(() => {
            return new TextBufferObject([], new Float32Array());
        });
        this.m_canvasAddBufferObjStub = this.sandbox
            .stub(textCanvas, "addTextBufferObject")
            .returns(true);
        this.sandbox.stub(textCanvas, "render"); // do nothing.

        const textCanvasFactoryStub = this.sandbox.createStubInstance(TextCanvasFactory);
        textCanvasFactoryStub.createTextCanvas.returns((textCanvas as unknown) as TextCanvas);

        return (textCanvasFactoryStub as unknown) as TextCanvasFactory;
    }

    private stubPoiManager(): PoiManager {
        const stub = this.sandbox.createStubInstance(PoiManager);
        stub.updatePoiFromPoiTable.returns(true);

        return (stub as unknown) as PoiManager;
    }

    private stubPoiRendererFactory(): PoiRendererFactory {
        const poiRendererStub = this.sandbox.createStubInstance(PoiRenderer);
        poiRendererStub.prepareRender.returns(true);
        poiRendererStub.computeIconScreenBox.returns(true);
        poiRendererStub.poiIsRenderable.returns(true);

        const factoryStub = this.sandbox.createStubInstance(PoiRendererFactory);
        factoryStub.createPoiRenderer.returns((poiRendererStub as unknown) as PoiRenderer);

        return (factoryStub as unknown) as PoiRendererFactory;
    }
}

describe("TextElementsRenderer", function() {
    const inNodeContext = typeof window === "undefined";

    let fixture: TestFixture;
    const sandbox = sinon.createSandbox();

    beforeEach(async function() {
        if (inNodeContext) {
            (global as any).window = { location: { href: "http://harp.gl" } };
        }

        fixture = new TestFixture(sandbox);
        const setupDone = await fixture.setUp();
        assert(setupDone, "Setup failed.");
    });

    afterEach(function() {
        sandbox.restore();
        if (inNodeContext) {
            delete (global as any).window;
        }
    });

    it("Fade in single path label", async function() {
        const textElement = TextElementBuilder.buildDefaultPathLabel(sandbox);
        fixture.setTextElement(textElement);

        // time must not be 0 b/c 0 is used as a special value in TextElementsRenderer.
        const initialTime = 1;
        // Extra frame to load glyphs.
        await fixture.renderFrame(initialTime);

        // First frame, opacity 0.
        await fixture.renderFrame(initialTime);

        await fixture.renderFrame(initialTime + DEFAULT_FADE_TIME / 3);

        const firstOpacity = fixture.checkPathLabelRendered(textElement, (opacity: number) => {
            return opacity > 0;
        });

        await fixture.renderFrame(initialTime + DEFAULT_FADE_TIME / 2);
        fixture.checkPathLabelRendered(textElement, (opacity: number) => {
            return opacity > firstOpacity;
        });

        await fixture.renderFrame(initialTime + DEFAULT_FADE_TIME);
        fixture.checkPathLabelRendered(textElement, (opacity: number) => {
            return opacity === 1;
        });
    });

    it("Fade in single label", async function() {
        const textElement = TextElementBuilder.buildDefaultPoiLabel(sandbox);
        fixture.setTextElement(textElement);

        // time must not be 0 b/c 0 is used as a special value in TextElementsRenderer.
        const initialTime = 1;
        // Extra frame to load glyphs.
        await fixture.renderFrame(initialTime);

        // First frame, opacity 0.
        await fixture.renderFrame(initialTime);

        await fixture.renderFrame(initialTime + DEFAULT_FADE_TIME / 3);

        const firstOpacity = fixture.checkPointLabelRendered(textElement, (opacity: number) => {
            return opacity > 0;
        });

        await fixture.renderFrame(initialTime + DEFAULT_FADE_TIME / 2);
        fixture.checkPointLabelRendered(textElement, (opacity: number) => {
            return opacity > firstOpacity;
        });

        await fixture.renderFrame(initialTime + DEFAULT_FADE_TIME);
        fixture.checkPointLabelRendered(textElement, (opacity: number) => {
            return opacity === 1;
        });
    });

    /**
     * MISSING TESTS
     *
     * - Collision on non-optional POI text makes both text and icon disappear.
     * - Test scaling with camera distance.
     * - Sorting by view distance across tiles.
     */
});
