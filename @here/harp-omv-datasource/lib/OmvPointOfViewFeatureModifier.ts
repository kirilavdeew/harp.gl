/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { LoggerManager } from "@here/harp-utils";
import { OmvGenericFeatureModifier } from "./OmvDataFilter";
import { OmvFeatureFilterDescription, OmvFilterDescription } from "./OmvDecoderDefs";

const logger = LoggerManager.instance.create("OmvPoliticalViewFeatureModifier");

/**
 * Modifies the MapEnv of the Vector Tiles in Tilezen format with different POV.
 *
 * This feature modifier updates feature properties according to different political
 * point of view.
 * Political views (or alternate point of views) are supported in Tilezen by adding
 * additional property with ISO 3166-1 alpha-2 compliant country posix to __default__ property name.
 * For example country borders (__boundaries__ layer) may have both __kind__ property for
 * default (major POV) and __kind:xx__ for alternate points of view. This way disputed borders
 * may be visible or not for certain regions and different users (clients).
 */
export class OmvPointOfViewFeatureModifier extends OmvGenericFeatureModifier {
    private readonly m_countriesPov: string[];

    /**
     * C-tor.
     *
     * @param description
     * @param respectedPov The codes (in ISO 3166-1 alpha-2 format) of countries which
     * point of view should be taken firstly into account. The position on the lists
     * relates to priority, so the first entries have precedence before the later.
     */
    constructor(description: OmvFeatureFilterDescription, respectedPov: string[]) {
        super(description);
        this.m_countriesPov = respectedPov;
    }

    /**
     * Overrides line features processing.
     *
     * Currently only line features support different point of view.
     * @param layer
     * @param env
     */
    doProcessLineFeature(layer: string, env: MapEnv): boolean {
        this.rewriteEnvironment(layer, env);
        return super.doProcessLineFeature(layer, env);
    }

    /**
     * Rewrites the Environment to match the different points of view.
     *
     * @param layer
     * @param env
     */
    private rewriteEnvironment(layer: string, env: MapEnv) {
        // For now we need to rewrite "boundaries" layer only.
        if (this.isBoundary(layer)) {
            this.updateEnvironment(env, this.m_countriesPov, "kind");
        }
    }

    private updateEnvironment(env: MapEnv, countryCodes: string[], propName: string): void {
        const value = this.getAlternativePov(env, countryCodes, propName);
        if (value !== undefined) {
            env.entries[propName] = value;
        }
    }

    private getAlternativePov(env: MapEnv, countryCodes: string[], propName: string) {
        console.log("Get alternate POV: ", JSON.stringify(env));
        for (const cc of countryCodes) {
            const value = env.lookup(`${propName}:${cc}`);
            console.log("Lookup POV: ", `${propName}:${cc}`, value);
            if (typeof value === "string" && value.length > 0) {
                console.log("Found POV: ", `${propName}:${cc}`, value);
                return value;
            }
        }
        return undefined;
    }

    private isBoundary(layer: string): boolean {
        return layer === "boundaries";
    }
}
