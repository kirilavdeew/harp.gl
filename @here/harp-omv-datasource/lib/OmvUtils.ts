/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { EarthConstants, webMercatorProjection } from "@here/harp-geoutils";
import * as THREE from "three";

import { OmvDecoder } from "./OmvDecoder";
import { VTJsonDataAdapterId } from "./VTJsonDataAdapter";
import { IOmvTileUtils } from './IOmvTileUtils';

/**
 * @hidden
 */
export function isArrayBufferLike(data: any): data is ArrayBufferLike {
    if (typeof SharedArrayBuffer !== "undefined") {
        return data instanceof ArrayBuffer || data instanceof SharedArrayBuffer;
    } else {
        return data instanceof ArrayBuffer;
    }
}

/**
 * @hidden
 */
export function lat2tile(
    lat: number,
    zoom: number,
    func: (x: number) => number = Math.floor
): number {
    return func(
        ((1 -
            Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
                Math.PI) /
            2) *
            Math.pow(2, zoom)
    );
}

export interface WorldTileProjectionCookie {
    extents: number;
    top: number;
    left: number;
    scale: number;
}

export function createWorldTileTransformationCookie(
    extents: number,
    decodeInfo: OmvDecoder.DecodeInfo
) {
    const { north, west } = decodeInfo.geoBox;
    const N = Math.log2(extents);
    const scale = Math.pow(2, decodeInfo.tileKey.level + N);
    return {
        extents,
        scale,
        top: lat2tile(
            north,
            decodeInfo.tileKey.level + N,
            decodeInfo.adapterId === VTJsonDataAdapterId ? Math.round : Math.floor
        ),
        left: ((west + 180) / 360) * scale
    };
}

/**
 * @hidden
 */
export function world2tile(
    extents: number,
    decodeInfo: OmvDecoder.DecodeInfo,
    position: THREE.Vector2,
    flipY: boolean = false,
    target: THREE.Vector2
): THREE.Vector2 {
    if (
        decodeInfo.worldTileProjectionCookie === undefined ||
        decodeInfo.worldTileProjectionCookie.extents !== extents
    ) {
        decodeInfo.worldTileProjectionCookie = createWorldTileTransformationCookie(
            extents,
            decodeInfo
        );
    }
    const { top, left, scale } = decodeInfo.worldTileProjectionCookie;
    const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

    return target.set(
        (position.x / R) * scale - left,
        (flipY ? -1 : 1) * ((position.y / R) * scale - top)
    );
}

const tempWorldPos = new THREE.Vector2();

export class OmvUtils implements IOmvTileUtils {
    tile2world(
      extents: number,
      decodeInfo: OmvDecoder.DecodeInfo,
      position: THREE.Vector2,
      flipY: boolean = false,
      target: THREE.Vector2
    ): THREE.Vector2 {
        if (
          decodeInfo.worldTileProjectionCookie === undefined ||
          decodeInfo.worldTileProjectionCookie.extents !== extents
        ) {
            decodeInfo.worldTileProjectionCookie = createWorldTileTransformationCookie(
              extents,
              decodeInfo
            );
        }

        const { top, left, scale } = decodeInfo.worldTileProjectionCookie;
        const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

        return target.set(
          ((left + position.x) / scale) * R,
          ((top + (flipY ? -position.y : position.y)) / scale) * R
        );
    }

    world2tile(
      extents: number,
      decodeInfo: OmvDecoder.DecodeInfo,
      position: THREE.Vector2,
      flipY: boolean = false,
      target: THREE.Vector2
    ): THREE.Vector2 {
        if (
          decodeInfo.worldTileProjectionCookie === undefined ||
          decodeInfo.worldTileProjectionCookie.extents !== extents
        ) {
            decodeInfo.worldTileProjectionCookie = createWorldTileTransformationCookie(
              extents,
              decodeInfo
            );
        }
        const { top, left, scale } = decodeInfo.worldTileProjectionCookie;
        const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

        return target.set(
          (position.x / R) * scale - left,
          (flipY ? -1 : 1) * ((position.y / R) * scale - top)
        );
    }


    webMercatorTile2TargetWorld(
      extents: number,
      decodeInfo: OmvDecoder.DecodeInfo,
      position: THREE.Vector2,
      target: THREE.Vector3,
      flipY: boolean = false,
    ): void {
        const worldPos = this.tile2world(extents, decodeInfo, position, flipY, tempWorldPos);
        target.set(worldPos.x, worldPos.y, 0);
        decodeInfo.targetProjection
          .reprojectPoint(webMercatorProjection, target, target)
          .sub(decodeInfo.center);
    }

}
