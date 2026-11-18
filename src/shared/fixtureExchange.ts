import type { FixtureDef } from './types'
import { migrateShow } from './migrations'
const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
export function exportFixtureCsv(fixtures: FixtureDef[]): string {
  return [['Name', 'Type', 'Address', 'Channels', 'Universe', 'Group', 'Notes', 'DataJson'], ...fixtures.map((f) => [f.name, f.type, f.channelStart, f.channels, f.universe ?? 1, f.group, f.notes, JSON.stringify(f)])].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [], row: string[] = []; let cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (!quoted && c === ',') { row.push(cell); cell = '' }
    else if (!quoted && (c === '\n' || c === '\r')) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push([...row]); row.length = 0; cell = '' }
    else cell += c
  }
  if (quoted) throw new Error('Unclosed CSV quotation')
  if (cell || row.length) { row.push(cell); rows.push([...row]) }
  return rows
}
export function importFixtureCsv(text: string): FixtureDef[] {
  const rows = parseCsv(text), header = rows.shift() ?? []
  const index = (key: string) => header.indexOf(key)
  if (index('Name') < 0 || index('Address') < 0) throw new Error('A patch CSV needs Name and Address columns')
  return rows.filter((row) => row.some(Boolean)).map((row) => {
    if (index('DataJson') >= 0 && row[index('DataJson')]) return JSON.parse(row[index('DataJson')]) as FixtureDef
    return migrateShow({ fixtures: [{ id: crypto.randomUUID(), name: row[index('Name')], type: row[index('Type')] || 'dimmer', channelStart: Number(row[index('Address')]), channels: Number(row[index('Channels')]) || 1, universe: Number(row[index('Universe')]) || 1, group: row[index('Group')], notes: row[index('Notes')] }] }).fixtures[0]
  })
}
export function printablePatch(fixtures: FixtureDef[]): string {
  const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
  return `<!doctype html><html><head><meta charset="utf-8"><title>OpenLights patch</title><style>body{font-family:system-ui}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:8px;text-align:left}</style></head><body><h1>Fixture patch</h1><table><thead><tr><th>Name</th><th>Type</th><th>Address</th><th>Channels</th><th>Group</th><th>Notes</th></tr></thead><tbody>${fixtures.map((f) => `<tr>${[f.name, f.type, f.channelStart, f.channels, f.group, f.notes].map((v) => `<td>${html(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
}
