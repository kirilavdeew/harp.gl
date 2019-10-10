/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, CopyrightInfo, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";
import { Mesh, BufferGeometry, Material, MeshStandardMaterial, Color } from "three";

/**
 * MapView initialization sequence enables setting all the necessary elements on a map  and returns
 * a [[MapView]] object. Looking at the function's definition:
 *
 * ```typescript
 * function initializeMapView(id: string): MapView {
 * ```
 *
 * it can be seen that it accepts a string which holds an `id` of a DOM element to initialize the
 * map canvas within.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_0.ts]]
 * ```
 *
 * During the initialization, canvas element with a given `id` is searched for first. Than a
 * [[MapView]] object is created and set to initial values of camera settings and map's geo center.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_1.ts]]
 * ```
 * As a map needs controls to allow any interaction with the user (e.g. panning), a [[MapControls]]
 * object is created.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_map_controls.ts]]
 * ```
 * By default the map is looking at Berlin. For this example we want to look at New York from a
 * nice angle and distance.
 * ```typescript
 * [[include:harp_gl_hello_world_example_look_at.ts]]
 * ```
 *
 * Finally the map is being resized to fill the whole screen and a listener for a "resize" event is
 * added, which enables adjusting the map's size to the browser's window size changes.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_3.ts]]
 * ```
 * At the end of the initialization a [[MapView]] object is returned. To show map tiles an exemplary
 * datasource is used, [[OmvDataSource]]:
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_4.ts]]
 * ```
 *
 * After creating a specific datasource it needs to be added to the map in order to be seen.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_5.ts]]
 * ```
 *
 */
export namespace HelloWorldExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        // snippet:harp_gl_hello_world_example_0.ts
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        // end:harp_gl_hello_world_example_0.ts

        // snippet:harp_gl_hello_world_example_1.ts
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });
        // end:harp_gl_hello_world_example_1.ts

        CopyrightElementHandler.install("copyrightNotice", map);

        // snippet:harp_gl_hello_world_example_map_controls.ts
        // Instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;
        // end:harp_gl_hello_world_example_map_controls.ts

        // snippet:harp_gl_hello_world_example_look_at.ts
        // Look at New York.
        const NY = new GeoCoordinates(40.707, -74.01);
        map.lookAt(NY, 4000, 50, -20);
        // end:harp_gl_hello_world_example_look_at.ts

        // Add an UI.
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        // snippet:harp_gl_hello_world_example_3.ts
        // Resize the mapView to maximum.
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events.
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });
        // end:harp_gl_hello_world_example_3.ts

        addOmvDataSource(map);

        canvas.addEventListener("mouseup", (ev: MouseEvent) => {
            const intersections = map.intersectMapObjects(ev.clientX, ev.clientY);
            // console.log(intersection);
            for (const i of intersections) {
                if (
                    i.intersection === undefined ||
                    i.intersection.faceIndex === undefined ||
                    i.intersection.face === undefined ||
                    i.intersection.face === null
                ) {
                    continue;
                }
                const face = i.intersection.face;
                const faceIndex = i.intersection.faceIndex;
                const obj = i.intersection.object;
                const userData = obj.userData;
                if (userData.dataSource !== "omv-datasource") {
                    continue;
                }
                console.log(i);

                if (
                    userData.dataSource === "omv-datasource" &&
                    userData.kind.includes("building")
                ) {
                    const mesh = obj as Mesh;
                    const bufferGeometry = mesh.geometry as BufferGeometry;
                    bufferGeometry.clearGroups();
                    bufferGeometry.addGroup(0, faceIndex * 3, 0);
                    bufferGeometry.addGroup(faceIndex * 3, 3, 1);
                    bufferGeometry.addGroup(faceIndex * 3 + 3, bufferGeometry.index.count, 0);

                    const material = Array.isArray(mesh.material)
                        ? mesh.material[0]
                        : mesh.material;

                    mesh.material = [material, material.clone()];

                    const materials = mesh.material as Material[];
                    (materials[1] as MeshStandardMaterial).color = new Color("#ff00ff");

                    if (material.colorWrite === true) {
                        break;
                    }
                }
            }
        });

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

        // snippet:harp_gl_hello_world_example_4.ts
        const omvDataSource = new OmvDataSource({
            name: "omv-datasource",
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            copyrightInfo: copyrights,
            gatherFeatureIds: true
        });
        // end:harp_gl_hello_world_example_4.ts

        // snippet:harp_gl_hello_world_example_5.ts
        map.addDataSource(omvDataSource);
        // end:harp_gl_hello_world_example_5.ts

        return map;
    }

    export const mapView = initializeMapView("mapCanvas");
}
