import { nanoid } from 'nanoid'
import { config } from '../../config.js'

export interface RedirectEntry {
  shortId: string
  jellyfinId: string
  title: string
  createdAt: Date
}

/**
 * Service for managing redirect links to Jellyfin content.
 * Uses in-memory storage (will be replaced with SQLite in Epic 4).
 */
class RedirectService {
  private redirects: Map<string, RedirectEntry> = new Map()

  /**
   * Create a redirect link for a media item.
   * Returns the short path like "/r/abc12345"
   */
  createRedirect(jellyfinId: string, title: string): string {
    const shortId = nanoid(8) // 8 char unique ID
    const entry: RedirectEntry = {
      shortId,
      jellyfinId,
      title,
      createdAt: new Date(),
    }
    this.redirects.set(shortId, entry)
    console.log(`Created redirect /${shortId} for "${title}" (${jellyfinId})`)
    return `/r/${shortId}`
  }

  /**
   * Get the full redirect URL including the server base URL.
   */
  getFullRedirectUrl(jellyfinId: string, title: string): string {
    const path = this.createRedirect(jellyfinId, title)
    // In production, this would use a configured base URL
    // For now, return the relative path
    return path
  }

  /**
   * Get the Jellyfin URL for a redirect ID.
   * Returns null if the redirect doesn't exist.
   */
  getJellyfinUrl(shortId: string): string | null {
    const entry = this.redirects.get(shortId)
    if (!entry) return null

    // Build Jellyfin web client URL
    return `${config.jellyfinUrl}/web/index.html#!/details?id=${entry.jellyfinId}`
  }

  /**
   * Get redirect entry by ID.
   */
  getEntry(shortId: string): RedirectEntry | null {
    return this.redirects.get(shortId) || null
  }

  /**
   * Get all redirect entries (for debugging/admin).
   */
  getAllEntries(): RedirectEntry[] {
    return Array.from(this.redirects.values())
  }

  /**
   * Get the count of stored redirects.
   */
  getCount(): number {
    return this.redirects.size
  }

  /**
   * Clear old redirects (older than specified hours).
   * Returns the number of entries removed.
   */
  clearOldEntries(maxAgeHours = 24): number {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)
    let removed = 0

    for (const [key, entry] of this.redirects.entries()) {
      if (entry.createdAt < cutoff) {
        this.redirects.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      console.log(`Cleared ${removed} old redirect entries`)
    }

    return removed
  }
}

// Singleton instance
export const redirectService = new RedirectService()
