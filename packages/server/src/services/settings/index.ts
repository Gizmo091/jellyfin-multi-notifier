import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type { NotificationChannel, ChannelType, SupportedLanguage, NotificationChannelConfig } from '../../types/index.js'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'queue.db')

// Re-export for backwards compatibility
export type { SupportedLanguage } from '../../types/index.js'

export interface WhatsAppGroupConfig {
  id: string
  groupId: string
  groupName: string
  language: SupportedLanguage
}


/**
 * Settings service for persisting app configuration in SQLite.
 * Uses the same database as QueueService for simplicity.
 */
class SettingsService {
  private db: Database.Database

  constructor() {
    this.ensureDataDirectory()
    this.db = new Database(DB_PATH)
    this.initialize()
  }

  /**
   * Ensures the data directory exists.
   */
  private ensureDataDirectory(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      console.log(`Created data directory: ${DATA_DIR}`)
    }
  }

  /**
   * Initialize the database schema.
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Table for WhatsApp groups with language configuration (legacy, kept for rollback)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_groups (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        group_name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // New unified notification channels table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_channels (
        id TEXT PRIMARY KEY,
        channel_type TEXT NOT NULL CHECK(channel_type IN ('whatsapp', 'discord', 'telegram')),
        target TEXT NOT NULL,
        display_name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        config TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Migrate from whatsapp_groups to notification_channels if needed
    this.migrateWhatsAppGroups()

    console.log('SettingsService initialized with SQLite database')
  }

  /**
   * Migrate existing WhatsApp groups to notification_channels.
   */
  private migrateWhatsAppGroups(): void {
    // Check if there are any whatsapp_groups that haven't been migrated
    const existingWhatsAppGroups = this.db.prepare(
      'SELECT id, group_id, group_name, language, created_at FROM whatsapp_groups'
    ).all() as { id: string; group_id: string; group_name: string; language: string; created_at: string }[]

    if (existingWhatsAppGroups.length === 0) {
      return
    }

    // Check if these groups already exist in notification_channels
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM notification_channels WHERE channel_type = ? AND target = ?'
    )

    let migratedCount = 0
    for (const group of existingWhatsAppGroups) {
      const existing = stmt.get('whatsapp', group.group_id) as { count: number }
      if (existing.count === 0) {
        // Migrate this group
        this.db.prepare(`
          INSERT INTO notification_channels (id, channel_type, target, display_name, language, enabled, created_at)
          VALUES (?, 'whatsapp', ?, ?, ?, 1, ?)
        `).run(group.id, group.group_id, group.group_name, group.language, group.created_at)
        migratedCount++
      }
    }

    if (migratedCount > 0) {
      console.log(`Migrated ${migratedCount} WhatsApp groups to notification_channels`)
    }
  }

  /**
   * Get a setting value by key.
   */
  get(key: string): string | null {
    const row = this.db.prepare(
      'SELECT value FROM app_settings WHERE key = ?'
    ).get(key) as { value: string } | undefined

    return row ? row.value : null
  }

  /**
   * Set a setting value.
   */
  set(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value)

    console.log(`Setting '${key}' updated`)
  }

  /**
   * Delete a setting.
   */
  delete(key: string): void {
    this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
    console.log(`Setting '${key}' deleted`)
  }

  /**
   * Get the configured WhatsApp group ID (legacy - returns first group).
   * @deprecated Use getWhatsAppGroups() instead
   */
  getWhatsAppGroupId(): string | null {
    const groups = this.getWhatsAppGroups()
    return groups.length > 0 ? groups[0].groupId : null
  }

  /**
   * Set the WhatsApp group ID (legacy - adds as single group).
   * @deprecated Use addWhatsAppGroup() instead
   */
  setWhatsAppGroupId(groupId: string): void {
    // For backwards compatibility, add as a single French group if no groups exist
    const existing = this.getWhatsAppGroups()
    if (existing.length === 0) {
      this.addWhatsAppGroup(groupId, 'Default Group', 'fr')
    }
  }

  /**
   * Get all configured WhatsApp groups with their languages.
   */
  getWhatsAppGroups(): WhatsAppGroupConfig[] {
    const rows = this.db.prepare(
      'SELECT id, group_id, group_name, language FROM whatsapp_groups ORDER BY created_at'
    ).all() as { id: string; group_id: string; group_name: string; language: string }[]

    return rows.map(row => ({
      id: row.id,
      groupId: row.group_id,
      groupName: row.group_name,
      language: row.language as SupportedLanguage,
    }))
  }

  /**
   * Add a WhatsApp group with language configuration.
   */
  addWhatsAppGroup(groupId: string, groupName: string, language: SupportedLanguage): WhatsAppGroupConfig {
    const id = `group-${Date.now()}`

    this.db.prepare(`
      INSERT INTO whatsapp_groups (id, group_id, group_name, language)
      VALUES (?, ?, ?, ?)
    `).run(id, groupId, groupName, language)

    console.log(`WhatsApp group added: ${groupName} (${language})`)

    return { id, groupId, groupName, language }
  }

  /**
   * Update a WhatsApp group configuration.
   */
  updateWhatsAppGroup(id: string, updates: Partial<Omit<WhatsAppGroupConfig, 'id'>>): void {
    const setClauses: string[] = []
    const values: (string | undefined)[] = []

    if (updates.groupId !== undefined) {
      setClauses.push('group_id = ?')
      values.push(updates.groupId)
    }
    if (updates.groupName !== undefined) {
      setClauses.push('group_name = ?')
      values.push(updates.groupName)
    }
    if (updates.language !== undefined) {
      setClauses.push('language = ?')
      values.push(updates.language)
    }

    if (setClauses.length > 0) {
      values.push(id)
      this.db.prepare(`
        UPDATE whatsapp_groups SET ${setClauses.join(', ')} WHERE id = ?
      `).run(...values)
      console.log(`WhatsApp group ${id} updated`)
    }
  }

  /**
   * Remove a WhatsApp group.
   */
  removeWhatsAppGroup(id: string): void {
    this.db.prepare('DELETE FROM whatsapp_groups WHERE id = ?').run(id)
    console.log(`WhatsApp group ${id} removed`)
  }

  // =============================================
  // Notification Channels (multi-platform)
  // =============================================

  /**
   * Get all notification channels.
   */
  getNotificationChannels(): NotificationChannel[] {
    const rows = this.db.prepare(
      'SELECT id, channel_type, target, display_name, language, config, enabled, created_at FROM notification_channels ORDER BY created_at'
    ).all() as {
      id: string
      channel_type: string
      target: string
      display_name: string
      language: string
      config: string | null
      enabled: number
      created_at: string
    }[]

    return rows.map(row => ({
      id: row.id,
      channelType: row.channel_type as ChannelType,
      target: row.target,
      displayName: row.display_name,
      language: row.language as SupportedLanguage,
      config: row.config ? JSON.parse(row.config) as NotificationChannelConfig : undefined,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    }))
  }

  /**
   * Get a notification channel by ID.
   */
  getNotificationChannel(id: string): NotificationChannel | null {
    const row = this.db.prepare(
      'SELECT id, channel_type, target, display_name, language, config, enabled, created_at FROM notification_channels WHERE id = ?'
    ).get(id) as {
      id: string
      channel_type: string
      target: string
      display_name: string
      language: string
      config: string | null
      enabled: number
      created_at: string
    } | undefined

    if (!row) return null

    return {
      id: row.id,
      channelType: row.channel_type as ChannelType,
      target: row.target,
      displayName: row.display_name,
      language: row.language as SupportedLanguage,
      config: row.config ? JSON.parse(row.config) as NotificationChannelConfig : undefined,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    }
  }

  /**
   * Add a new notification channel.
   */
  addNotificationChannel(
    channelType: ChannelType,
    target: string,
    displayName: string,
    language: SupportedLanguage,
    config?: NotificationChannelConfig
  ): NotificationChannel {
    const id = `channel-${Date.now()}`
    const configJson = config ? JSON.stringify(config) : null

    this.db.prepare(`
      INSERT INTO notification_channels (id, channel_type, target, display_name, language, config, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, channelType, target, displayName, language, configJson)

    // Also add to whatsapp_groups for backwards compatibility
    if (channelType === 'whatsapp') {
      this.db.prepare(`
        INSERT OR IGNORE INTO whatsapp_groups (id, group_id, group_name, language)
        VALUES (?, ?, ?, ?)
      `).run(id, target, displayName, language)
    }

    console.log(`Notification channel added: ${displayName} (${channelType}, ${language})`)

    return {
      id,
      channelType,
      target,
      displayName,
      language,
      config,
      enabled: true,
      createdAt: new Date().toISOString(),
    }
  }

  /**
   * Update a notification channel.
   */
  updateNotificationChannel(id: string, updates: Partial<Omit<NotificationChannel, 'id' | 'createdAt'>>): void {
    const setClauses: string[] = []
    const values: (string | number | null)[] = []

    if (updates.channelType !== undefined) {
      setClauses.push('channel_type = ?')
      values.push(updates.channelType)
    }
    if (updates.target !== undefined) {
      setClauses.push('target = ?')
      values.push(updates.target)
    }
    if (updates.displayName !== undefined) {
      setClauses.push('display_name = ?')
      values.push(updates.displayName)
    }
    if (updates.language !== undefined) {
      setClauses.push('language = ?')
      values.push(updates.language)
    }
    if (updates.config !== undefined) {
      setClauses.push('config = ?')
      values.push(updates.config ? JSON.stringify(updates.config) : null)
    }
    if (updates.enabled !== undefined) {
      setClauses.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }

    if (setClauses.length > 0) {
      values.push(id)
      this.db.prepare(`
        UPDATE notification_channels SET ${setClauses.join(', ')} WHERE id = ?
      `).run(...values)
      console.log(`Notification channel ${id} updated`)

      // Keep whatsapp_groups in sync for backwards compatibility
      const channel = this.getNotificationChannel(id)
      if (channel?.channelType === 'whatsapp') {
        this.db.prepare(`
          UPDATE whatsapp_groups SET group_id = ?, group_name = ?, language = ? WHERE id = ?
        `).run(channel.target, channel.displayName, channel.language, id)
      }
    }
  }

  /**
   * Toggle a notification channel enabled status.
   */
  toggleNotificationChannel(id: string, enabled: boolean): void {
    this.db.prepare(
      'UPDATE notification_channels SET enabled = ? WHERE id = ?'
    ).run(enabled ? 1 : 0, id)
    console.log(`Notification channel ${id} ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Remove a notification channel.
   */
  removeNotificationChannel(id: string): void {
    // Get channel info before deletion for backwards compat cleanup
    const channel = this.getNotificationChannel(id)

    this.db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id)

    // Also remove from whatsapp_groups if it was a WhatsApp channel
    if (channel?.channelType === 'whatsapp') {
      this.db.prepare('DELETE FROM whatsapp_groups WHERE id = ?').run(id)
    }

    console.log(`Notification channel ${id} removed`)
  }

  /**
   * Get all settings (for debugging).
   */
  getAll(): Record<string, string> {
    const rows = this.db.prepare(
      'SELECT key, value FROM app_settings'
    ).all() as { key: string; value: string }[]

    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key] = row.value
    }
    return settings
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close()
    console.log('SettingsService database connection closed')
  }

  // =============================================
  // WhatsApp Groups Cache
  // =============================================

  /**
   * Get cached WhatsApp groups.
   * Returns null if cache is expired or doesn't exist.
   */
  getCachedWhatsAppGroups(): { groups: unknown; cachedAt: string } | null {
    const cached = this.get('whatsapp_groups_cache')
    if (!cached) return null

    try {
      const data = JSON.parse(cached) as { groups: unknown; cachedAt: string }
      const cachedAt = new Date(data.cachedAt)
      const now = new Date()
      const daysDiff = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60 * 24)

      // Cache expires after 7 days
      if (daysDiff > 7) {
        console.log('WhatsApp groups cache expired')
        return null
      }

      return data
    } catch {
      return null
    }
  }

  /**
   * Save WhatsApp groups to cache.
   */
  setCachedWhatsAppGroups(groups: unknown): void {
    const data = {
      groups,
      cachedAt: new Date().toISOString(),
    }
    this.set('whatsapp_groups_cache', JSON.stringify(data))
    console.log('WhatsApp groups cached')
  }

  /**
   * Clear WhatsApp groups cache.
   */
  clearWhatsAppGroupsCache(): void {
    this.delete('whatsapp_groups_cache')
    console.log('WhatsApp groups cache cleared')
  }
}

// Singleton instance
export const settingsService = new SettingsService()
