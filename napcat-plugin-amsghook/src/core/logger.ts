// 日志模块
import { state, logBuffer, MAX_LOGS } from './state';

let nextLogId = 1;

export function addLog (level: string, msg: string): void {
  if (level === 'debug' && !state.config.debug) return;
  logBuffer.push({ id: nextLogId++, time: Date.now(), level, msg });
  if (logBuffer.length > MAX_LOGS) logBuffer.splice(0, logBuffer.length - MAX_LOGS);
}
