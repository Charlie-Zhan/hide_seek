type EventHandler<TPayload> = (payload: TPayload) => void;

export class EventBus<TEvents extends object> {
  private readonly handlers = new Map<keyof TEvents, Set<EventHandler<TEvents[keyof TEvents]>>>();

  public on<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): () => void {
    const handlers = this.getHandlers(eventName);
    handlers.add(handler as EventHandler<TEvents[keyof TEvents]>);

    return () => this.off(eventName, handler);
  }

  public off<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): void {
    const handlers = this.handlers.get(eventName);
    handlers?.delete(handler as EventHandler<TEvents[keyof TEvents]>);
  }

  public emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
    const handlers = this.handlers.get(eventName);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }

  public clear(): void {
    this.handlers.clear();
  }

  private getHandlers<TKey extends keyof TEvents>(eventName: TKey): Set<EventHandler<TEvents[keyof TEvents]>> {
    let handlers = this.handlers.get(eventName);
    if (!handlers) {
      handlers = new Set<EventHandler<TEvents[keyof TEvents]>>();
      this.handlers.set(eventName, handlers);
    }

    return handlers;
  }
}

export interface AppEvents {
  game_config_loaded: unknown;
  scene_load_requested: { sceneName: string };
}

export const appEventBus = new EventBus<AppEvents>();
