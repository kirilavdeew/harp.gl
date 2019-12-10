import { OmvDecoder } from './OmvDecoder';
import * as THREE from 'three';

export interface IOmvTileUtils {
  world2tile(extents: number, decodeInfo: OmvDecoder.DecodeInfo, position: THREE.Vector2, flipY: boolean, target: THREE.Vector2): THREE.Vector2
  tile2world(extents: number, decodeInfo: OmvDecoder.DecodeInfo, position: THREE.Vector2, flipY: boolean, target: THREE.Vector2): THREE.Vector2;
  webMercatorTile2TargetWorld(extents: number, decodeInfo: OmvDecoder.DecodeInfo, position: THREE.Vector2, target: THREE.Vector3, flipY?: boolean): void;
}
