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
 * Extracts a MediaEvent from a Jellyfin webhook payload.
 * Returns null if the payload is not a supported event type or lacks required data.
 */
export function extractMediaEvent(payload: JellyfinWebhookPayload): MediaEvent | null {
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

  const title = formatTitle(Item)
  const coverUrl = buildCoverUrl(Item)

  // Log warning for missing fields
  if (!Item.Id) {
    logger.warn('Webhook', 'Jellyfin item missing Id field')
  }
  if (!Item.Name) {
    logger.warn('Webhook', 'Jellyfin item missing Name field')
  }

  // Extract episode-specific metadata for grouping
  const episodeMetadata = type === 'episode' ? {
    seriesName: Item.SeriesName ? decodeHtmlEntities(Item.SeriesName) : undefined,
    seasonNumber: Item.ParentIndexNumber,
    episodeNumber: Item.IndexNumber,
  } : {}

  return {
    id: randomUUID(),
    type,
    title,
    year: Item.ProductionYear,
    coverUrl,
    jellyfinId: Item.Id ?? 'unknown',
    eventType,
    timestamp: new Date(),
    ...episodeMetadata,
  }
}
