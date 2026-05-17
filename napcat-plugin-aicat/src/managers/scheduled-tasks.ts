import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ScheduledTask, Tool, ToolResult } from '../types';

let DATA_DIR = '';
let TASKS_FILE = '';

export function initTasksDataDir (dataPath: string): void {
  DATA_DIR = dataPath;
  TASKS_FILE = join(DATA_DIR, 'scheduled_tasks.json');

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

type MessageSender = (targetType: string, targetId: string, content: string) => Promise<void>;

class ScheduledTaskManager {
  private tasks: Map<string, ScheduledTask> = new Map();
  private messageSender: MessageSender | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private initialized: boolean = false;

  constructor () {
  }

  init (): void {
    if (this.initialized) return;
    this.loadTasks();
    this.initialized = true;
  }

  setMessageSender (sender: MessageSender): void {
    this.messageSender = sender;
  }

  loadTasks (): void {
    if (!TASKS_FILE || !existsSync(TASKS_FILE)) return;

    try {
      const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'));
      this.tasks = new Map(Object.entries(data));
    } catch (error) {
      console.error('[ScheduledTasks] 加载失败:', error);
    }
  }

  private saveTasks (): void {
    if (!TASKS_FILE) return;
    try {
      writeFileSync(TASKS_FILE, JSON.stringify(Object.fromEntries(this.tasks), null, 2), 'utf-8');
    } catch (error) {
      console.error('[ScheduledTasks] 保存失败:', error);
    }
  }

  startScheduler (): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.checkAndExecuteTasks();
    }, 15000);

    console.log('[ScheduledTasks] 调度器已启动 (每15秒检查)');
  }

  stopScheduler (): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ScheduledTasks] 调度器已停止');
    }
  }

  private async checkAndExecuteTasks (): Promise<void> {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    for (const [taskId, task] of this.tasks) {
      if (!task.enabled) continue;

      let shouldExecute = false;

      if (task.daily_time && currentTime === task.daily_time) {
        const lastRun = task.last_run ? new Date(task.last_run) : null;
        if (!lastRun || lastRun.toDateString() !== now.toDateString()) {
          shouldExecute = true;
        }
      }
      else if (task.interval_seconds > 0) {
        const lastRun = task.last_run ? new Date(task.last_run) : null;
        if (lastRun) {
          const elapsed = (now.getTime() - lastRun.getTime()) / 1000;
          const tolerance = 5;
          if (elapsed >= task.interval_seconds - tolerance) {
            shouldExecute = true;
          }
        } else {
          shouldExecute = true;
        }
      }

      if (shouldExecute) {
        await this.executeTask(taskId);
      }
    }
  }

  private async executeTask (taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      if (task.task_type === 'send_message' && this.messageSender) {
        await this.messageSender(task.target_type, task.target_id, task.content);
      } else if (task.task_type === 'api_call') {
        await fetch(task.content, { method: 'GET' });
      }

      task.last_run = new Date().toISOString();
      task.run_count = (task.run_count || 0) + 1;

      if (!task.repeat) {
        task.enabled = false;
      }

      this.saveTasks();
      console.log(`[ScheduledTasks] 任务 ${taskId} 已执行`);
    } catch (error) {
      console.error(`[ScheduledTasks] 任务 ${taskId} 执行失败:`, error);
    }
  }

  addTask (
    taskId: string,
    taskType: 'send_message' | 'api_call',
    targetType: 'group' | 'private',
    targetId: string,
    content: string,
    intervalSeconds: number = 0,
    dailyTime: string = '',
    repeat: boolean = false,
    description: string = '',
    runNow: boolean = false
  ): ToolResult {
    if (intervalSeconds <= 0 && !dailyTime) {
      return { success: false, error: '必须指定 interval_seconds 或 daily_time' };
    }

    if (dailyTime) {
      const timeMatch = dailyTime.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (!timeMatch) {
        return { success: false, error: 'daily_time 格式错误，应为 HH:MM' };
      }
    }

    this.tasks.set(taskId, {
      task_type: taskType,
      target_type: targetType,
      target_id: String(targetId),
      content,
      interval_seconds: intervalSeconds,
      daily_time: dailyTime,
      repeat,
      description,
      enabled: true,
      created_at: new Date().toISOString(),
      last_run: null,
      run_count: 0,
    });

    this.saveTasks();

    let msg = `定时任务 '${taskId}' 已添加`;
    if (dailyTime) {
      msg += `，每天 ${dailyTime} 执行`;
    } else if (intervalSeconds > 0) {
      msg += `，每 ${intervalSeconds} 秒执行`;
    }

    if (runNow) {
      this.executeTask(taskId);
      msg += '（已立即执行一次）';
    }

    return { success: true, message: msg };
  }

  removeTask (taskId: string): ToolResult {
    if (this.tasks.has(taskId)) {
      this.tasks.delete(taskId);
      this.saveTasks();
      return { success: true, message: `定时任务 '${taskId}' 已删除` };
    }
    return { success: false, error: `任务 '${taskId}' 不存在` };
  }

  toggleTask (taskId: string, enabled: boolean): ToolResult {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: `任务 '${taskId}' 不存在` };
    }
    task.enabled = enabled;
    this.saveTasks();
    return { success: true, message: `任务 '${taskId}' 已${enabled ? '启用' : '禁用'}` };
  }

  async runTaskNow (taskId: string): Promise<ToolResult> {
    if (!this.tasks.has(taskId)) {
      return { success: false, error: `任务 '${taskId}' 不存在` };
    }
    await this.executeTask(taskId);
    return { success: true, message: `任务 '${taskId}' 已执行` };
  }

  listTasks (): ToolResult {
    const taskList = Array.from(this.tasks.entries()).map(([id, task]) => {
      const schedule = task.daily_time
        ? `每天 ${task.daily_time}`
        : `每 ${task.interval_seconds} 秒`;
      return {
        id,
        type: task.task_type,
        target: `${task.target_type}:${task.target_id}`,
        schedule,
        repeat: task.repeat,
        enabled: task.enabled,
        run_count: task.run_count,
      };
    });
    return { success: true, data: taskList, count: taskList.length };
  }

  parseMessageContent (content: string): unknown[] {
    if (content.trim().startsWith('[') && content.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.every(item => item.type)) {
          return parsed;
        }
      } catch {
      }
    }

    const segments: unknown[] = [];
    let lastEnd = 0;
    const pattern = /\[CQ:(\w+)(?:,([^\]]*))?\]/g;

    for (const match of content.matchAll(pattern)) {
      if (match.index !== undefined && match.index > lastEnd) {
        segments.push({
          type: 'text',
          data: { text: content.slice(lastEnd, match.index) },
        });
      }

      const [, cqType, paramsStr] = match;
      const params: Record<string, string> = {};

      if (paramsStr) {
        for (const p of paramsStr.split(',')) {
          const [key, value] = p.split('=');
          if (key && value) params[key] = value;
        }
      }

      if (cqType === 'at') {
        segments.push({ type: 'at', data: { qq: params.qq || '' } });
      } else if (cqType === 'image') {
        segments.push({ type: 'image', data: { file: params.file || '' } });
      } else {
        segments.push({ type: cqType, data: params });
      }

      lastEnd = match.index + match[0].length;
    }

    if (lastEnd < content.length) {
      segments.push({ type: 'text', data: { text: content.slice(lastEnd) } });
    }

    return segments.length > 0 ? segments : [{ type: 'text', data: { text: content } }];
  }
}

export const SCHEDULED_TASK_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'add_scheduled_task',
      description: '添加定时任务',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务ID' },
          task_type: {
            type: 'string',
            enum: ['send_message', 'api_call'],
            description: '任务类型',
          },
          target_type: {
            type: 'string',
            enum: ['group', 'private'],
            description: '目标类型',
          },
          target_id: { type: 'string', description: '目标ID' },
          content: { type: 'string', description: '消息内容或API地址' },
          daily_time: { type: 'string', description: '每日执行时间(HH:MM)' },
          interval_seconds: { type: 'integer', description: '执行间隔(秒)' },
          repeat: { type: 'boolean', description: '是否重复' },
          run_now: { type: 'boolean', description: '是否立即执行一次' },
        },
        required: ['task_id', 'task_type', 'target_type', 'target_id', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_scheduled_task',
      description: '删除定时任务',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务ID' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_scheduled_tasks',
      description: '列出所有定时任务',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_scheduled_task',
      description: '启用/禁用定时任务',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务ID' },
          enabled: { type: 'boolean', description: '是否启用' },
        },
        required: ['task_id', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_scheduled_task_now',
      description: '立即执行定时任务',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务ID' },
        },
        required: ['task_id'],
      },
    },
  },
];

export const taskManager = new ScheduledTaskManager();

export async function executeScheduledTaskTool (
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (toolName) {
    case 'add_scheduled_task':
      return taskManager.addTask(
        args.task_id as string,
        args.task_type as 'send_message' | 'api_call',
        args.target_type as 'group' | 'private',
        args.target_id as string,
        args.content as string,
        args.interval_seconds as number,
        args.daily_time as string,
        args.repeat as boolean,
        args.description as string,
        args.run_now as boolean
      );
    case 'remove_scheduled_task':
      return taskManager.removeTask(args.task_id as string);
    case 'list_scheduled_tasks':
      return taskManager.listTasks();
    case 'toggle_scheduled_task':
      return taskManager.toggleTask(args.task_id as string, args.enabled as boolean);
    case 'run_scheduled_task_now':
      return await taskManager.runTaskNow(args.task_id as string);
    default:
      return { success: false, error: `未知工具: ${toolName}` };
  }
}

export function getScheduledTaskTools (): Tool[] {
  return SCHEDULED_TASK_TOOLS;
}
