export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error'
}

export class Logger {
  public constructor(private readonly scope: string) {}

  public debug(message: string, data?: unknown): void {
    this.write(LogLevel.Debug, message, data);
  }

  public info(message: string, data?: unknown): void {
    this.write(LogLevel.Info, message, data);
  }

  public warn(message: string, data?: unknown): void {
    this.write(LogLevel.Warn, message, data);
  }

  public error(message: string, data?: unknown): void {
    this.write(LogLevel.Error, message, data);
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    const prefix = `[${this.scope}] ${message}`;

    if (data === undefined) {
      console[level](prefix);
      return;
    }

    console[level](prefix, data);
  }
}
