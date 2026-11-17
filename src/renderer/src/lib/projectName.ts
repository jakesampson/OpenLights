export function projectNameFromPath(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? ''
  return filename.replace(/\.json$/i, '')
}
