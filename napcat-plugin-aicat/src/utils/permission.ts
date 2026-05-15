import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { UserPermission } from '../types';
import { isOwner } from '../managers/owner-manager';
import { pluginState } from '../core/state';

export async function checkUserPermission (
  userId: string,
  groupId: string | undefined,
  ctx: NapCatPluginContext
): Promise<UserPermission> {
  if (isOwner(userId)) {
    return { is_admin: true, is_owner: true, role: 'owner' };
  }

  if (!groupId || !ctx.actions) {
    return { is_admin: false, is_owner: false, role: 'member' };
  }

  try {
    const result = await ctx.actions.call(
      'get_group_member_info',
      { group_id: groupId, user_id: userId } as never,
      ctx.adapterName,
      ctx.pluginManager.config
    ) as { role?: string; data?: { role?: string; }; };

    const role = result?.data?.role || result?.role || 'member';

    return {
      is_admin: role === 'admin' || role === 'owner',
      is_owner: role === 'owner',
      role: role as 'owner' | 'admin' | 'member',
    };
  } catch (error) {
    pluginState.log('error', '获取用户权限失败:', error);
    return { is_admin: false, is_owner: false, role: 'member' };
  }
}

export function buildPermissionInfo (
  userPerm: UserPermission,
  userIsOwner: boolean
): string {
  if (userIsOwner) {
    return '主人（最高权限），可执行所有操作';
  }

  if (userPerm.is_admin) {
    return '管理员，可执行管理操作';
  }

  return '普通成员，无管理权限。若请求管理操作，直接告知：你不是管理员，无法执行此操作喵';
}
