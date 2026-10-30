import type { StateCreator } from 'zustand';
import type { CostItem, CostSchedule } from '@/types/costModel';
import type { AssistantActie } from '@/services/assistant/assistantActions';
import type { AssistantProposalSummary } from '@/services/assistant/assistantProposal';

/**
 * Chatgeschiedenis van de calculatieassistent — per begroting (document-id).
 * Elk bericht heeft een eigen id en status, zodat meerdere vragen tegelijk
 * kunnen lopen: elke vraag krijgt een 'pending' antwoord-bubbel die los wordt
 * bijgewerkt zodra dát antwoord binnen is.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'pending' | 'done' | 'error';
  proposedActions?: AssistantActie[];
  proposalItems?: CostItem[];
  proposalSchedule?: CostSchedule;
  proposalStatus?: 'ready' | 'applied' | 'discarded' | 'stale' | 'failed' | 'undone';
  proposal?: AssistantProposalSummary;
}

export interface ChatSlice {
  /** chatgeschiedenis per document-id */
  chats: Record<string, ChatMessage[]>;
  appendChatMessage: (docId: string, msg: ChatMessage) => void;
  updateChatMessage: (docId: string, msgId: string, partial: Partial<ChatMessage>) => void;
  clearChat: (docId: string) => void;
}

export const createChatSlice: StateCreator<ChatSlice> = (set) => ({
  chats: {},

  appendChatMessage: (docId, msg) =>
    set((s) => ({
      chats: { ...s.chats, [docId]: [...(s.chats[docId] ?? []), msg] },
    })),

  updateChatMessage: (docId, msgId, partial) =>
    set((s) => ({
      chats: {
        ...s.chats,
        [docId]: (s.chats[docId] ?? []).map((m) => (m.id === msgId ? { ...m, ...partial } : m)),
      },
    })),

  clearChat: (docId) =>
    set((s) => {
      const { [docId]: _drop, ...rest } = s.chats;
      return { chats: rest };
    }),
});
