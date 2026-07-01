import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/state/appStore';
import { buildBudgetContext, ACTIE_PROTOCOL, parseActies, applyActies } from '@/services/assistant/assistantActions';
import { BEGROTEN_KENNIS } from '@/services/assistant/begrotenKennis';
import { OPENAEC_ENABLED } from '@/services/buildFlags';
import './ChatPanel.css';

import type { ChatMessage } from '@/state/slices/chatSlice';

const WELCOME =
  'Hallo! Ik ben de **OpenAEC calculatieassistent** en ik kijk mee in de begroting die nu open staat. Stel een vraag ("wat is het duurste hoofdstuk?") of geef een opdracht ("verhoog de betonbakken naar 14 stuks", "voeg onder 21.01 een regel toe…") — wijzigingen voer ik direct in het document door, met ongedaan-maken als vangnet. Je kunt gerust meerdere vragen tegelijk stellen.';

const EMPTY_MESSAGES: ChatMessage[] = [];

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
  const detail = serverMsg || raw || 'onbekende fout';

  if (status === '401' || /niet ingelogd|geen refresh_token|log opnieuw in|invalid_grant/i.test(raw)) {
    return `⚠️ Niet (meer) ingelogd bij OpenAEC. Log opnieuw in via de knop rechtsboven en probeer het dan opnieuw.\n\n_Detail: ${detail}_`;
  }
  if (status === '402' || /insufficient credits/i.test(raw)) {
    return '⚠️ Je OpenAEC AI-tegoed (tokens) is op. Koop tokens bij in de OpenAEC-portal en probeer het opnieuw.';
  }
  if (!status && /onbereikbaar|sending request|connection|econn|timed out|failed to connect|dns|refused/i.test(raw)) {
    return `⚠️ Geen verbinding met de OpenAEC-dienst. Draait de accounts-server (localhost:4000)?\n\n_Detail: ${detail}_`;
  }
  if (status && status.startsWith('5')) {
    return `⚠️ De OpenAEC AI-dienst gaf een serverfout (${status}) — dit ligt aan de serverkant.\n\n_Detail: ${detail}_`;
  }
  return `⚠️ AI-aanroep mislukt${status ? ` (${status})` : ''}.\n\n_Detail: ${detail}_`;
}

export function ChatPanel() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toggleChatPanel = useAppStore(s => s.toggleChatPanel);
  const activeDocId = useAppStore(s => s.activeDocumentId);
  const activeDocName = useAppStore(s => s.documents.find(d => d.id === s.activeDocumentId)?.fileName);
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
    return `Je bent de OpenAEC calculatieassistent in Open Calc Studio (begrotingsprogramma voor de Nederlandse bouw). Je werkt in het document dat nu open staat; de actuele inhoud staat in het gebruikersbericht.
${ACTIE_PROTOCOL}
Antwoord in het Nederlands, bondig en praktisch; bedragen excl. btw tenzij anders gevraagd.`;
  }, []);

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
    const apiKey = localStorage.getItem('ocs-anthropic-key') || '';

    // (1) OpenAEC-account
    if (OPENAEC_ENABLED && accountsUser) {
      const prompt = `${contextBlock}\n\n${historyText}\n\nAssistent:`;
      return (await accountsAiComplete(prompt, buildSystemPrompt())) || 'Geen antwoord ontvangen.';
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
      return data.content?.[0]?.text || 'Geen antwoord ontvangen.';
    }

    // (2) geen AI — lokaal antwoord uit de snapshot
    const total = chapters.reduce((s, c) => s + c.total, 0);
    const lower = text.toLowerCase();
    if (lower.includes('totaal') || lower.includes('kosten') || lower.includes('prijs')) {
      return `De totale kostprijs van deze begroting is **€${Math.round(total).toLocaleString('nl-NL')}** excl. BTW.\n\nVerdeling per hoofdstuk:\n${chapters.map(c => `- ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString('nl-NL')}`).join('\n')}`;
    }
    if (lower.includes('hoofdstuk') || lower.includes('overzicht')) {
      return `De begroting heeft **${chapters.length} hoofdstukken**:\n${chapters.map(c => `- ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString('nl-NL')}`).join('\n')}\n\n**Totaal: €${Math.round(total).toLocaleString('nl-NL')}**`;
    }
    if (lower.includes('duurste') || lower.includes('grootste')) {
      const sorted = [...chapters].sort((a, b) => b.total - a.total);
      return `De duurste hoofdstukken:\n${sorted.slice(0, 5).map((c, i) => `${i + 1}. ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString('nl-NL')} (${total ? Math.round(c.total / total * 100) : 0}%)`).join('\n')}`;
    }
    if (lower.includes('m2') || lower.includes('per vierkante meter') || lower.includes('bvo')) {
      return bvo && bvo > 0
        ? `Met een BVO van ${bvo} m² is de kostprijs **€${Math.round(total / bvo).toLocaleString('nl-NL')}/m²** excl. BTW.`
        : `Er is geen BVO ingesteld. Stel deze in via het eigenschappenpaneel om de kosten per m² te berekenen.`;
    }
    return `Ik kan je helpen met vragen over je begroting. Probeer bijvoorbeeld:\n- "Wat is het totaal?"\n- "Wat zijn de duurste hoofdstukken?"\n- "Hoeveel per m²?"\n\n💡 Voor de volledige AI-assistent: log in met OpenAEC of stel een Anthropic API-key in.`;
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
      let resultaten: string[] = [];
      if (acties.length) {
        if (useAppStore.getState().activeDocumentId === docId) {
          resultaten = applyActies(acties);
        } else {
          resultaten = ['⚠️ Wijzigingen niet automatisch toegepast — een ander document is nu actief. Schakel terug en stel de opdracht opnieuw.'];
        }
      }
      const inhoud = [cleanText || (resultaten.length ? '' : raw), resultaten.join('\n')].filter(Boolean).join('\n\n');
      updateChatMessage(docId, pendingId, { content: inhoud || 'Geen antwoord ontvangen.', status: 'done' });
    } catch (err: any) {
      updateChatMessage(docId, pendingId, { content: describeAiError(err), status: 'error' });
    }
  }, [input, activeDocId, buildContextBlock, computeAnswer, appendChatMessage, updateChatMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Simple markdown-like rendering
  const renderContent = (text: string) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-titles">
          <span className="chat-title">✨ OpenAEC calculatieassistent</span>
          <span className="chat-subtitle" title={activeDocName}>{activeDocName ? `werkt in: ${activeDocName}` : 'geen document geopend'}</span>
        </div>
        {OPENAEC_ENABLED && accountsUser && aiCredits != null && (
          <span
            className="chat-credits"
            title="Resterend AI-tegoed (tokens) van je OpenAEC-account"
          >
            {aiCredits.toLocaleString('nl-NL')} tokens
          </span>
        )}
        <button className="chat-close" onClick={toggleChatPanel}>✕</button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-message chat-assistant">
            <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: renderContent(WELCOME) }} />
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-${msg.role}`}>
            {msg.status === 'pending' ? (
              <div className="chat-bubble chat-typing">Denken…</div>
            ) : (
              <div
                className={`chat-bubble${msg.status === 'error' ? ' chat-error' : ''}`}
                dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
              />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {messages.length === 0 && (
        <div className="chat-chips">
          {[
            'Wat is het duurste hoofdstuk?',
            'Hoeveel uren zitten er in totaal in?',
            'Verhoog het aantal van de eerste regel met 10%',
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
          placeholder={pendingCount > 0 ? `Nog een vraag stellen kan (${pendingCount} lopend)…` : 'Vraag of opdracht voor deze begroting…'}
          rows={2}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={!input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
