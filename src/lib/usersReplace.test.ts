import { describe, it, expect, vi } from 'vitest';
import { User } from '@/types';
import { replaceUsers, validateUsersContainAdmin } from './usersSync';

function createMockUser(id: string, email: string, role: User['role'] = 'ADMIN'): User {
  return {
    id,
    name: `User ${id}`,
    username: id,
    role,
    email,
  };
}

describe('usersSync module', () => {
  describe('validateUsersContainAdmin', () => {
    it('throws error when currentEmail is null or empty', () => {
      const users = [createMockUser('u1', 'admin@example.com', 'ADMIN')];
      expect(() => validateUsersContainAdmin(users, null)).toThrow(
        'La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.'
      );
      expect(() => validateUsersContainAdmin(users, '   ')).toThrow(
        'La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.'
      );
    });

    it('throws error when users list does not contain current admin', () => {
      const users = [
        createMockUser('u1', 'other@example.com', 'ADMIN'),
        createMockUser('u2', 'referee@example.com', 'REFEREE'),
      ];
      expect(() => validateUsersContainAdmin(users, 'me@example.com')).toThrow(
        'La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.'
      );
    });

    it('throws error if the matching user does not have ADMIN role', () => {
      const users = [createMockUser('u1', 'me@example.com', 'REFEREE')];
      expect(() => validateUsersContainAdmin(users, 'me@example.com')).toThrow(
        'La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.'
      );
    });

    it('passes case-insensitively when user is an ADMIN', () => {
      const users = [createMockUser('u1', 'Admin@Example.COM', 'ADMIN')];
      expect(() => validateUsersContainAdmin(users, 'admin@example.com')).not.toThrow();
    });
  });

  describe('replaceUsers', () => {
    it('throws error and does not call ops if current admin is missing', async () => {
      const users = [createMockUser('u1', 'someone@example.com', 'ADMIN')];
      const upsertMock = vi.fn().mockResolvedValue(undefined);
      const listIdsMock = vi.fn().mockResolvedValue(['u1', 'u2']);
      const deleteIdsMock = vi.fn().mockResolvedValue(undefined);

      await expect(
        replaceUsers(users, 'other@example.com', {
          upsert: upsertMock,
          listIds: listIdsMock,
          deleteIds: deleteIdsMock,
        })
      ).rejects.toThrow(
        'La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.'
      );

      expect(upsertMock).not.toHaveBeenCalled();
      expect(listIdsMock).not.toHaveBeenCalled();
      expect(deleteIdsMock).not.toHaveBeenCalled();
    });

    it('calls upsert before delete and only deletes leftover ids', async () => {
      const executionOrder: string[] = [];

      const adminUser = createMockUser('u1', 'admin@example.com', 'ADMIN');
      const newUser = createMockUser('u2', 'new@example.com', 'REFEREE');
      const usersToSync = [adminUser, newUser];

      const upsertMock = vi.fn().mockImplementation(async () => {
        executionOrder.push('upsert');
      });

      const listIdsMock = vi.fn().mockImplementation(async () => {
        executionOrder.push('listIds');
        return ['u1', 'u2', 'u3', 'u4'];
      });

      const deleteIdsMock = vi.fn().mockImplementation(async () => {
        executionOrder.push('deleteIds');
      });

      await replaceUsers(usersToSync, 'admin@example.com', {
        upsert: upsertMock,
        listIds: listIdsMock,
        deleteIds: deleteIdsMock,
      });

      expect(upsertMock).toHaveBeenCalledWith(usersToSync);
      expect(deleteIdsMock).toHaveBeenCalledWith(['u3', 'u4']);
      expect(executionOrder).toEqual(['upsert', 'listIds', 'deleteIds']);
    });

    it('does not call deleteIds if there are no leftover ids', async () => {
      const adminUser = createMockUser('u1', 'admin@example.com', 'ADMIN');
      const upsertMock = vi.fn().mockResolvedValue(undefined);
      const listIdsMock = vi.fn().mockResolvedValue(['u1']);
      const deleteIdsMock = vi.fn().mockResolvedValue(undefined);

      await replaceUsers([adminUser], 'admin@example.com', {
        upsert: upsertMock,
        listIds: listIdsMock,
        deleteIds: deleteIdsMock,
      });

      expect(upsertMock).toHaveBeenCalledWith([adminUser]);
      expect(deleteIdsMock).not.toHaveBeenCalled();
    });
  });
});
