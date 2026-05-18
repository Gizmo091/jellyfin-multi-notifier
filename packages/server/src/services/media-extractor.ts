import { randomUUID } from 'crypto'
import { config } from '../config.js'
import { logger } from './logger/index.js'
import type {
  JellyfinWebhookPayload,
  JellyfinItem,
  MediaEvent,
  MediaType,
} from '../types/index.js'

/**
 * Maps Jellyfin notification types to our event types.
 * Only ItemAdded and ItemRemoved are processed.
 */
const NOTIFICATION_TYPE_MAP: Record<string, 'added' | 'removed'> = {
  ItemAdded: 'added',
  ItemRemoved: 'removed',
}

/**
 * Maps Jellyfin item types to our MediaType enum.
 * Returns null for unsupported types (Season, etc.) which should be ignored.
 */
function mapJellyfinType(jellyfinType?: string): MediaType | null {
  switch (jellyfinType?.toLowerCase()) {
    case 'movie':
      return 'movie'
    case 'series':
      return 'series'
    case 'episode':
      return 'episode'
    default:
      // Ignore unsupported types like Season, MusicAlbum, etc.
      return null
  }
}

/**
 * Decodes HTML entities in text.
 * Handles numeric (decimal & hex) and common named entities.
 */
function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&nbsp;': '\u00A0',
  }

  // Replace named entities
  let result = text
  for (const [entity, char] of Object.entries(namedEntities)) {
    result = result.replaceAll(entity, char)
  }

  // Replace numeric decimal entities: &#201; -> É
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))

  // Replace numeric hex entities: &#xC9; -> É
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))

  return result
}

/**
 * Coerces a value (possibly string from the webhook plugin) to a finite number.
 * Returns undefined for empty strings, non-numeric values, or unsubstituted templates like "{{SeasonNumber}}".
 */
function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '' || trimmed.startsWith('{{')) return undefined
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * Normalizes numeric fields in a JellyfinItem so they are always real numbers or undefined.
 * The Jellyfin webhook plugin substitutes template fields as strings (e.g., ParentIndexNumber: "1"),
 * which can produce NaN downstream when parsed. The Jellyfin REST API returns real numbers,
 * so we only need this for webhook-sourced payloads, but applying it uniformly is safe.
 */
function sanitizeJellyfinItem(item: JellyfinItem): JellyfinItem {
  return {
    ...item,
    ProductionYear: toFiniteNumber(item.ProductionYear),
    IndexNumber: toFiniteNumber(item.IndexNumber),
    ParentIndexNumber: toFiniteNumber(item.ParentIndexNumber),
  }
}

/**
 * Formats the title based on item type.
 * For episodes: "Series Name S01E02 - Episode Name"
 * For movies/series: Just the name
 */
function formatTitle(item: JellyfinItem): string {
  if (item.Type?.toLowerCase() === 'episode' && item.SeriesName) {
    const season = item.ParentIndexNumber?.toString().padStart(2, '0') ?? '??'
    const episode = item.IndexNumber?.toString().padStart(2, '0') ?? '??'
    const episodeName = item.Name ? ` - ${decodeHtmlEntities(item.Name)}` : ''
    return `${decodeHtmlEntities(item.SeriesName)} S${season}E${episode}${episodeName}`
  }

  return item.Name ? decodeHtmlEntities(item.Name) : 'Unknown'
}

/**
 * Builds the Jellyfin cover image URL.
 * Returns undefined if the item doesn't have a Primary image tag.
 */
export function buildCoverUrl(item: JellyfinItem): string | undefined {
  if (!item.Id || !item.ImageTags?.Primary) {
    return undefined
  }

  // Jellyfin cover URL format: {baseUrl}/Items/{id}/Images/Primary
  const baseUrl = config.jellyfinUrl.replace(/\/$/, '') // Remove trailing slash if present
  return `${baseUrl}/Items/${item.Id}/Images/Primary`
}

/**
 * Fetches item metadata from the Jellyfin API.
 * Used to work around the webhook plugin bug where SeasonNumber is always 0.
 * See: https://github.com/jellyfin/jellyfin-plugin-webhook/issues/129
 */
async function fetchJellyfinItem(itemId: string): Promise<JellyfinItem | null> {
  const apiKey = config.jellyfinApiKey
  if (!apiKey) {
    return null
  }

  try {
    const baseUrl = config.jellyfinUrl.replace(/\/$/, '')
    // Use /Items?ids=... — the legacy /Items/{itemId} endpoint returns 400
    // "Error processing request." on some Jellyfin versions even with a valid token.
    const response = await fetch(`${baseUrl}/Items?ids=${encodeURIComponent(itemId)}`, {
      method: 'GET',
      headers: {
        'X-MediaBrowser-Token': apiKey,
        'Accept': 'application/json',
      },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      logger.warn('Webhook', `Jellyfin API returned ${response.status} for item ${itemId}`, {
        body: body.slice(0, 200),
      })
      return null
    }
    const data = await response.json() as { Items?: JellyfinItem[] }
    const found = data.Items?.[0]
    if (!found) {
      logger.warn('Webhook', `Jellyfin API returned no item for ${itemId}`)
      return null
    }
    return found
  } catch (error) {
    logger.warn('Webhook', `Failed to fetch item from Jellyfin API: ${error}`)
    return null
  }
}

/**
 * Extracts a MediaEvent from a Jellyfin webhook payload.
 * Returns null if the payload is not a supported event type or lacks required data.
 * For episodes, fetches metadata from the Jellyfin API to get reliable season/episode numbers.
 */
export async function extractMediaEvent(payload: JellyfinWebhookPayload): Promise<MediaEvent | null> {
  const { NotificationType, Item } = payload

  // Only process ItemAdded and ItemRemoved
  if (!NotificationType || !(NotificationType in NOTIFICATION_TYPE_MAP)) {
    return null
  }

  // Item is required for extraction
  if (!Item) {
    logger.warn('Webhook', `${NotificationType} received without Item data`)
    return null
  }

  const eventType = NOTIFICATION_TYPE_MAP[NotificationType]
  const type = mapJellyfinType(Item.Type)

  // Ignore unsupported item types (Season, MusicAlbum, etc.)
  if (type === null) {
    logger.debug('Webhook', `Ignoring unsupported item type: ${Item.Type}`, {
      itemType: Item.Type,
      itemName: Item.Name,
    })
    return null
  }

  // Log warning for missing fields
  if (!Item.Id) {
    logger.warn('Webhook', 'Jellyfin item missing Id field')
  }
  if (!Item.Name) {
    logger.warn('Webhook', 'Jellyfin item missing Name field')
  }

  // For episodes, enrich metadata from the Jellyfin API to work around
  // the webhook plugin bug where {{SeasonNumber}} is always 0
  let enrichedItem = sanitizeJellyfinItem(Item)
  if (type === 'episode' && Item.Id) {
    const apiItem = await fetchJellyfinItem(Item.Id)
    if (apiItem) {
      enrichedItem = sanitizeJellyfinItem({ ...Item, ...apiItem })
      if (Item.ParentIndexNumber !== apiItem.ParentIndexNumber) {
        logger.debug('Webhook', `Fixed season number from webhook plugin: ${Item.ParentIndexNumber} -> ${apiItem.ParentIndexNumber}`, {
          itemName: Item.Name,
        })
      }
    }
  }

  const title = formatTitle(enrichedItem)
  const coverUrl = buildCoverUrl(enrichedItem)

  // Extract episode-specific metadata for grouping
  const episodeMetadata = type === 'episode' ? {
    seriesName: enrichedItem.SeriesName ? decodeHtmlEntities(enrichedItem.SeriesName) : undefined,
    seasonNumber: enrichedItem.ParentIndexNumber,
    episodeNumber: enrichedItem.IndexNumber,
  } : {}

  return {
    id: randomUUID(),
    type,
    title,
    year: enrichedItem.ProductionYear,
    coverUrl,
    jellyfinId: enrichedItem.Id ?? 'unknown',
    eventType,
    timestamp: new Date(),
    ...episodeMetadata,
  }
}
