import type { Folder } from './folder.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const FOLDER_REPOSITORY = Symbol('FolderRepository');

export interface FolderRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<Folder[]>;

  /**
   * Every folder inside the given workspaces.
   *
   * Takes a list rather than a single id so a caller reading a whole namespace
   * does it in one round trip instead of one per workspace. An empty list means
   * an empty result, not "no filter" — the difference is a data leak.
   */
  findByWorkspaceIds(workspaceIds: readonly string[]): Promise<Folder[]>;

  findByWorkspaceIdAndDefault(workspaceId: string): Promise<Folder | null>;

  /** One folder by id, or null. The caller checks which workspace it is in. */
  findById(id: string): Promise<Folder | null>;
}
