import type { DmxStatus } from '@shared/types'

type DmxStatusSummary = Pick<DmxStatus, 'connected' | 'mode' | 'error'>

export function getDmxStatusLabel(
  status: DmxStatusSummary | null,
  connectionError: string | null
) {
  if (status?.connected) return 'Connected'
  if (!status || status.mode !== 'virtual' || status.error || connectionError) {
    return 'Disconnected'
  }
  return 'Virtual'
}
