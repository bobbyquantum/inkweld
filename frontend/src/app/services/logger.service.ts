import { Injectable, isDevMode } from '@angular/core';

/**
 * Log levels for the application
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Centralized logging service that respects environment configuration
 * and provides consistent logging across the application.
 *
 * In production, only WARN and ERROR messages are logged by default.
 * In development, all log levels are available.
 */
@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private readonly isDev = isDevMode();
  private readonly minLevel: LogLevel = this.isDev
    ? LogLevel.DEBUG
    : LogLevel.WARN;

  /**
   * Logs a debug message (development only)
   * @param context - The context/component name for the log
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  debug(context: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(`[DEBUG][${context}] ${message}`, ...args);
    }
  }

  /**
   * Logs an info message (development only by default)
   * @param context - The context/component name for the log
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  info(context: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`[INFO][${context}] ${message}`, ...args);
    }
  }

  /**
   * Logs a warning message (production and development)
   * @param context - The context/component name for the log
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  warn(context: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`[WARN][${context}] ${message}`, ...args);
    }
  }

  /**
   * Logs an error message (production and development)
   * @param context - The context/component name for the log
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  error(context: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`[ERROR][${context}] ${message}`, ...args);
    }
  }

  /**
   * Logs a group of related messages (development only)
   * @param context - The context/component name for the log
   * @param label - The group label
   * @param callback - Callback that performs logging
   */
  group(context: string, label: string, callback: () => void): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.group(`[${context}] ${label}`);
      callback();
      console.groupEnd();
    }
  }

  /**
   * Checks if a log level should be logged based on current configuration
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }
}




