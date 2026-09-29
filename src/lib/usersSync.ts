import { User } from '@/types';

export interface UsersSyncOperations {
  upsert: (users: User[]) => Promise<void>;
  listIds: () => Promise<string[]>;
  deleteIds: (ids: string[]) => Promise<void>;
}

export function validateUsersContainAdmin(users: User[], currentEmail: string | null): void {
  if (!currentEmail || !currentEmail.trim()) {
    throw new Error(
      'La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.'
    );
  }

  const normalizedCurrent = currentEmail.trim().toLowerCase();
  const hasCurrentAdmin = users.some(
    (u) =>
      Boolean(u.email) &&
      u.email!.trim().toLowerCase() === normalizedCurrent &&
      u.role === 'ADMIN'
  );

  if (!hasCurrentAdmin) {
    throw new Error(
      'La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.'
    );
  }
}

export async function replaceUsers(
  users: User[],
  currentEmail: string | null,
  ops: UsersSyncOperations
): Promise<void> {
  validateUsersContainAdmin(users, currentEmail);

  await ops.upsert(users);

  const existingIds = await ops.listIds();
  const newIdsSet = new Set(users.map((u) => u.id));
  const leftoverIds = existingIds.filter((id) => !newIdsSet.has(id));

  if (leftoverIds.length > 0) {
    await ops.deleteIds(leftoverIds);
  }
}
