
export type OperationType = 'ban' | 'lift_ban' | 'kick' | 'set_admin' | 'unset_admin' | 'recall';

export interface PendingOperation {
  id: string;
  type: OperationType;
  group_id: string;
  user_id: string;
  operator_id?: string;
  duration?: number;
  created_at: number;
  timeout: number;
  resolve: (result: OperationResult) => void;
}

export interface OperationResult {
  success: boolean;
  confirmed: boolean;
  message: string;
  data?: unknown;
}

export interface NoticeEvent {
  post_type: 'notice';
  notice_type: string;
  sub_type?: string;
  group_id?: number;
  user_id?: number;
  operator_id?: number;
  duration?: number;
  message_id?: number;
}

const pendingOperations: Map<string, PendingOperation> = new Map();

function generateOperationId (type: OperationType, groupId: string, userId: string): string {
  return `${type}_${groupId}_${userId}_${Date.now()}`;
}

export function addPendingOperation (
  type: OperationType,
  groupId: string,
  userId: string,
  options: { duration?: number; timeout?: number; operatorId?: string } = {}
): Promise<OperationResult> {
  const { duration, timeout = 5000, operatorId } = options;
  const id = generateOperationId(type, groupId, userId);

  return new Promise((resolve) => {
    const operation: PendingOperation = {
      id,
      type,
      group_id: groupId,
      user_id: userId,
      operator_id: operatorId,
      duration,
      created_at: Date.now(),
      timeout,
      resolve,
    };

    pendingOperations.set(id, operation);

    setTimeout(() => {
      const op = pendingOperations.get(id);
      if (op) {
        pendingOperations.delete(id);
        op.resolve({
          success: true,
          confirmed: false,
          message: getSuccessMessage(type, userId, duration),
        });
      }
    }, timeout);
  });
}

export function handleNoticeEvent (event: NoticeEvent): boolean {
  const { notice_type, sub_type, group_id, user_id, operator_id, duration } = event;

  if (!group_id || !user_id) return false;

  const groupIdStr = String(group_id);
  const userIdStr = String(user_id);

  for (const [id, op] of pendingOperations.entries()) {
    if (op.group_id !== groupIdStr || op.user_id !== userIdStr) continue;

    let matched = false;
    let isSuccess = true;

    if (notice_type === 'group_ban') {
      if (op.type === 'ban' && sub_type === 'ban') {
        matched = true;
      } else if (op.type === 'lift_ban' && sub_type === 'lift_ban') {
        matched = true;
      }
    }

    if (notice_type === 'group_decrease' && op.type === 'kick') {
      if (sub_type === 'kick' || sub_type === 'kick_me') {
        matched = true;
      }
    }

    if (notice_type === 'group_admin') {
      if (op.type === 'set_admin' && sub_type === 'set') {
        matched = true;
      } else if (op.type === 'unset_admin' && sub_type === 'unset') {
        matched = true;
      }
    }

    if (notice_type === 'group_recall' && op.type === 'recall') {
      matched = true;
    }

    if (matched) {
      pendingOperations.delete(id);
      op.resolve({
        success: isSuccess,
        confirmed: true,
        message: getSuccessMessage(op.type, userIdStr, op.duration),
        data: { operator_id, duration },
      });
      return true;
    }
  }

  return false;
}

function getSuccessMessage (type: OperationType, userId: string, duration?: number): string {
  switch (type) {
    case 'ban':
      return duration
        ? `已禁言用户 ${userId}，时长 ${Math.floor(duration / 60)}分钟`
        : `已禁言用户 ${userId}`;
    case 'lift_ban':
      return `已解除用户 ${userId} 的禁言`;
    case 'kick':
      return `已将用户 ${userId} 踢出群聊`;
    case 'set_admin':
      return `已设置用户 ${userId} 为管理员`;
    case 'unset_admin':
      return `已取消用户 ${userId} 的管理员`;
    case 'recall':
      return `已撤回消息`;
    default:
      return `操作成功`;
  }
}

export function cleanupExpiredOperations (): void {
  const now = Date.now();
  for (const [id, op] of pendingOperations.entries()) {
    if (now - op.created_at > op.timeout * 2) {
      pendingOperations.delete(id);
    }
  }
}

export function getPendingCount (): number {
  return pendingOperations.size;
}
