import { config } from '../../config.js'
import { logger } from '../logger/index.js'

interface JellyfinItemInfo {
  id: string
  name: string
  dateCreated: Date
  premiereDate?: Date
  path?: string
}

/**
 * Service for interacting with the Jellyfin API.
 * Used to get additional item information for upgrade detection.
 */
class JellyfinService {
  /**
   * Check if the Jellyfin API is configured.
   */
  isConfigured(): boolean {
    return !!(config.jellyfinUrl && config.jellyfinApiKey)
  }

  /**
   * Get item information from Jellyfin API.
   * Returns null if API is not configured or request fails.
   */
  async getItemInfo(itemId: string): Promise<JellyfinItemInfo | null> {
    if (!this.isConfigured()) {
      return null
    }

    try {
      // We need a userId for the API call - use a system endpoint instead
      const url = `${config.jellyfinUrl}/Items/${itemId}`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MediaBrowser-Token': config.jellyfinApiKey,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        // Try alternative endpoint with Users
        const usersUrl = `${config.jellyfinUrl}/Items?Ids=${itemId}&Fields=DateCreated,Path`
        const usersResponse = await fetch(usersUrl, {
          method: 'GET',
          headers: {
            'X-MediaBrowser-Token': config.jellyfinApiKey,
            'Accept': 'application/json',
          },
        })

        if (!usersResponse.ok) {
          logger.warn('Jellyfin', `Failed to get item info: HTTP ${usersResponse.status}`, { itemId })
          return null
        }

        const data = await usersResponse.json() as { Items?: Array<{
          Id: string
          Name: string
          DateCreated?: string
          PremiereDate?: string
          Path?: string
        }> }

        if (!data.Items || data.Items.length === 0) {
          logger.warn('Jellyfin', 'Item not found', { itemId })
          return null
        }

        const item = data.Items[0]
        return {
          id: item.Id,
          name: item.Name,
          dateCreated: item.DateCreated ? new Date(item.DateCreated) : new Date(),
          premiereDate: item.PremiereDate ? new Date(item.PremiereDate) : undefined,
          path: item.Path,
        }
      }

      const item = await response.json() as {
        Id: string
        Name: string
        DateCreated?: string
        PremiereDate?: string
        Path?: string
      }

      return {
        id: item.Id,
        name: item.Name,
        dateCreated: item.DateCreated ? new Date(item.DateCreated) : new Date(),
        premiereDate: item.PremiereDate ? new Date(item.PremiereDate) : undefined,
        path: item.Path,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Jellyfin', `Failed to get item info: ${errorMessage}`, { itemId, error: errorMessage })
      return null
    }
  }

  /**
   * Check if an item is likely an upgrade (re-import of existing media).
   * An item is considered an upgrade if it was created more than 1 hour ago.
   *
   * @param itemId - The Jellyfin item ID
   * @param thresholdMinutes - Minutes threshold to consider as upgrade (default: 60)
   * @returns true if upgrade, false if new, null if unable to determine
   */
  async isUpgrade(itemId: string, thresholdMinutes = 60): Promise<boolean | null> {
    const itemInfo = await this.getItemInfo(itemId)

    if (!itemInfo) {
      // Unable to determine - API not configured or request failed
      return null
    }

    const now = new Date()
    const ageMs = now.getTime() - itemInfo.dateCreated.getTime()
    const ageMinutes = ageMs / (1000 * 60)

    const isUpgrade = ageMinutes > thresholdMinutes

    if (isUpgrade) {
      logger.info('Jellyfin', `Item "${itemInfo.name}" detected as upgrade (created ${Math.round(ageMinutes)} min ago)`, {
        itemId,
        name: itemInfo.name,
        dateCreated: itemInfo.dateCreated.toISOString(),
        ageMinutes: Math.round(ageMinutes),
      })
    } else {
      logger.debug('Jellyfin', `Item "${itemInfo.name}" is new (created ${Math.round(ageMinutes)} min ago)`, {
        itemId,
        name: itemInfo.name,
        dateCreated: itemInfo.dateCreated.toISOString(),
        ageMinutes: Math.round(ageMinutes),
      })
    }

    return isUpgrade
  }
}

// Singleton instance
export const jellyfinService = new JellyfinService()
