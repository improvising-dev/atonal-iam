import { Conflict, ensureValues, NotFound, useInstance } from 'atonal'
import { makeStartsWithRegExp } from 'atonal-db'
import {
  Permission,
  PermissionModel,
  RoleModel,
  SideloadablePermission,
  UserModel,
} from '../models'

export class PermissionProvider {
  async sideloadPermissions(permissions: SideloadablePermission[]) {
    const now = new Date()

    for (const permission of permissions) {
      const { name, alias, description } = permission

      const created = await PermissionModel.findOneAndUpdate(
        { name },
        {
          $set: {
            alias,
            description,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
        },
      )

      console.log(created)
    }
  }

  async createPermission(
    name: string,
    {
      alias,
      description,
    }: {
      alias?: string
      description?: string
    },
  ) {
    try {
      return await PermissionModel.create(
        ensureValues({
          name,
          alias,
          description,
        }),
      )
    } catch {
      throw new Conflict('permission exists')
    }
  }

  async getPermissions({
    name,
    sortBy = 'createdAt',
    orderBy = 'asc',
    skip = 0,
    limit = 20,
  }: {
    name?: string
    sortBy?: '_id' | 'createdAt' | 'updatedAt'
    orderBy?: 'asc' | 'desc'
    skip?: number
    limit?: number
  }) {
    const filter = ensureValues({
      ...(name && { name: makeStartsWithRegExp(name, 'i') }),
    })

    const count = await PermissionModel.countDocuments(filter)
    const results = await PermissionModel.find(filter)
      .sort({ [sortBy]: orderBy === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    return { count, results }
  }

  async getPermission(name: string) {
    const permission = await PermissionModel.findOne({ name })

    if (!permission) {
      throw new NotFound('permission is not found')
    }

    return permission
  }

  async updatePermission(
    name: string,
    partial: Partial<Pick<Permission, 'alias' | 'description'>>,
  ) {
    const $set = ensureValues(partial)
    const permission = await PermissionModel.findOneAndUpdate(
      { name },
      { $set },
      { returnDocument: 'after' },
    )

    if (!permission) {
      throw new NotFound('permission is not found')
    }

    return permission
  }

  async deletePermission(name: string) {
    const result = await PermissionModel.deleteOne({ name })

    if (result.deletedCount === 0) {
      throw new NotFound('permission is not found')
    }

    await RoleModel.updateMany(
      { permissions: name },
      {
        $pull: {
          permissions: name,
        },
      },
    )

    await UserModel.updateMany(
      { permissions: name },
      {
        $pull: {
          permissions: name,
        },
      },
    )

    return { success: true }
  }

  async guardExistingPermissions(permissions: string[]) {
    if (permissions.length > 0) {
      const count = await PermissionModel.countDocuments({
        name: {
          $in: permissions,
        },
      })

      if (count !== permissions.length) {
        throw new NotFound('some permissions are not found')
      }
    }
  }
}

export const usePermissionProvider = () =>
  useInstance<PermissionProvider>('IAM.provider.permission')
