import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CustomCommand, Tool, ToolResult } from '../types';

let DATA_DIR = '';
let COMMANDS_FILE = '';

export function initDataDir (dataPath: string): void {
  DATA_DIR = dataPath;
  COMMANDS_FILE = join(DATA_DIR, 'custom_commands.json');

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

class CustomCommandManager {
  private commands: Map<string, CustomCommand> = new Map();
  private initialized: boolean = false;

  constructor () {
  }

  init (): void {
    if (this.initialized) return;
    this.loadCommands();
    this.initialized = true;
  }

  loadCommands (): void {
    if (!COMMANDS_FILE || !existsSync(COMMANDS_FILE)) return;

    try {
      const data = JSON.parse(readFileSync(COMMANDS_FILE, 'utf-8'));
      this.commands = new Map(Object.entries(data));
    } catch (error) {
      console.error('[CustomCommands] 加载失败:', error);
    }
  }

  private saveCommands (): void {
    if (!COMMANDS_FILE) return;
    try {
      writeFileSync(COMMANDS_FILE, JSON.stringify(Object.fromEntries(this.commands), null, 2), 'utf-8');
    } catch (error) {
      console.error('[CustomCommands] 保存失败:', error);
    }
  }

  addCommand (
    commandId: string,
    pattern: string,
    responseType: 'text' | 'api',
    responseContent: string = '',
    apiUrl: string = '',
    apiMethod: 'GET' | 'POST' = 'GET',
    apiExtract: string = '',
    description: string = ''
  ): ToolResult {
    try {
      new RegExp(pattern);
    } catch (error) {
      return { success: false, error: `正则表达式无效: ${error}` };
    }

    this.commands.set(commandId, {
      pattern,
      response_type: responseType,
      response_content: responseContent,
      api_url: apiUrl,
      api_method: apiMethod,
      api_extract: apiExtract,
      description,
      enabled: true,
      created_at: new Date().toISOString(),
    });

    this.saveCommands();
    return { success: true, message: `指令 '${commandId}' 已添加` };
  }

  removeCommand (commandId: string): ToolResult {
    if (this.commands.has(commandId)) {
      this.commands.delete(commandId);
      this.saveCommands();
      return { success: true, message: `指令 '${commandId}' 已删除` };
    }
    return { success: false, error: `指令 '${commandId}' 不存在` };
  }

  toggleCommand (commandId: string, enabled: boolean): ToolResult {
    const cmd = this.commands.get(commandId);
    if (!cmd) {
      return { success: false, error: `指令 '${commandId}' 不存在` };
    }
    cmd.enabled = enabled;
    this.saveCommands();
    return { success: true, message: `指令 '${commandId}' 已${enabled ? '启用' : '禁用'}` };
  }

  listCommands (): ToolResult {
    const cmdList = Array.from(this.commands.entries()).map(([id, cmd]) => ({
      id,
      pattern: cmd.pattern,
      type: cmd.response_type,
      description: cmd.description || '',
      enabled: cmd.enabled,
    }));
    return { success: true, data: cmdList, count: cmdList.length };
  }

  async matchAndExecute (
    content: string,
    userId: string,
    groupId: string,
    nickname: string
  ): Promise<string | null> {
    for (const [, cmd] of this.commands) {
      if (!cmd.enabled) continue;

      try {
        const match = content.match(new RegExp(cmd.pattern));
        if (match) {
          return await this.executeCommand(cmd, match, userId, groupId, nickname);
        }
      } catch (error) {
        console.error('[CustomCommands] 执行失败:', error);
      }
    }
    return null;
  }

  private async executeCommand (
    cmd: CustomCommand,
    match: RegExpMatchArray,
    userId: string,
    groupId: string,
    nickname: string
  ): Promise<string> {
    if (cmd.response_type === 'text') {
      let response = cmd.response_content;

      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          response = response.replace(new RegExp(`\\$${i}`, 'g'), match[i]);
        }
      }
      response = response.replace(/\{user_id\}/g, userId);
      response = response.replace(/\{group_id\}/g, groupId);
      response = response.replace(/\{nickname\}/g, nickname);

      return response;
    } else if (cmd.response_type === 'api') {
      const apiResult = await this.callApi(cmd, match, userId);
      if (typeof apiResult === 'object' && apiResult !== null && !(apiResult as string).startsWith?.('API 调用失败')) {
        let response = cmd.response_content || "";
        response = this.processComplexTemplate(response, apiResult as Record<string, unknown>);
        response = response.replace(/\{user_id\}/g, userId);
        response = response.replace(/\{group_id\}/g, groupId);
        response = response.replace(/\{nickname\}/g, nickname);
        return response;
      }
      return apiResult as string;
    }

    return '';
  }

  private async callApi (
    cmd: CustomCommand,
    match: RegExpMatchArray,
    userId: string
  ): Promise<unknown> {
    try {
      let url = cmd.api_url || '';

      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          url = url.replace(new RegExp(`\\$${i}`, 'g'), match[i]);
        }
      }
      url = url.replace(/\{user_id\}/g, userId);

      const response = await fetch(url, {
        method: cmd.api_method || 'GET',
      });

      const data = await response.json();

      const extractPath = cmd.api_extract || '';

      const result = this.formatApiResponse(data, extractPath);
      return result;
    } catch (error) {
      return `API 调用失败: ${error}`;
    }
  }

  private formatApiResponse (data: unknown, extractPath: string): unknown {
    if (!extractPath) {
      return data;
    }

    let result: unknown = data;
    let fields: string[] = [];

    const bracketMatch = extractPath.match(/\[([^\]]+)\]/g);
    if (bracketMatch) {
      const lastBracket = bracketMatch[bracketMatch.length - 1];
      const innerFields = lastBracket.slice(1, -1).split(',').map((f) => f.trim());
      if (innerFields.length > 0 && innerFields[0]) {
        fields = innerFields;
      }
    }

    const colonIdx = extractPath.indexOf(':');
    if (colonIdx > 0) {
      const pathPart = extractPath.substring(0, colonIdx).replace(/\[\]/g, '');
      const fieldPart = extractPath.substring(colonIdx + 1);
      if (typeof data === 'object' && data !== null && pathPart in (data as Record<string, unknown>)) {
        result = (data as Record<string, unknown>)[pathPart];
      }
      if (!fields.length) {
        fields = fieldPart.split(',').map((f) => f.trim());
      }
    }

    if (colonIdx < 0) {
      const fieldPaths = extractPath.split(',').map((f) => f.trim());
      if (fieldPaths.length > 0) {
        const hasDot = fieldPaths.some((fp) => fp.includes('.'));
        if (hasDot) {
          const extracted: Record<string, unknown> = {};
          for (const fieldPath of fieldPaths) {
            if (!fieldPath) continue;

            const parts = fieldPath.split('.');
            let current = data;
            let valid = true;

            for (const part of parts) {
              if (typeof current !== 'object' || current === null) {
                valid = false;
                break;
              }
              const record = current as Record<string, unknown>;
              if (part in record) {
                current = record[part];
              } else {
                valid = false;
                break;
              }
            }

            if (valid) {
              extracted[fieldPath] = current;
            } else {
              extracted[fieldPath] = '';
            }
          }

          if (Object.keys(extracted).length > 0) {
            return extracted;
          }
        } else {
          fields = fieldPaths;
        }
      }
    }

    if (result === data && typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>;
      for (const key of ['data', 'result', 'results', 'items', 'list', 'records']) {
        if (key in record && Array.isArray(record[key])) {
          result = record[key];
          break;
        }
      }
    }

    if (fields.length > 0 && typeof result === 'object' && result !== null) {
      const extracted: Record<string, unknown> = {};
      for (const field of fields) {
        const record = result as Record<string, unknown>;
        if (field in record) {
          extracted[field] = record[field];
        } else {
          extracted[field] = '';
        }
      }
      return extracted;
    }

    return result;
  }

  private formatValue (value: unknown, fields: string[] = []): string {
    if (value === null || value === undefined) return 'API 返回为空';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    if (Array.isArray(value)) {
      if (value.length === 0) return 'API 返回为空';
      return value.map(item => this.formatObject(item, fields)).join('\n');
    }

    if (typeof value === 'object') {
      return this.formatObject(value, fields);
    }

    return String(value);
  }

  private formatObject (obj: unknown, fields: string[] = []): string {
    if (obj === null || obj === undefined) return '';
    if (typeof obj !== 'object') return String(obj);

    const record = obj as Record<string, unknown>;

    if (fields.length > 0) {
      return fields.map(f => String(record[f] ?? '')).join(': ');
    }

    const entries = Object.entries(record)
      .filter(([_, v]) => v !== null && typeof v !== 'object')
      .map(([k, v]) => `${k}: ${v}`);

    if (entries.length === 0) {
      const nested = Object.entries(record)
        .filter(([_, v]) => typeof v === 'object' && v !== null)
        .map(([k, v]) => `【${k}】\n${this.formatValue(v, [])}`);
      return nested.join('\n') || JSON.stringify(obj);
    }

    return entries.join(' | ');
  }

  private processComplexTemplate (template: string, data: Record<string, unknown>): string {
    let result = template;
    
    const expressionRegex = /\$\{([^}]+)\}/g;
    const matches = [...template.matchAll(expressionRegex)];
    
    for (const match of matches) {
      const fullMatch = match[0]; // 完整的 ${...}
      const expression = match[1]; // 表达式内容
      
      let evaluatedValue: unknown;
      
      try {
        if (expression.includes('?')) {
          evaluatedValue = this.evaluateTernaryExpression(expression, data);
        } else {
          evaluatedValue = this.getNestedValue(data, expression);
        }
      } catch (error) {
        console.error(`[Template] 解析表达式失败: ${expression}`, error);
        evaluatedValue = '';
      }
      
      result = result.replace(fullMatch, String(evaluatedValue));
    }
    
    return result;
  }

  private evaluateTernaryExpression (expression: string, data: Record<string, unknown>): string {
    const match = expression.match(/^\s*([^?]+?)\s*\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]\s*$/);
    
    if (match) {
      const [, condition, trueValue, falseValue] = match;
      const conditionValue = this.getNestedValue(data, condition.trim());
      
      if (typeof conditionValue === 'boolean') {
        return conditionValue ? trueValue : falseValue;
      }
      
      const isTruthy = conditionValue !== null && conditionValue !== undefined && 
                      (typeof conditionValue !== 'string' || conditionValue.trim() !== '');
      return isTruthy ? trueValue : falseValue;
    }
    
    const numberMatch = expression.match(/^\s*([^?]+?)\s*\?\s*([^:]+?)\s*:\s*(.+?)\s*$/);
    if (numberMatch) {
      const [, conditionPath, truePart, falsePart] = numberMatch;
      const conditionValue = this.getNestedValue(data, conditionPath.trim());
      
      let trueValue: unknown = truePart;
      let falseValue: unknown = falsePart;
      
      if (truePart.includes('.') && !truePart.includes("'") && !truePart.includes('"')) {
        trueValue = this.getNestedValue(data, truePart.trim()) || truePart;
      }
      
      if (falsePart.includes('.') && !falsePart.includes("'") && !falsePart.includes('"')) {
        falseValue = this.getNestedValue(data, falsePart.trim()) || falsePart;
      }
      
      const isTruthy = conditionValue !== null && conditionValue !== undefined && 
                      (typeof conditionValue !== 'string' || conditionValue.trim() !== '');
      return isTruthy ? String(trueValue) : String(falseValue);
    }
    
    return '';
  }

  private getNestedValue (obj: unknown, path: string): unknown {
    if (!obj || !path) return '';
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) return '';
      if (typeof current !== 'object') return '';
      
      const record = current as Record<string, unknown>;
      if (part in record) {
        current = record[part];
      } else {
        return '';
      }
    }
    
    return current;
  }

  getPatterns (): Map<string, string> {
    const patterns = new Map<string, string>();
    for (const [id, cmd] of this.commands) {
      if (cmd.enabled) {
        patterns.set(id, cmd.pattern);
      }
    }
    return patterns;
  }
}

export const CUSTOM_COMMAND_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'add_custom_command',
      description: '添加自定义指令',
      parameters: {
        type: 'object',
        properties: {
          command_id: { type: 'string', description: '指令ID' },
          pattern: { type: 'string', description: '正则表达式' },
          response_type: {
            type: 'string',
            enum: ['text', 'api'],
            description: '响应类型',
          },
          response_content: { type: 'string', description: '固定回复内容(text类型)' },
          api_url: { type: 'string', description: 'API地址(api类型)' },
          api_extract: { type: 'string', description: 'API响应提取路径,格式:data:field1,field2 如data:name,password' },
          description: { type: 'string', description: '指令描述' },
        },
        required: ['command_id', 'pattern', 'response_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_custom_command',
      description: '删除自定义指令',
      parameters: {
        type: 'object',
        properties: {
          command_id: { type: 'string', description: '指令ID' },
        },
        required: ['command_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_custom_commands',
      description: '列出所有自定义指令',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_custom_command',
      description: '启用/禁用自定义指令',
      parameters: {
        type: 'object',
        properties: {
          command_id: { type: 'string', description: '指令ID' },
          enabled: { type: 'boolean', description: '是否启用' },
        },
        required: ['command_id', 'enabled'],
      },
    },
  },
];

export const commandManager = new CustomCommandManager();

export function executeCustomCommandTool (
  toolName: string,
  args: Record<string, unknown>
): ToolResult {
  switch (toolName) {
    case 'add_custom_command':
      return commandManager.addCommand(
        args.command_id as string,
        args.pattern as string,
        args.response_type as 'text' | 'api',
        args.response_content as string,
        args.api_url as string,
        args.api_method as 'GET' | 'POST',
        args.api_extract as string,
        args.description as string
      );
    case 'remove_custom_command':
      return commandManager.removeCommand(args.command_id as string);
    case 'list_custom_commands':
      return commandManager.listCommands();
    case 'toggle_custom_command':
      return commandManager.toggleCommand(args.command_id as string, args.enabled as boolean);
    default:
      return { success: false, error: `未知工具: ${toolName}` };
  }
}

export function getCustomCommandTools (): Tool[] {
  return CUSTOM_COMMAND_TOOLS;
}
