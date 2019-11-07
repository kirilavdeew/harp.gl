import { OmvDecoder } from './OmvDecoder';
import * as THREE from 'three';

export interface IOmvTileUtils {
  tile2world(extents: number, decodeInfo: OmvDecoder.DecodeInfo, position: THREE.Vector2, flipY: boolean, target: THREE.Vector2): THREE.Vector2;
  webMercatorTile2TargetWorld(extents: number, decodeInfo: OmvDecoder.DecodeInfo, position: THREE.Vector2, flipY: boolean, target: THREE.Vector2): void;
}
