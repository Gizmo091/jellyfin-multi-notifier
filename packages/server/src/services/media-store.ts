import type { MediaEvent } from '../types/index.js'

/**
 * Interface for media event storage.
 * This will be replaced with a proper database in Epic 4.
 */
export interface MediaEventStore {
  addEvent(event: MediaEvent): void
  getEvents(): MediaEvent[]
  getEventsByType(eventType: 'added' | 'removed'): MediaEvent[]
  clearEvents(): void
  getEventCount(): number
}

/**
 * In-memory media event store.
 * Stores media events temporarily for aggregation (Epic 3).
 * This is a simple implementation that will be replaced with SQLite in Epic 4.
 */
class InMemoryMediaStore implements MediaEventStore {
  private events: MediaEvent[] = []

  /**
   * Adds a new media event to the store.
   */
  addEvent(event: MediaEvent): void {
    this.events.push(event)
  }

  /**
   * Returns all stored events (copy to prevent external mutation).
   */
  getEvents(): MediaEvent[] {
    return [...this.events]
  }

  /**
   * Returns events filtered by event type.
   */
  getEventsByType(eventType: 'added' | 'removed'): MediaEvent[] {
    return this.events.filter((event) => event.eventType === eventType)
  }

  /**
   * Clears all events from the store.
   */
  clearEvents(): void {
    this.events = []
  }

  /**
   * Returns the current number of events in the store.
   */
  getEventCount(): number {
    return this.events.length
  }
}

// Singleton instance for the application
export const mediaStore: MediaEventStore = new InMemoryMediaStore()
