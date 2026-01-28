export interface AggregationWindows {
  movies: number
  series: number
  moviesRemoved: number
  seriesRemoved: number
}

export interface Config {
  port: number
  nodeEnv: string
  adminPassword: string
  jellyfinUrl: string
  webhookSecret: string
  whatsappPhoneNumber: string
  aggregationWindowMinutes: AggregationWindows
  publicUrl: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  alertEmail: string
  telegramBotToken: string
  telegramChatId: string
  discordWebhookUrl: string
  tmdbApiKey: string
  jellyfinDeepLinkEnabled: boolean
}

function getEnv(key: string, defaultValue = ''): string {
  return process.env[key] ?? defaultValue
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key]
  if (value === undefined) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

// Default aggregation window (used as fallback)
const defaultAggregationWindow = getEnvNumber('AGGREGATION_WINDOW_MINUTES', 15)

export const config: Config = {
  port: getEnvNumber('PORT', 3000),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  adminPassword: getEnv('ADMIN_PASSWORD', 'changeme'),
  jellyfinUrl: getEnv('JELLYFIN_URL', 'http://localhost:8096'),
  webhookSecret: getEnv('WEBHOOK_SECRET', ''),
  whatsappPhoneNumber: getEnv('WHATSAPP_PHONE_NUMBER', ''),
  aggregationWindowMinutes: {
    movies: getEnvNumber('AGGREGATION_WINDOW_MOVIES_MINUTES', defaultAggregationWindow),
    series: getEnvNumber('AGGREGATION_WINDOW_SERIES_MINUTES', defaultAggregationWindow),
    moviesRemoved: getEnvNumber('AGGREGATION_WINDOW_MOVIES_REMOVED_MINUTES', defaultAggregationWindow),
    seriesRemoved: getEnvNumber('AGGREGATION_WINDOW_SERIES_REMOVED_MINUTES', defaultAggregationWindow),
  },
  publicUrl: getEnv('PUBLIC_URL', 'http://localhost:3000'),
  smtpHost: getEnv('SMTP_HOST', ''),
  smtpPort: getEnvNumber('SMTP_PORT', 587),
  smtpUser: getEnv('SMTP_USER', ''),
  smtpPass: getEnv('SMTP_PASS', ''),
  alertEmail: getEnv('ALERT_EMAIL', ''),
  telegramBotToken: getEnv('TELEGRAM_BOT_TOKEN', ''),
  telegramChatId: getEnv('TELEGRAM_CHAT_ID', ''),
  discordWebhookUrl: getEnv('DISCORD_WEBHOOK_URL', ''),
  tmdbApiKey: getEnv('TMDB_API_KEY', ''),
  // Deep link disabled by default - Jellyfin iOS/Android apps don't fully support item navigation via URL
  jellyfinDeepLinkEnabled: getEnvBoolean('JELLYFIN_DEEP_LINK_ENABLED', false),
}
