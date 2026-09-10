import { Fyo } from 'fyo';
import { Noun, Telemetry, Verb } from './types';

/**
 * # Telemetry
 * Used to check if people are using Books or not. Phase 0 only ships
 * first_desk_open (confirmed POST) and leaves general activity logging local.
 *
 * ## `start`
 * Used to initialize state. It should be called before any logging and after an
 * instance has loaded.
 * It is called on three events:
 * 1. When Desk is opened, i.e. when the usage starts, this also sends a
 *      Opened instance log.
 * 2. On visibility change if not started, eg: when user minimizes Books and
 *      then comes back later.
 * 3. When `log` is called, but telemetry isn't initialized.
 *
 * ## `log`
 * Used to log activity.
 *
 * ## `stop`
 * This is to be called when a session is being stopped. It's called on two events
 * 1. When the db is being changed.
 * 2. When the visiblity has changed which happens when either the app is being shut or
 *      the app is hidden.
 */

/** Record first company-create wall clock (gates the first-company-create ping). */
export function ensureFirstLaunchAt(fyo: Fyo): void {
  if (fyo.config.get('firstLaunchAt')) {
    return;
  }
  fyo.config.set('firstLaunchAt', new Date().toISOString());
}

export class TelemetryManager {
  #url = '';
  #started = false;
  fyo: Fyo;

  constructor(fyo: Fyo) {
    this.fyo = fyo;
  }

  get hasCreds() {
    return this.#isHttpUrl(this.#url);
  }

  #isHttpUrl(url: string) {
    return /^https?:\/\//i.test(url);
  }

  get started() {
    return this.#started;
  }

  async start(isOpened?: boolean) {
    this.#started = true;
    await this.#setCreds();

    if (isOpened) {
      this.log(Verb.Opened, 'instance');
    } else {
      this.log(Verb.Resumed, 'instance');
    }
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.log(Verb.Closed, 'instance');
    this.#started = false;
  }

  log(verb: Verb, noun: Noun, more?: Record<string, unknown>) {
    if (!this.#started && this.fyo.db.isConnected) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.start().then(() => this.#sendBeacon(verb, noun, more));
      return;
    }

    this.#sendBeacon(verb, noun, more);
  }

  async logOpened() {
    await this.#setCreds();
    this.#sendBeacon(Verb.Opened, 'app');
  }

  #sendBeacon(verb: Verb, noun: Noun, more?: Record<string, unknown>): boolean {
    // Phase 0: do not ship general activity beacons (opened/resumed/doc CRUD, etc.).
    // Install signal uses maybeSendFirstCompanyCreatePing (confirmed main-process POST).
    void verb;
    void noun;
    void more;
    return false;
  }

  /**
   * Phase 0: one-shot anonymous install signal after first company create.
   * Flag only after main-process POST returns 2xx (not sendBeacon queue).
   * Retries on later launches until success (or stays unset while telemetry is off).
   */
  async maybeSendFirstCompanyCreatePing(): Promise<boolean> {
    // Only after first company create recorded firstLaunchAt — never for upgrades/opens.
    if (!this.fyo.config.get('firstLaunchAt')) {
      return false;
    }
    if (this.fyo.config.get('firstLaunchPingSent')) {
      return true;
    }

    if (
      !this.fyo.store.telemetryEnabled ||
      this.fyo.store.skipTelemetryLogging
    ) {
      return false;
    }

    await this.#setCreds();
    if (!this.hasCreds) {
      return false;
    }

    const telemetryData = this.#getTelemtryData(Verb.Opened, 'app', {
      event: 'first_desk_open',
    });
    const body = {
      kind: 'telemetry',
      event: 'first_desk_open',
      device_id: telemetryData.deviceId,
      instance_id: telemetryData.instanceId,
      app_version: telemetryData.version,
      platform: telemetryData.platform,
      payload: {
        country: telemetryData.country,
        language: telemetryData.language,
        instanceId: telemetryData.instanceId,
        openCount: telemetryData.openCount,
        timestamp: telemetryData.timestamp,
        verb: telemetryData.verb,
        noun: telemetryData.noun,
        more: telemetryData.more,
      },
    };

    if (JSON.stringify(body).length > 4096) {
      return false;
    }

    let ok = false;
    try {
      ok = await ipc.sendDesktopEvent(body);
    } catch {
      ok = false;
    }
    if (ok) {
      this.fyo.config.set('firstLaunchPingSent', true);
    }
    return ok;
  }

  async #setCreds() {
    if (this.hasCreds) {
      return;
    }

    const { telemetryUrl } = await this.fyo.auth.getCreds();
    this.#url = this.#isHttpUrl(telemetryUrl) ? telemetryUrl : '';
  }

  #getTelemtryData(
    verb: Verb,
    noun: Noun,
    more?: Record<string, unknown>
  ): Telemetry {
    const countryCode = this.fyo.singles.SystemSettings?.countryCode;
    return {
      country: countryCode ?? '',
      language: this.fyo.store.language,
      deviceId:
        this.fyo.store.deviceId || (this.fyo.config.get('deviceId') ?? '-'),
      instanceId: this.fyo.store.instanceId,
      version: this.fyo.store.appVersion,
      openCount: this.fyo.store.openCount,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, -1),
      platform: this.fyo.store.platform,
      verb,
      noun,
      more,
    };
  }
}
