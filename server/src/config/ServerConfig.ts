export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly environment: 'development';
  readonly websocketAuthorityEnabled: true;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

export const serverConfig: ServerConfig = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number.parseInt(process.env.PORT ?? '8787', 10),
  environment: 'development',
  websocketAuthorityEnabled: true,
  minPlayers: 2,
  maxPlayers: 4,
};
