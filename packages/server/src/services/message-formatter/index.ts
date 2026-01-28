import type { MediaEvent, ChannelType, SupportedLanguage } from '../../types/index.js'
import type { DiscordEmbed } from '../senders/types.js'
import { config } from '../../config.js'

interface MessageTemplates {
  moviesSingle: string
  moviesMultiple: string
  seriesSingle: string
  seriesMultiple: string
  moviesRemovedSingle: string
  moviesRemovedMultiple: string
  seriesRemovedSingle: string
  seriesRemovedMultiple: string
  itemLine: string
  withYear: string
}

const templates: Record<SupportedLanguage, MessageTemplates> = {
  fr: {
    moviesSingle: '🎬 *Nouveau film disponible !*',
    moviesMultiple: '🎬 *{count} nouveaux films disponibles !*',
    seriesSingle: '📺 *Nouvel épisode disponible !*',
    seriesMultiple: '📺 *{count} nouveaux épisodes disponibles !*',
    moviesRemovedSingle: '🎬 *Film retiré de la bibliothèque*',
    moviesRemovedMultiple: '🎬 *{count} films retirés de la bibliothèque*',
    seriesRemovedSingle: '📺 *Épisode retiré de la bibliothèque*',
    seriesRemovedMultiple: '📺 *{count} épisodes retirés de la bibliothèque*',
    itemLine: '• {title}',
    withYear: '({year})',
  },
  en: {
    moviesSingle: '🎬 *New movie available!*',
    moviesMultiple: '🎬 *{count} new movies available!*',
    seriesSingle: '📺 *New episode available!*',
    seriesMultiple: '📺 *{count} new episodes available!*',
    moviesRemovedSingle: '🎬 *Movie removed from library*',
    moviesRemovedMultiple: '🎬 *{count} movies removed from library*',
    seriesRemovedSingle: '📺 *Episode removed from library*',
    seriesRemovedMultiple: '📺 *{count} episodes removed from library*',
    itemLine: '• {title}',
    withYear: '({year})',
  },
  es: {
    moviesSingle: '🎬 *¡Nueva película disponible!*',
    moviesMultiple: '🎬 *¡{count} nuevas películas disponibles!*',
    seriesSingle: '📺 *¡Nuevo episodio disponible!*',
    seriesMultiple: '📺 *¡{count} nuevos episodios disponibles!*',
    moviesRemovedSingle: '🎬 *Película eliminada de la biblioteca*',
    moviesRemovedMultiple: '🎬 *{count} películas eliminadas de la biblioteca*',
    seriesRemovedSingle: '📺 *Episodio eliminado de la biblioteca*',
    seriesRemovedMultiple: '📺 *{count} episodios eliminados de la biblioteca*',
    itemLine: '• {title}',
    withYear: '({year})',
  },
  de: {
    moviesSingle: '🎬 *Neuer Film verfügbar!*',
    moviesMultiple: '🎬 *{count} neue Filme verfügbar!*',
    seriesSingle: '📺 *Neue Episode verfügbar!*',
    seriesMultiple: '📺 *{count} neue Episoden verfügbar!*',
    moviesRemovedSingle: '🎬 *Film aus Bibliothek entfernt*',
    moviesRemovedMultiple: '🎬 *{count} Filme aus Bibliothek entfernt*',
    seriesRemovedSingle: '📺 *Episode aus Bibliothek entfernt*',
    seriesRemovedMultiple: '📺 *{count} Episoden aus Bibliothek entfernt*',
    itemLine: '• {title}',
    withYear: '({year})',
  },
  it: {
    moviesSingle: '🎬 *Nuovo film disponibile!*',
    moviesMultiple: '🎬 *{count} nuovi film disponibili!*',
    seriesSingle: '📺 *Nuovo episodio disponibile!*',
    seriesMultiple: '📺 *{count} nuovi episodi disponibili!*',
    moviesRemovedSingle: '🎬 *Film rimosso dalla libreria*',
    moviesRemovedMultiple: '🎬 *{count} film rimossi dalla libreria*',
    seriesRemovedSingle: '📺 *Episodio rimosso dalla libreria*',
    seriesRemovedMultiple: '📺 *{count} episodi rimossi dalla libreria*',
    itemLine: '• {title}',
    withYear: '({year})',
  },
  pt: {
    moviesSingle: '🎬 *Novo filme disponível!*',
    moviesMultiple: '🎬 *{count} novos filmes disponíveis!*',
    seriesSingle: '📺 *Novo episódio disponível!*',
    seriesMultiple: '📺 *{count} novos episódios disponíveis!*',
    moviesRemovedSingle: '🎬 *Filme removido da biblioteca*',
    moviesRemovedMultiple: '🎬 *{count} filmes removidos da biblioteca*',
    seriesRemovedSingle: '📺 *Episódio removido da biblioteca*',
    seriesRemovedMultiple: '📺 *{count} episódios removidos da biblioteca*',
    itemLine: '• {title}',
    withYear: '({year})',
  },
}

/**
 * Supported languages with their display names
 */
export const supportedLanguages: Record<SupportedLanguage, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
}

/**
 * Message formatter service for multi-language notifications.
 */
class MessageFormatterService {
  /**
   * Format a notification message for movies.
   */
  formatMoviesMessage(items: MediaEvent[], language: SupportedLanguage): string {
    const t = templates[language] || templates.en

    const header = items.length === 1
      ? t.moviesSingle
      : t.moviesMultiple.replace('{count}', items.length.toString())

    const lines = items.map(item => {
      let line = t.itemLine.replace('{title}', item.title)
      if (item.year) {
        line += ' ' + t.withYear.replace('{year}', item.year.toString())
      }
      if (item.redirectUrl) {
        const fullUrl = item.redirectUrl.startsWith('http')
          ? item.redirectUrl
          : `${config.publicUrl.replace(/\/$/, '')}${item.redirectUrl}`
        line += `\n${fullUrl}`
      }
      return line
    })

    return `${header}\n\n${lines.join('\n\n')}`
  }

  /**
   * Format a notification message for series/episodes.
   */
  formatSeriesMessage(items: MediaEvent[], language: SupportedLanguage): string {
    const t = templates[language] || templates.en

    const header = items.length === 1
      ? t.seriesSingle
      : t.seriesMultiple.replace('{count}', items.length.toString())

    const lines = items.map(item => {
      let line = t.itemLine.replace('{title}', item.title)
      if (item.redirectUrl) {
        const fullUrl = item.redirectUrl.startsWith('http')
          ? item.redirectUrl
          : `${config.publicUrl.replace(/\/$/, '')}${item.redirectUrl}`
        line += `\n${fullUrl}`
      }
      return line
    })

    return `${header}\n\n${lines.join('\n\n')}`
  }

  /**
   * Format a notification message for removed movies.
   */
  formatMoviesRemovedMessage(items: MediaEvent[], language: SupportedLanguage): string {
    const t = templates[language] || templates.en

    const header = items.length === 1
      ? t.moviesRemovedSingle
      : t.moviesRemovedMultiple.replace('{count}', items.length.toString())

    const lines = items.map(item => {
      let line = t.itemLine.replace('{title}', item.title)
      if (item.year) {
        line += ' ' + t.withYear.replace('{year}', item.year.toString())
      }
      return line
    })

    return `${header}\n\n${lines.join('\n')}`
  }

  /**
   * Format a notification message for removed series/episodes.
   */
  formatSeriesRemovedMessage(items: MediaEvent[], language: SupportedLanguage): string {
    const t = templates[language] || templates.en

    const header = items.length === 1
      ? t.seriesRemovedSingle
      : t.seriesRemovedMultiple.replace('{count}', items.length.toString())

    const lines = items.map(item => {
      const line = t.itemLine.replace('{title}', item.title)
      return line
    })

    return `${header}\n\n${lines.join('\n')}`
  }

  /**
   * Format a notification based on media type.
   */
  formatMessage(type: 'movies' | 'series' | 'movies-removed' | 'series-removed', items: MediaEvent[], language: SupportedLanguage): string {
    switch (type) {
      case 'movies':
        return this.formatMoviesMessage(items, language)
      case 'series':
        return this.formatSeriesMessage(items, language)
      case 'movies-removed':
        return this.formatMoviesRemovedMessage(items, language)
      case 'series-removed':
        return this.formatSeriesRemovedMessage(items, language)
    }
  }

  /**
   * Get all supported languages.
   */
  getSupportedLanguages(): { code: SupportedLanguage; name: string }[] {
    return Object.entries(supportedLanguages).map(([code, name]) => ({
      code: code as SupportedLanguage,
      name,
    }))
  }

  /**
   * Format a notification message for a specific platform.
   * Returns platform-appropriate formatting.
   *
   * @param type - The type of notification
   * @param items - The media items
   * @param language - The language for the message
   * @param platform - The target platform
   * @returns Object with text and optional embed (for Discord)
   */
  formatForPlatform(
    type: 'movies' | 'series' | 'movies-removed' | 'series-removed',
    items: MediaEvent[],
    language: SupportedLanguage,
    platform: ChannelType
  ): { text: string; embed?: DiscordEmbed } {
    switch (platform) {
      case 'whatsapp':
        // WhatsApp uses markdown-style formatting (*bold*)
        return { text: this.formatMessage(type, items, language) }

      case 'discord':
        // Discord uses embeds for rich formatting
        return this.formatDiscordMessage(type, items, language)

      case 'telegram':
        // Telegram uses HTML formatting (<b>bold</b>)
        return { text: this.formatTelegramMessage(type, items, language) }

      default:
        return { text: this.formatMessage(type, items, language) }
    }
  }

  /**
   * Format a Discord message with embed support.
   */
  private formatDiscordMessage(
    type: 'movies' | 'series' | 'movies-removed' | 'series-removed',
    items: MediaEvent[],
    language: SupportedLanguage
  ): { text: string; embed?: DiscordEmbed } {
    const t = templates[language] || templates.en

    let header: string
    let color: number

    switch (type) {
      case 'movies':
        header = items.length === 1
          ? t.moviesSingle
          : t.moviesMultiple.replace('{count}', items.length.toString())
        color = 0x00a4dc // Jellyfin blue
        break
      case 'series':
        header = items.length === 1
          ? t.seriesSingle
          : t.seriesMultiple.replace('{count}', items.length.toString())
        color = 0x00a4dc
        break
      case 'movies-removed':
        header = items.length === 1
          ? t.moviesRemovedSingle
          : t.moviesRemovedMultiple.replace('{count}', items.length.toString())
        color = 0xff6b6b // Red for removals
        break
      case 'series-removed':
        header = items.length === 1
          ? t.seriesRemovedSingle
          : t.seriesRemovedMultiple.replace('{count}', items.length.toString())
        color = 0xff6b6b
        break
    }

    // Convert *bold* to **bold** for Discord markdown
    const title = header.replace(/\*([^*]+)\*/g, '**$1**')

    const lines = items.map(item => {
      let line = t.itemLine.replace('{title}', item.title)
      if (item.year && (type === 'movies' || type === 'movies-removed')) {
        line += ' ' + t.withYear.replace('{year}', item.year.toString())
      }
      if (item.redirectUrl && (type === 'movies' || type === 'series')) {
        const fullUrl = item.redirectUrl.startsWith('http')
          ? item.redirectUrl
          : `${config.publicUrl.replace(/\/$/, '')}${item.redirectUrl}`
        line += ` - [Watch](${fullUrl})`
      }
      return line
    })

    const description = lines.join('\n')

    return {
      text: `${title}\n\n${description}`, // Fallback text
      embed: {
        title,
        description,
        color,
      },
    }
  }

  /**
   * Format a Telegram message with HTML formatting.
   */
  private formatTelegramMessage(
    type: 'movies' | 'series' | 'movies-removed' | 'series-removed',
    items: MediaEvent[],
    language: SupportedLanguage
  ): string {
    const t = templates[language] || templates.en

    let header: string

    switch (type) {
      case 'movies':
        header = items.length === 1
          ? t.moviesSingle
          : t.moviesMultiple.replace('{count}', items.length.toString())
        break
      case 'series':
        header = items.length === 1
          ? t.seriesSingle
          : t.seriesMultiple.replace('{count}', items.length.toString())
        break
      case 'movies-removed':
        header = items.length === 1
          ? t.moviesRemovedSingle
          : t.moviesRemovedMultiple.replace('{count}', items.length.toString())
        break
      case 'series-removed':
        header = items.length === 1
          ? t.seriesRemovedSingle
          : t.seriesRemovedMultiple.replace('{count}', items.length.toString())
        break
    }

    // Convert *bold* to <b>bold</b> for Telegram HTML
    const htmlHeader = header.replace(/\*([^*]+)\*/g, '<b>$1</b>')

    const lines = items.map(item => {
      let line = t.itemLine.replace('{title}', this.escapeHtml(item.title))
      if (item.year && (type === 'movies' || type === 'movies-removed')) {
        line += ' ' + t.withYear.replace('{year}', item.year.toString())
      }
      if (item.redirectUrl && (type === 'movies' || type === 'series')) {
        const fullUrl = item.redirectUrl.startsWith('http')
          ? item.redirectUrl
          : `${config.publicUrl.replace(/\/$/, '')}${item.redirectUrl}`
        line += `\n<a href="${fullUrl}">${fullUrl}</a>`
      }
      return line
    })

    const separator = (type === 'movies-removed' || type === 'series-removed') ? '\n' : '\n\n'
    return `${htmlHeader}\n\n${lines.join(separator)}`
  }

  /**
   * Escape HTML special characters for Telegram.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}

// Singleton instance
export const messageFormatter = new MessageFormatterService()
