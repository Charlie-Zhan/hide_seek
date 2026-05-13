export class Logger {
  public constructor(private readonly scope: string) {}

  public info(message: string, data?: unknown): void {
    this.write('INFO', message, data);
  }

  public warn(message: string, data?: unknown): void {
    this.write('WARN', message, data);
  }

  public error(message: string, data?: unknown): void {
    this.write('ERROR', message, data);
  }

  private write(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void {
    const prefix = `[${new Date().toISOString()}] [${level}] [${this.scope}]`;

    if (data === undefined) {
      console.log(`${prefix} ${message}`);
      return;
    }

    console.log(`${prefix} ${message}`, data);
  }
}
