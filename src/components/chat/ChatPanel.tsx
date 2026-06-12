import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/state/appStore';
import './ChatPanel.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hallo! Ik ben je begroting-assistent. Stel me een vraag over je begroting, of geef me een opdracht zoals "voeg een hoofdstuk Funderingen toe".', timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toggleChatPanel = useAppStore(s => s.toggleChatPanel);
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

  const buildSystemPrompt = useCallback(() => {
    const store = useAppStore.getState();
    const schedule = store.schedule;
    const items = store.items;
    const chapters = items.filter(i => i.rowType === 'chapter' && i.depth === 0);
    const staartItems = items.filter(i => i.rowType.startsWith('staart_'));

    return `Je bent een bouwkosten-assistent geïntegreerd in Open Calc Studio, een begrotingsprogramma voor de Nederlandse bouw.

Huidige begroting:
- Project: ${schedule?.projectName || '(geen)'}
- Nummer: ${schedule?.projectNumber || '(geen)'}
- Opdrachtgever: ${schedule?.client || '(geen)'}
- Aantal items: ${items.length}
- Hoofdstukken: ${chapters.map(c => `${c.code} ${c.description} (€${Math.round(c.total)})`).join(', ') || '(geen)'}
- Kostprijs: €${Math.round(chapters.reduce((s, c) => s + c.total, 0))}
- Staartkosten: ${staartItems.map(s => `${s.description} ${s.staartPercentage ?? ''}%`).join(', ') || '(geen)'}

Je kunt de gebruiker helpen met:
- Vragen over de begroting beantwoorden
- Uitleg geven over posten en berekeningen
- Advies over prijzen en hoeveelheden
- Tips voor kostenoptimalisatie

Antwoord altijd in het Nederlands. Wees bondig en praktisch.`;
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

      if (accountsUser) {
        // Chatgeschiedenis platslaan tot één prompt — het platform-endpoint
        // (POST /me/ai/complete) accepteert prompt+system, geen message-array.
        const history = [...messages.slice(1), userMsg]
          .map(m => `${m.role === 'user' ? 'Gebruiker' : 'Assistent'}: ${m.content}`)
          .join('\n\n');
        try {
          const answer = await accountsAiComplete(`${history}\n\nAssistent:`, buildSystemPrompt());
          setMessages(prev => [...prev, { role: 'assistant', content: answer || 'Geen antwoord ontvangen.', timestamp: Date.now() }]);
        } catch (err: any) {
          const msg = String(err);
          const friendly = msg.includes('402') || /insufficient credits/i.test(msg)
            ? 'Je OpenAEC AI-tegoed is op. Koop credits bij in de OpenAEC-portal en probeer het opnieuw.'
            : `AI-aanroep via OpenAEC mislukt: ${msg}`;
          setMessages(prev => [...prev, { role: 'assistant', content: friendly, timestamp: Date.now() }]);
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
            system: buildSystemPrompt(),
            messages: chatHistory,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = await res.json();
        const assistantText = data.content?.[0]?.text || 'Geen antwoord ontvangen.';
        setMessages(prev => [...prev, { role: 'assistant', content: assistantText, timestamp: Date.now() }]);
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
  }, [input, loading, messages, buildSystemPrompt, accountsUser, accountsAiComplete]);

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
        <span className="chat-title">💬 Assistent</span>
        {accountsUser && aiCredits != null && (
          <span
            className="chat-credits"
            title="Resterend AI-tegoed van je OpenAEC-account"
            style={{ marginLeft: 'auto', marginRight: 8, fontSize: 11, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}
          >
            ✨ {aiCredits.toLocaleString('nl-NL')} credits
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
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Stel een vraag over je begroting..."
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
