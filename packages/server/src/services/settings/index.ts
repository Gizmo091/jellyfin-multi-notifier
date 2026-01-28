import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'queue.db')


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

    console.log('SettingsService initialized with SQLite database')
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
   * Get the configured WhatsApp group ID.
   */
  getWhatsAppGroupId(): string | null {
    return this.get('whatsapp_group_id')
  }

  /**
   * Set the WhatsApp group ID.
   */
  setWhatsAppGroupId(groupId: string): void {
    this.set('whatsapp_group_id', groupId)
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
}

// Singleton instance
export const settingsService = new SettingsService()
