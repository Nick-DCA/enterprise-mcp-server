import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProduction
    ? {
        // Production: GCP Cloud Logging compatible JSON format
        messageKey: 'message',
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        // Development: Readable colorized output if pino-pretty is available, or standard JSON
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
});
