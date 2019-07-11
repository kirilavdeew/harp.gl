/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    isValueDefinition,
    StandardStyle,
    Style,
    StyleDeclaration,
    Theme
} from "@here/harp-datasource-protocol";
import { isJsonExpr } from "@here/harp-datasource-protocol/lib/Expr";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    MapViewEventNames,
    ThemeLoader
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { GUI } from "dat.gui";
import { ShadowMapViewer } from "three/examples/jsm/utils/ShadowMapViewer";
import { accessToken } from "../config";

export namespace ThreejsShadows {
    function initializeMapView(id: string, theme: Theme): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const map = new MapView({ canvas, theme });
        map.renderLabels = false;

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const NY = new GeoCoordinates(40.707, -74.01);
        map.lookAt(NY, 3000, 45, 0);
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);
        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addOmvDataSource(map);

        map.update();

        return map;
    }

    function addOmvDataSource(map: MapView) {
        const hereCopyrightInfo: CopyrightInfo = {
            id: "here.com",
            year: new Date().getFullYear(),
            label: "HERE",
            link: "https://legal.here.com/terms"
        };
        const copyrights: CopyrightInfo[] = [hereCopyrightInfo];

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            copyrightInfo: copyrights
        });

        const promise = map.addDataSource(omvDataSource);

        const options = {
            top: 5000,
            left: -5000,
            right: 5000,
            bottom: -5000,
            far: 5000,
            near: 0
        };

        map.renderer.shadowMap.enabled = true;
        map.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        let shadowMapViewerCreated = false;
        const updateLightCamera = () => {
            map.scene.children.forEach((obj: THREE.Object3D) => {
                if ((obj as any).isDirectionalLight) {
                    const light = obj as THREE.DirectionalLight;
                    if (shadowMapViewerCreated === false) {
                        shadowMapViewerCreated = true;
                        const lightShadowMapViewer = new ShadowMapViewer(light) as any;
                        lightShadowMapViewer.position.x = 10;
                        lightShadowMapViewer.position.y = 10;
                        lightShadowMapViewer.size.width = 2048 / 4;
                        lightShadowMapViewer.size.height = 1024 / 4;
                        lightShadowMapViewer.update();
                        map.addEventListener(MapViewEventNames.AfterRender, () => {
                            lightShadowMapViewer.render(map.renderer);
                        });
                    }
                    Object.assign(light.shadow.camera, options);
                    light.shadow.camera.updateProjectionMatrix();
                    // console.log(new THREE.Vector3().setFromMatrixPosition(light.matrixWorld));
                    // console.log(new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld));
                }
            });
            map.update();
        };
        promise.then(updateLightCamera);

        const gui = new GUI({ width: 300 });
        gui.add(options, "top", 0, 10000).onChange(updateLightCamera);
        gui.add(options, "left", -10000, 0).onChange(updateLightCamera);
        gui.add(options, "right", 0, 10000).onChange(updateLightCamera);
        gui.add(options, "bottom", -10000, 0).onChange(updateLightCamera);
        gui.add(options, "near", -1000, 100).onChange(updateLightCamera);
        gui.add(options, "far", 0, 10000).onChange(updateLightCamera);

        const updateLightPosition = () => {
            map.scene.children.forEach((obj: THREE.Object3D) => {
                if ((obj as any).isDirectionalLight) {
                    const light = obj as THREE.DirectionalLight;

                    const time = Date.now() / 1000;
                    light.position.set(Math.cos(time), Math.sin(time), 1);
                    map.update();
                }
            });

            setTimeout(updateLightPosition, 10);
        };
        setTimeout(() => {
            updateLightPosition();
        }, 1000);

        return map;
    }

    function patchFillStyle(styleDeclaration: StyleDeclaration) {
        if (!isJsonExpr(styleDeclaration)) {
            const style = styleDeclaration as Style;
            if (style.technique === "fill") {
                (style as any).technique = "standard";
                ((style as any) as StandardStyle).attr!.roughness = 1.0;
                ((style as any) as StandardStyle).attr!.metalness = 0.0;
                // ((style as any) as StandardStyle).attr!.emissive = "#78858C";
                // ((style as any) as StandardStyle).attr!.emissiveIntensity = 0.85;
            }
        }
    }

    /**
     * Replace all occurences of "fill" technique in the theme with "standard" technique.
     * "standard" technique is using three.js MeshStandardMaterial and is needed to receive
     * shadows.
     * @param theme The theme to patch
     */
    function patchTheme(theme: Theme) {
        theme.lights = [
            {
                type: "ambient",
                color: "#ffffff",
                name: "ambientLight",
                intensity: 0.9
            },
            {
                type: "directional",
                color: "#ffcccc",
                name: "light1",
                intensity: 1,
                direction: {
                    x: 0,
                    y: 0.5,
                    z: 1
                },
                castShadow: true
            }
        ];
        if (theme.styles === undefined || theme.styles.tilezen === undefined) {
            throw Error("Theme has no tilezen styles");
        }

        if (theme.definitions !== undefined) {
            for (const definitionName in theme.definitions) {
                if (!theme.definitions.hasOwnProperty(definitionName)) {
                    continue;
                }
                const definition = theme.definitions[definitionName];
                if (!isValueDefinition(definition)) {
                    const styleDeclaration = definition as StyleDeclaration;
                    patchFillStyle(styleDeclaration);
                }
            }
        }
        theme.styles.tilezen.forEach((styleDeclaration: StyleDeclaration) => {
            patchFillStyle(styleDeclaration);
        });
    }

    ThemeLoader.load("resources/berlin_tilezen_base.json").then((theme: Theme) => {
        patchTheme(theme);
        initializeMapView("mapCanvas", theme);
    });
}
