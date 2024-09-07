import type * as THREE from "three";

declare global {
  const THREE: typeof THREE;
  const zzfxG: any; // Generate
  const zzfxB: any; // AudioBufferSourceNode
  const zzfxP: any; // Play
  const zzfxX: any; // AudioContext
}
