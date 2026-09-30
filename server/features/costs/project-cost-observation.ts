import Decimal from 'decimal.js'

/** A zero command parent is only a container until a published child records it. */
export function isProjectCostObservation(item: { publication_origin: 'command' | 'legacy_backfill', amount_text: string }, hasPublishedDetail: boolean): boolean {
  return item.publication_origin === 'legacy_backfill' || !new Decimal(item.amount_text).isZero() || hasPublishedDetail
}
