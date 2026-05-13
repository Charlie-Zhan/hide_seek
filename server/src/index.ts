import { serverConfig } from './config/ServerConfig.js';
import { WebSocketRoomServer } from './net/WebSocketRoomServer.js';
import { RoomService } from './rooms/RoomService.js';
import { Logger } from './util/Logger.js';

const logger = new Logger('ServerBootstrap');

logger.info('Prop Hide & Seek room server starting.');
logger.info('Loaded startup config.', serverConfig);

const roomService = new RoomService({
  minPlayers: serverConfig.minPlayers,
  maxPlayers: serverConfig.maxPlayers,
});
const roomServer = new WebSocketRoomServer(roomService);

roomServer.start();

const shutdown = (): void => {
  logger.info('Room server shutting down.');
  roomServer.close();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
