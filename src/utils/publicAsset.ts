/** Public assets follow Vite's configured subpath; embedded samples are bundled. */
export function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
