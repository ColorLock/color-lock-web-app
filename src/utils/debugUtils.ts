/**
 * Debug utility for standardized logging
 * 
 * This utility provides consistent logging across the application with easy
 * ways to turn on/off logging for different components or log levels.
 */

// Set to false to disable all debug logging in production
const ENABLE_DEBUG_LOGGING = process.env.NODE_ENV !== 'production';

// Enable/disable logging for specific components
const DEBUG_COMPONENTS = {
  tutorial: true,
  tutorialHighlight: true,
  tutorialModal: true,
  tutorialOverlay: true
};

// Log levels
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug'
}

/**
 * Log a message if debugging is enabled for the component
 * @param component The component generating the log
 * @param message The message to log
 * @param data Optional data to include with the log
 * @param level The log level (default: INFO)
 */
export const debugLog = (
  component: keyof typeof DEBUG_COMPONENTS,
  message: string,
  data?: any,
  level: LogLevel = LogLevel.INFO
): void => {
  if (!ENABLE_DEBUG_LOGGING || !DEBUG_COMPONENTS[component]) {
    return;
  }

  const prefix = `[${component}]`;
  
  switch (level) {
    case LogLevel.ERROR:
      console.error(prefix, message, data ?? '');
      break;
    case LogLevel.WARN:
      console.warn(prefix, message, data ?? '');
      break;
    case LogLevel.DEBUG:
      console.debug(prefix, message, data ?? '');
      break;
    case LogLevel.INFO:
    default:
      console.log(prefix, message, data ?? '');
  }
}; 