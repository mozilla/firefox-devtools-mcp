export const EXISTING_FIREFOX_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface ExistingFirefoxIdleControllerOptions {
  enabled: boolean;
  hasActiveConnection: () => boolean;
  disconnect: () => Promise<void>;
  onDisconnectError: (error: unknown) => void;
  timeoutMs?: number;
}

export class ExistingFirefoxIdleController {
  private activeCalls = 0;
  private timer: NodeJS.Timeout | undefined;
  private disconnecting: Promise<void> | undefined;
  private disposed = false;
  private readonly timeoutMs: number;

  constructor(private readonly options: ExistingFirefoxIdleControllerOptions) {
    this.timeoutMs = options.timeoutMs ?? EXISTING_FIREFOX_IDLE_TIMEOUT_MS;
  }

  async runWithActivity<T>(operation: () => Promise<T>): Promise<T> {
    this.clearTimer();
    if (this.disconnecting) {
      await this.disconnecting;
    }

    this.activeCalls++;
    try {
      return await operation();
    } finally {
      this.activeCalls--;
      this.armTimer();
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.clearTimer();
    await this.disconnecting;
  }

  private armTimer(): void {
    this.clearTimer();
    if (
      this.disposed ||
      !this.options.enabled ||
      this.activeCalls > 0 ||
      !this.options.hasActiveConnection()
    ) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.disposed || this.activeCalls > 0 || !this.options.hasActiveConnection()) {
        return;
      }
      this.disconnecting = this.disconnectIdle();
    }, this.timeoutMs);
    this.timer.unref();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private async disconnectIdle(): Promise<void> {
    try {
      await this.options.disconnect();
    } catch (error) {
      this.options.onDisconnectError(error);
    } finally {
      this.disconnecting = undefined;
    }
  }
}
