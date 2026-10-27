import { uiText } from '@/i18n/uiText';
import { localStore } from '@/utils/browserStorage';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { buildAssistantSystemPrompt } from '@/services/assistant/promptLanguage';
import { useAppStore } from '@/state/appStore';
import { buildBudgetContext, ACTIE_PROTOCOL, parseActies, parseLocalBudgetCommand, applyActies, validateActies } from '@/services/assistant/assistantActions';
import { BEGROTEN_KENNIS } from '@/services/assistant/begrotenKennis';
import { OPENAEC_ENABLED, allowsExternalServices } from '@/services/buildFlags';
import './ChatPanel.css';

import type { ChatMessage } from '@/state/slices/chatSlice';
import type { AssistantActie } from '@/services/assistant/assistantActions';

const EMPTY_MESSAGES: ChatMessage[] = [];

function describeProposal(action: AssistantActie): string {
  switch (action.type) {
    case 'add_hoofdstuk': return uiText('chat.chapter', 'New chapter: {{code}} {{description}}', { code: String(action.code ?? ''), description: String(action.omschrijving ?? '') });
    case 'add_post': return uiText('chat.post', 'New item under {{parent}}: {{description}}', { parent: String(action.onderNr), description: String(action.omschrijving ?? '') });
    case 'add_regel': return uiText('chat.line', 'New line under {{parent}}: {{quantity}} {{unit}} {{description}}{{price}}', { parent: String(action.onderNr), quantity: String(action.aantal ?? '?'), unit: String(action.eenheid ?? 'st'), description: String(action.omschrijving ?? ''), price: action.prijs != null ? ` @ €${String(action.prijs)}` : '' });
    case 'update': return uiText('chat.update', 'No. {{number}}: {{field}} → {{value}}', { number: action.nr, field: uiText('chat.fields.' + String(action.veld), String(action.veld)), value: action.waarde });
    case 'verwijder': return uiText('chat.delete', 'Remove no. {{number}}, including child rows', { number: String(action.nr) });
    default: return String(action.type);
  }
}

/**
 * Maakt van een ruwe AI-aanroepfout een specifieke, diagnosticeerbare melding.
 * Toont altijd de echte statuscode + servermelding, zodat duidelijk is of het
 * om login, tokens, de verbinding of een serverfout (AI-bridge) gaat.
 */
function describeAiError(err: unknown): string {
  const raw = String((err as { message?: string })?.message ?? err ?? '').trim();
  const status = raw.match(/\bgaf (\d{3})\b/)?.[1] ?? raw.match(/\b(40\d|41\d|42\d|50\d)\b/)?.[1] ?? null;
  // Servermelding uit een JSON-body, bv. {"message":"AI bridge exited 1: ..."}
  let serverMsg = '';
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const j = JSON.parse(raw.slice(jsonStart)) as { message?: string; error?: string };
      serverMsg = String(j.message ?? j.error ?? '');
    } catch { /* geen JSON-body */ }
  }
  const detail = serverMsg || raw || i18next.t('chat.unknownError');

  if (status === '401' || /niet ingelogd|geen refresh_token|log opnieuw in|invalid_grant/i.test(raw)) {
    return i18next.t('chat.errNotSignedIn', { detail });
  }
  if (status === '402' || /insufficient credits/i.test(raw)) {
    return i18next.t('chat.errNoCredits');
  }
  if (!status && /onbereikbaar|sending request|connection|econn|timed out|failed to connect|dns|refused/i.test(raw)) {
    return i18next.t('chat.errNoConnection', { detail });
  }
  if (status && status.startsWith('5')) {
    return i18next.t('chat.errServer', { status, detail });
  }
  return i18next.t('chat.errGeneric', { statusSuffix: status ? ` (${status})` : '', detail });
}

export function ChatPanel({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toggleChatPanel = useAppStore(s => s.toggleChatPanel);
  const activeDocId = useAppStore(s => s.activeDocumentId);
  const activeDocName = useAppStore(s => s.documents.find(d => d.id === s.activeDocumentId)?.fileName);
  const firstPostNr = useAppStore(s => s.items.find(i => i.rowType === 'begrotingspost')?.nr);
  const accountsUser = useAppStore(s => s.accountsUser);
  const aiCredits = useAppStore(s => s.aiCredits);
  const accountsAiComplete = useAppStore(s => s.accountsAiComplete);
  const accountsLoadCredits = useAppStore(s => s.accountsLoadCredits);

  // Chatgeschiedenis komt per begroting (document-id) uit de store, zodat elke
  // tab z'n eigen gesprek heeft en het bewaard blijft bij tab-wissels.
  const messages = useAppStore(s => s.chats[activeDocId] ?? EMPTY_MESSAGES);
  const appendChatMessage = useAppStore(s => s.appendChatMessage);
  const updateChatMessage = useAppStore(s => s.updateChatMessage);
  const pendingCount = messages.filter(m => m.status === 'pending').length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Creditsaldo tonen zodra de gebruiker met een OpenAEC-account is ingelogd
  useEffect(() => {
    if (accountsUser) void accountsLoadCredits();
  }, [accountsUser, accountsLoadCredits]);

  // Klein, statisch system-prompt. Bij de OpenAEC-bridge gaat dit als
  // command-line-argument mee (cmd.exe limiteert dat tot ~8K), dus de grote,
  // dynamische begrotingsinhoud zit NIET hier maar in het user-bericht (stdin).
  const buildSystemPrompt = useCallback(() => {
    return buildAssistantSystemPrompt(i18n.language, ACTIE_PROTOCOL);
  }, [i18n.language]);

  // Dynamische context (vakkennis + actuele begroting) — gaat in het
  // user-bericht zodat het niet tegen de command-line-limiet van de bridge aanloopt.
  const buildContextBlock = useCallback(() => {
    const store = useAppStore.getState();
    const staartItems = store.items.filter(i => i.rowType.startsWith('staart_'));
    return `${BEGROTEN_KENNIS}

Huidige begroting:
${buildBudgetContext(store.schedule, store.items)}
Staartkosten: ${staartItems.map(s => `${s.description} ${s.staartPercentage ?? ''}%`).join(', ') || '(geen)'}`;
  }, []);

  /** Bereken het ruwe assistent-antwoord. Alle context is op verzendmoment
   *  vastgelegd (snapshot), zodat een lopende vraag klopt ook als de gebruiker
   *  intussen van tab wisselt of een tweede vraag stelt. */
  const computeAnswer = useCallback(async (
    text: string,
    historyText: string,
    chatHistory: { role: 'user' | 'assistant'; content: string }[],
    contextBlock: string,
    chapters: { code: string; description: string; total: number }[],
    bvo: number | undefined,
  ): Promise<string> => {
    const apiKey = allowsExternalServices() ? (localStore.getItem('ocs-anthropic-key') || '') : '';

    // (1) OpenAEC-account
    if (OPENAEC_ENABLED && allowsExternalServices() && accountsUser) {
      const prompt = `${contextBlock}\n\n${historyText}\n\nAssistent:`;
      return (await accountsAiComplete(prompt, buildSystemPrompt())) || i18next.t('chat.noAnswer');
    }

    // (3) eigen Anthropic API-key
    if (apiKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: `${buildSystemPrompt()}\n\n${contextBlock}`,
          messages: [...chatHistory, { role: 'user', content: text }],
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      return data.content?.[0]?.text || i18next.t('chat.noAnswer');
    }

    // (2) geen AI — lokaal antwoord uit de snapshot
    const localActions = parseLocalBudgetCommand(text);
    if (localActions) return `${uiText('chat.localProposal', 'I propose one estimate line. Check the details, then click Apply.')}\n\n\`\`\`ocs-acties\n${JSON.stringify({ acties: localActions })}\n\`\`\``;
    const total = chapters.reduce((s, c) => s + c.total, 0);
    const lower = text.toLowerCase();
    const fmtTotal = Math.round(total).toLocaleString(i18next.resolvedLanguage || 'en');
    const chapterList = chapters.map(c => `- ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString(i18next.resolvedLanguage || 'en')}`).join('\n');
    if (lower.includes('totaal') || lower.includes('kosten') || lower.includes('prijs') || /\b(total|costs?|prices?)\b/.test(lower)) {
      return i18next.t('chat.localTotal', { total: fmtTotal, list: chapterList });
    }
    if (lower.includes('hoofdstuk') || lower.includes('overzicht') || /\b(chapters?|overview)\b/.test(lower)) {
      return i18next.t('chat.localChapters', { count: chapters.length, list: chapterList, total: fmtTotal });
    }
    if (lower.includes('duurste') || lower.includes('grootste') || /\b(largest|biggest|expensive)\b/.test(lower)) {
      const sorted = [...chapters].sort((a, b) => b.total - a.total);
      const list = sorted.slice(0, 5).map((c, i) => `${i + 1}. ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString(i18next.resolvedLanguage || 'en')} (${total ? Math.round(c.total / total * 100) : 0}%)`).join('\n');
      return i18next.t('chat.localTop', { list });
    }
    if (lower.includes('m2') || lower.includes('per vierkante meter') || lower.includes('bvo') || /per square met(er|re)/.test(lower)) {
      return bvo && bvo > 0
        ? i18next.t('chat.localBvo', { bvo, value: Math.round(total / bvo).toLocaleString(i18next.resolvedLanguage || 'en') })
        : i18next.t('chat.localNoBvo');
    }
    return i18next.t('chat.localHelp');
  }, [accountsUser, accountsAiComplete, buildSystemPrompt]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    // Alles vastleggen op verzendmoment → correct bij tab-wissel én concurrency
    const docId = activeDocId;
    const store = useAppStore.getState();
    const contextBlock = buildContextBlock();
    const chapters = store.items.filter(i => i.rowType === 'chapter' && i.depth === 0)
      .map(c => ({ code: c.code, description: c.description, total: c.total }));
    const bvo = store.schedule?.projectProperties?.find((p: any) => p.name === 'BVO')?.value ?? undefined;
    const priorMessages = store.chats[docId] ?? [];
    const historyText = priorMessages
      .filter(m => m.status !== 'pending')
      .map(m => `${m.role === 'user' ? 'Gebruiker' : 'Assistent'}: ${m.content}`)
      .concat(`Gebruiker: ${text}`).join('\n\n');
    const chatHistory = priorMessages
      .filter(m => m.status !== 'pending')
      .map(m => ({ role: m.role, content: m.content }));

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now(), status: 'done' };
    const pendingId = crypto.randomUUID();
    appendChatMessage(docId, userMsg);
    appendChatMessage(docId, { id: pendingId, role: 'assistant', content: '', timestamp: Date.now(), status: 'pending' });
    setInput('');

    try {
      const raw = await computeAnswer(text, historyText, chatHistory, contextBlock, chapters, bvo);
      const { acties, cleanText } = parseActies(raw);
      const errors = validateActies(acties, store.items);
      const inhoud = [cleanText || (acties.length ? '' : raw), errors.map(error => `✖ ${error}`).join('\n')].filter(Boolean).join('\n\n');
      updateChatMessage(docId, pendingId, {
        content: inhoud || (acties.length ? 'Controleer de voorgestelde begrotingswijzigingen.' : i18next.t('chat.noAnswer')),
        status: 'done',
        ...(acties.length && !errors.length ? { proposedActions: acties, proposalItems: store.items, proposalSchedule: store.schedule, proposalStatus: 'ready' as const } : {}),
      });
    } catch (err: any) {
      updateChatMessage(docId, pendingId, { content: describeAiError(err), status: 'error' });
    }
  }, [input, activeDocId, buildContextBlock, computeAnswer, appendChatMessage, updateChatMessage]);

  const applyProposal = (msg: ChatMessage) => {
    const current = useAppStore.getState();
    if (current.activeDocumentId !== activeDocId || current.items !== msg.proposalItems || current.schedule !== msg.proposalSchedule) {
      updateChatMessage(activeDocId, msg.id, { proposalStatus: 'stale', proposedActions: undefined, proposalItems: undefined, proposalSchedule: undefined });
      return;
    }
    const results = applyActies(msg.proposedActions ?? []);
    updateChatMessage(activeDocId, msg.id, { content: `${msg.content}\n\n${results.join('\n')}`, proposalStatus: results.every(r => r.startsWith('✔')) ? 'applied' : 'failed', proposedActions: undefined, proposalItems: undefined, proposalSchedule: undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`chat-panel${embedded ? ' chat-panel-embedded' : ''}`}>
      <div className="chat-header">
        <div className="chat-header-titles">
          <span className="chat-title">✨ {t('chat.title')}</span>
          <span className="chat-subtitle" title={activeDocName}>{activeDocName ? t('chat.workingIn', { name: activeDocName }) : t('chat.noDocument')}</span>
        </div>
        {OPENAEC_ENABLED && accountsUser && aiCredits != null && (
          <span
            className="chat-credits"
            title={t('chat.creditsTitle')}
          >
            {t('chat.tokens', { amount: aiCredits.toLocaleString(i18next.resolvedLanguage || 'en') })}
          </span>
        )}
        {!embedded && <button className="chat-close" onClick={toggleChatPanel}>✕</button>}
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-message chat-assistant">
            <div className="chat-bubble">{t('chat.welcome')}</div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-${msg.role}`}>
            {msg.status === 'pending' ? (
              <div className="chat-bubble chat-typing">{t('chat.thinking')}</div>
            ) : (
              <div className={`chat-bubble${msg.status === 'error' ? ' chat-error' : ''}`}>
                <div>{msg.content}</div>
                {msg.proposalStatus === 'ready' && <div className="chat-proposal">
                  <strong>{uiText('chat.count', 'Proposed changes: {{count}}', { count: msg.proposedActions?.length ?? 0 })}</strong>
                  <ul>{msg.proposedActions?.map((action, index) => <li key={index}>{describeProposal(action)}</li>)}</ul>
                  <div className="chat-proposal-actions">
                    <button type="button" onClick={() => applyProposal(msg)}>{uiText("chat.apply", "Apply to estimate")}</button>
                    <button type="button" onClick={() => updateChatMessage(activeDocId, msg.id, { proposalStatus: 'discarded', proposedActions: undefined, proposalItems: undefined, proposalSchedule: undefined })}>{uiText("chat.discard", "Discard")}</button>
                  </div>
                </div>}
                {msg.proposalStatus === 'stale' && <p className="chat-proposal-stale">{uiText("chat.stale", "The estimate has changed since this proposal. Send the request again.")}</p>}
                {msg.proposalStatus === 'discarded' && <p>{uiText("chat.discarded", "Proposal discarded.")}</p>}
                {msg.proposalStatus === 'failed' && <p className="chat-proposal-stale">{uiText("chat.failed", "The proposal was not fully applied. Review the messages and use Undo if needed.")}</p>}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {messages.length === 0 && (
        <div className="chat-chips">
          {[
            t('chat.chip1'),
            t('chat.chip2'),
            t('chat.chip3'),
            ...(firstPostNr ? [uiText('chat.example', 'Add under {{parent}} a line: 12 m³ Concrete C30 at €145', { parent: firstPostNr })] : []),
          ].map((s) => (
            <button key={s} className="chat-chip" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingCount > 0 ? t('chat.placeholderPending', { count: pendingCount }) : t('chat.placeholder')}
          rows={2}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={!input.trim() || !activeDocId}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
