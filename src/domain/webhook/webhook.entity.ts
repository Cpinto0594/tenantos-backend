export interface WebhookSnapshot {
  id: string;
  workflowId: string;
  triggerId: string;
  name: string;
  path: string;
  method: string;
  authenticationType: string;
  authenticationConfig: Record<string, unknown>;
  responseMode: string;
  responseConfig: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A webhook row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class Webhook {
  readonly id: string;
  readonly workflowId: string;
  readonly triggerId: string;
  readonly name: string;
  readonly path: string;
  readonly method: string;
  readonly authenticationType: string;
  readonly authenticationConfig: Record<string, unknown>;
  readonly responseMode: string;
  readonly responseConfig: Record<string, unknown>;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: WebhookSnapshot) {
    this.id = s.id;
    this.workflowId = s.workflowId;
    this.triggerId = s.triggerId;
    this.name = s.name;
    this.path = s.path;
    this.method = s.method;
    this.authenticationType = s.authenticationType;
    this.authenticationConfig = s.authenticationConfig;
    this.responseMode = s.responseMode;
    this.responseConfig = s.responseConfig;
    this.enabled = s.enabled;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: WebhookSnapshot): Webhook {
    return new Webhook(s);
  }

  toSnapshot(): WebhookSnapshot {
    return {
      id: this.id,
      workflowId: this.workflowId,
      triggerId: this.triggerId,
      name: this.name,
      path: this.path,
      method: this.method,
      authenticationType: this.authenticationType,
      authenticationConfig: this.authenticationConfig,
      responseMode: this.responseMode,
      responseConfig: this.responseConfig,
      enabled: this.enabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
