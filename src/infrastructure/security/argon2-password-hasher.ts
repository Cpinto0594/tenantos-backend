import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import type { PasswordHasherPort } from '@domain/auth/auth.ports';

/**
 * Argon2id password hashing.
 *
 * Argon2id over bcrypt because it is memory-hard: a GPU or ASIC attacker has to
 * pay for RAM per guess rather than just arithmetic. Over scrypt because it is
 * the current password-hashing competition winner and has an actively
 * maintained native binding. The `id` variant resists both side-channel and
 * time-memory-tradeoff attacks, which is why it is the one OWASP recommends
 * over `argon2i` or `argon2d`.
 *
 * Parameters come from config so they can be raised as hardware improves
 * without a code change; the env schema enforces the OWASP floor
 * (19 MiB, t=2, p=1). The cost is deliberate — roughly 50ms per verification —
 * which is also why the login endpoint is rate limited: unbounded concurrent
 * logins would otherwise be a CPU and memory amplification attack.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  private readonly options: argon2.Options;

  /**
   * A real hash of a throwaway value, computed once at startup and used to burn
   * equivalent CPU when no user matched. See `simulateVerification`.
   */
  private dummyHash: string | null = null;

  constructor(config: AppConfigService) {
    this.options = {
      type: argon2.argon2id,
      memoryCost: config.argon2.memoryCost,
      timeCost: config.argon2.timeCost,
      parallelism: config.argon2.parallelism,
    };
  }

  async hash(plaintext: string): Promise<string> {
    // The encoded output carries the salt and parameters, so verification needs
    // nothing else stored alongside it, and old hashes stay verifiable after a
    // parameter change.
    return argon2.hash(plaintext, this.options);
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      // A malformed or truncated hash must read as "wrong password", not as a
      // 500. Throwing here would let an attacker distinguish a corrupt row from
      // a wrong guess.
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, this.options);
    } catch {
      // Unparseable — from an older scheme, say. Treat it as needing an upgrade.
      return true;
    }
  }

  /**
   * Called on the "no such user" path so that a failed login costs the same
   * wall time whether or not the account exists.
   *
   * Without it, response latency is a free account-enumeration oracle: ~50ms
   * means "that email is registered", ~1ms means it is not.
   */
  async simulateVerification(): Promise<void> {
    this.dummyHash ??= await this.hash('a-password-nobody-has-!7f3c2b91');
    await argon2.verify(this.dummyHash, 'wrong-password-on-purpose');
  }
}
