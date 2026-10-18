import {
  type ChatwootBotReclaimReason,
  type ChatwootBotSettings,
  type ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import { isAssigneeOffline } from './chatwootAgentsAvailabilityCache.js';
import { minutesSinceLastAgentPublicReply } from './chatwootLastAgentReplyCache.js';
import { getConversationHumanAssigneeId } from './ChatwootBotHandoverUtils.js';

export type ReclaimDecision =
  | { shouldReclaim: false }
  | {
      shouldReclaim: true;
      reason: ChatwootBotReclaimReason;
      publicMessage: string;
    };

function agentSilentWaitExceeded(
  minutesSinceReply: number | null,
  thresholdMinutes: number,
  treatNoReplyAsSilent: boolean,
): boolean {
  if (minutesSinceReply === null) return treatNoReplyAsSilent;
  return minutesSinceReply > thresholdMinutes;
}

export async function evaluateHumanHandoverReclaim(
  settings: ChatwootBotSettings,
  payload: ChatwootWebhookMessageCreated,
  conversationId: number,
  inHours: boolean,
): Promise<ReclaimDecision> {
  if (!settings.reclaimEnabled) {
    return { shouldReclaim: false };
  }

  const assigneeId = getConversationHumanAssigneeId(payload);
  if (
    assigneeId &&
    settings.reclaimOnAssigneeOffline &&
    (await isAssigneeOffline(settings, assigneeId))
  ) {
    return {
      shouldReclaim: true,
      reason: 'reclaim_offline',
      publicMessage: settings.reclaimMessageOffline,
    };
  }

  const minutes = await minutesSinceLastAgentPublicReply(settings, conversationId);

  if (inHours) {
    if (!settings.reclaimInHoursAgentSilentEnabled) {
      return { shouldReclaim: false };
    }
    const waitExceeded = agentSilentWaitExceeded(
      minutes,
      settings.reclaimInHoursSilentMinutes,
      settings.reclaimInHoursTreatNoAgentReplyAsSilent,
    );
    if (waitExceeded) {
      return {
        shouldReclaim: true,
        reason: 'reclaim_in_hours',
        publicMessage: settings.reclaimMessageInHours,
      };
    }
    return { shouldReclaim: false };
  }

  if (!settings.reclaimOnOohAgentSilent) {
    return { shouldReclaim: false };
  }

  const waitExceeded = agentSilentWaitExceeded(
    minutes,
    settings.reclaimOohSilentMinutes,
    settings.reclaimOohTreatNoAgentReplyAsSilent,
  );
  if (waitExceeded) {
    return {
      shouldReclaim: true,
      reason: 'reclaim_ooh',
      publicMessage: settings.reclaimMessageOoh,
    };
  }

  return { shouldReclaim: false };
}
