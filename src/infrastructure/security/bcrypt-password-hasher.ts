import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import type { PasswordHasherPort } from '@domain/auth/auth.ports';

/**
 * bcrypt password hashing — the equivalent of Spring Security's
 * `BCryptPasswordEncoder`, and byte-compatible with the `$2a$`/`$2b$`/`$2y$`
 * hashes it writes.
 *
 * This is *not* the default. It exists so a deployment can read password hashes
 * produced by another system without a forced reset for every user; select it
 * with `PASSWORD_HASHER_ALGORITHM=bcrypt`. Two things to understand before
 * choosing it:
 *
 *  - **bcrypt is CPU-hard but not memory-hard.** An attacker with GPUs gets far
 *    more leverage against it than against Argon2id, which charges per guess in
 *    RAM. That is the whole argument for the Argon2 adapter being the default.
 *  - **bcrypt ignores input past 72 bytes.** `Password.MAX_LENGTH` is 128, so a
 *    long passphrase is silently truncated and its tail contributes nothing.
 *    We deliberately do not pre-hash with SHA-256 to work around it: that would
 *    change the input bcrypt sees and break compatibility with externally
 *    produced hashes, which is the only reason this adapter exists.
 *
 * `bcryptjs` rather than the native `bcrypt` binding: it is pure JavaScript, so
 * it adds no build toolchain to the container image, and the ~30% it gives up in
 * throughput is irrelevant against a cost factor that is tuned in doublings.
 */
@Injectable()
export class BcryptPasswordHasher implements PasswordHasherPort {
  private readonly costRounds: number;

  /**
   * A real hash of a throwaway value, computed once on first use and used to
   * burn equivalent CPU when no user matched. See `simulateVerification`.
   */
  private dummyHash: string | null = null;

  constructor(config: AppConfigService) {
    this.costRounds = config.bcrypt.costRounds;
  }

  async hash(plaintext: string): Promise<string> {
    // The `$2b$<cost>$<salt+digest>` output carries the salt and cost, so
    // verification needs nothing stored alongside it and old hashes stay
    // verifiable after the cost is raised.
    return bcrypt.hash(plaintext, this.costRounds);
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plaintext, hash);
    } catch {
      // A malformed or truncated hash must read as "wrong password", not as a
      // 500. Throwing here would let an attacker distinguish a corrupt row from
      // a wrong guess.
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    let rounds: number;

    try {
      rounds = bcrypt.getRounds(hash);
    } catch {
      // Unparseable — an Argon2 hash left over from before the switch, say.
      // Treat it as needing an upgrade.
      return true;
    }

    // `getRounds` reports NaN rather than throwing for most malformed input, so
    // the "unparseable means upgrade" rule has to be enforced here too — a bare
    // `NaN < costRounds` is false and would silently keep a hash we cannot read.
    if (!Number.isFinite(rounds)) return true;

    return rounds < this.costRounds;
  }

  /**
   * Called on the "no such user" path so that a failed login costs the same
   * wall time whether or not the account exists.
   *
   * Without it, response latency is a free account-enumeration oracle: ~250ms
   * means "that email is registered", ~1ms means it is not.
   */
  async simulateVerification(): Promise<void> {
    this.dummyHash ??= await this.hash('a-password-nobody-has-!7f3c2b91');
    await bcrypt.compare('wrong-password-on-purpose', this.dummyHash);
  }
}
