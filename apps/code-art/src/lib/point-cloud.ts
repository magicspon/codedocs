/** Point buffers ready for a `bufferGeometry`. */
export interface PointCloud {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly sizes: Float32Array
  /** Per point: the frame it appears in. */
  readonly births: Float32Array
  /** Per point: the frame it is gone by. */
  readonly deaths: Float32Array
  /** Per point: the merged file it belongs to, which the health lens looks up. */
  readonly files: Float32Array
}

/** Zeroed buffers for `n` points. */
export function cloud(n: number): PointCloud {
  return {
    positions: new Float32Array(n * 3),
    colors: new Float32Array(n * 3),
    sizes: new Float32Array(n),
    births: new Float32Array(n),
    deaths: new Float32Array(n),
    files: new Float32Array(n),
  }
}
