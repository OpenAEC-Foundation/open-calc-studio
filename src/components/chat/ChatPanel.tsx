import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/state/appStore';
import { buildBudgetContext, ACTIE_PROTOCOL, parseActies, applyActies } from '@/services/assistant/assistantActions';
import { BEGROTEN_KENNIS } from '@/services/assistant/begrotenKennis';
import { OPENAEC_ENABLED } from '@/services/buildFlags';
import './ChatPanel.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hallo! Ik ben de **OpenAEC calculatieassistent** en ik kijk mee in de begroting die nu open staat. Stel een vraag ("wat is het duurste hoofdstuk?") of geef een opdracht ("verhoog de betonbakken naar 14 stuks", "voeg onder 21.01 een regel toe…") — wijzigingen voer ik direct in het document door, met ongedaan-maken als vangnet.', timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toggleChatPanel = useAppStore(s => s.toggleChatPanel);
  const activeDocName = useAppStore(s => s.documents.find(d => d.id === s.activeDocumentId)?.fileName);
  const accountsUser = useAppStore(s => s.accountsUser);
  const aiCredits = useAppStore(s => s.aiCredits);
  const accountsAiComplete = useAppStore(s => s.accountsAiComplete);
  const accountsLoadCredits = useAppStore(s => s.accountsLoadCredits);

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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Provider-volgorde: (1) OpenAEC-account (AI-credits), (2) eigen
      // Anthropic API-key, (3) lokale antwoorden zonder AI.
      const apiKey = localStorage.getItem('ocs-anthropic-key') || '';

      if (OPENAEC_ENABLED && accountsUser) {
        // Chatgeschiedenis platslaan tot één prompt — het platform-endpoint
        // (POST /me/ai/complete) accepteert prompt+system, geen message-array.
        const history = [...messages.slice(1), userMsg]
          .map(m => `${m.role === 'user' ? 'Gebruiker' : 'Assistent'}: ${m.content}`)
          .join('\n\n');
        try {
          // Context in het user-bericht (stdin), klein system als CLI-arg
          const prompt = `${buildContextBlock()}\n\n${history}\n\nAssistent:`;
          const answer = await accountsAiComplete(prompt, buildSystemPrompt());
          // Wijzigingsacties uit het antwoord halen en op het document uitvoeren
          const { acties, cleanText } = parseActies(answer || '');
          const resultaten = applyActies(acties);
          const inhoud = [cleanText || (resultaten.length ? '' : 'Geen antwoord ontvangen.'), resultaten.join('\n')]
            .filter(Boolean).join('\n\n');
          setMessages(prev => [...prev, { role: 'assistant', content: inhoud, timestamp: Date.now() }]);
        } catch (err: any) {
          setMessages(prev => [...prev, { role: 'assistant', content: describeAiError(err), timestamp: Date.now() }]);
        }
      } else if (!apiKey) {
        // No API key — give helpful response based on local context
        const store = useAppStore.getState();
        const items = store.items;
        const chapters = items.filter(i => i.rowType === 'chapter' && i.depth === 0);
        const total = chapters.reduce((s, c) => s + c.total, 0);

        let response = '';
        const lower = text.toLowerCase();

        if (lower.includes('totaal') || lower.includes('kosten') || lower.includes('prijs')) {
          response = `De totale kostprijs van deze begroting is **€${Math.round(total).toLocaleString('nl-NL')}** excl. BTW.\n\nVerdeling per hoofdstuk:\n${chapters.map(c => `- ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString('nl-NL')}`).join('\n')}`;
        } else if (lower.includes('hoofdstuk') || lower.includes('overzicht')) {
          response = `De begroting heeft **${chapters.length} hoofdstukken**:\n${chapters.map(c => `- ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString('nl-NL')}`).join('\n')}\n\n**Totaal: €${Math.round(total).toLocaleString('nl-NL')}**`;
        } else if (lower.includes('duurste') || lower.includes('grootste')) {
          const sorted = [...chapters].sort((a, b) => b.total - a.total);
          response = `De duurste hoofdstukken:\n${sorted.slice(0, 5).map((c, i) => `${i + 1}. ${c.code} ${c.description}: €${Math.round(c.total).toLocaleString('nl-NL')} (${Math.round(c.total / total * 100)}%)`).join('\n')}`;
        } else if (lower.includes('m2') || lower.includes('per vierkante meter') || lower.includes('bvo')) {
          const bvo = store.schedule?.projectProperties?.find((p: any) => p.name === 'BVO')?.value;
          if (bvo && bvo > 0) {
            response = `Met een BVO van ${bvo} m² is de kostprijs **€${Math.round(total / bvo).toLocaleString('nl-NL')}/m²** excl. BTW.`;
          } else {
            response = `Er is geen BVO (bruto vloeroppervlakte) ingesteld. Stel deze in via het Properties panel om de kosten per m² te berekenen.`;
          }
        } else if (lower.includes('api') || lower.includes('sleutel') || lower.includes('key')) {
          response = `Om de volledige AI-assistent te gebruiken, stel een Anthropic API key in via:\n\n**Instellingen → API Key**\n\nOf sla op in localStorage: \`localStorage.setItem('ocs-anthropic-key', 'sk-ant-...')\``;
        } else {
          response = `Ik kan je helpen met vragen over je begroting. Probeer bijvoorbeeld:\n- "Wat is het totaal?"\n- "Wat zijn de duurste hoofdstukken?"\n- "Hoeveel per m²?"\n- "Geef een overzicht"\n\n💡 Voor geavanceerde AI-functies: stel een Anthropic API key in.`;
        }

        setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
      } else {
        // Call Anthropic API
        const chatHistory = messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0).map(m => ({
          role: m.role,
          content: m.content,
        }));
        chatHistory.push({ role: 'user', content: text });

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
            // Directe API kent geen CLI-limiet → context mag hier in het system
            system: `${buildSystemPrompt()}\n\n${buildContextBlock()}`,
            messages: chatHistory,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = await res.json();
        const assistantText = data.content?.[0]?.text || 'Geen antwoord ontvangen.';
        const { acties, cleanText } = parseActies(assistantText);
        const resultaten = applyActies(acties);
        const inhoud = [cleanText || (resultaten.length ? '' : assistantText), resultaten.join('\n')]
          .filter(Boolean).join('\n\n');
        setMessages(prev => [...prev, { role: 'assistant', content: inhoud, timestamp: Date.now() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Fout: ${err.message}. Controleer je API key.`,
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, buildSystemPrompt, buildContextBlock, accountsUser, accountsAiComplete]);

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
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-${msg.role}`}>
            <div
              className="chat-bubble"
              dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
            />
          </div>
        ))}
        {loading && (
          <div className="chat-message chat-assistant">
            <div className="chat-bubble chat-typing">Denken...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {messages.length <= 1 && !loading && (
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
          placeholder="Vraag of opdracht voor deze begroting…"
          rows={2}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
