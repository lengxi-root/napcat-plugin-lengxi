export {
  getAllEnabledChatModels,
  getAllEnabledImageModels,
  getPrioritizedChatTargets,
  getPrioritizedImageTargets,
  getChatChannelsWithCache as normalizeChatChannels,
  getImageChannelsWithCache as normalizeImageChannels,
} from './config-service';

import { pluginState } from './state';

export function saveChannelConfig (): void {
  pluginState.saveConfig();
}
