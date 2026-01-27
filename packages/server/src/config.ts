export interface Config {
  port: number
  nodeEnv: string
  adminPassword: string
  jellyfinUrl: string
  webhookSecret: string
  whatsappGroupId: string
  aggregationWindowMinutes: number
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

export const config: Config = {
  port: getEnvNumber('PORT', 3000),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  adminPassword: getEnv('ADMIN_PASSWORD', 'changeme'),
  jellyfinUrl: getEnv('JELLYFIN_URL', 'http://localhost:8096'),
  webhookSecret: getEnv('WEBHOOK_SECRET', ''),
  whatsappGroupId: getEnv('WHATSAPP_GROUP_ID', ''),
  aggregationWindowMinutes: getEnvNumber('AGGREGATION_WINDOW_MINUTES', 15),
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
}
