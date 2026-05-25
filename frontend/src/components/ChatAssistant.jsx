import { useEffect, useRef, useState } from 'react';
import api from '../api';

const SUGGESTIONS = [
  'Summarise issues with my team this month',
  'Who is on the watchlist and why?',
  'Which staff have complaints in the last 90 days?',
  'Who is overdue for a QC check?',
  'Who is in active coaching right now?',
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput('');
    setError('');

    const newMessages = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const r = await api.post('/chat', { messages: newMessages });
      setMessages(m => [...m, { role: 'assistant', content: r.data.reply }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to get a response.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clear = () => { setMessages([]); setError(''); };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 52, height: 52, borderRadius: '50%',
          background: open ? 'var(--navy2)' : 'var(--cyan)',
          border: open ? '2px solid var(--glass-border)' : 'none',
          color: open ? 'var(--t2)' : '#000',
          fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          transition: 'all 0.2s',
        }}
        title="AI Assistant"
      >
        {open ? '✕' : '✦'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 999,
          width: 'min(420px, calc(100vw - 32px))',
          height: 'min(560px, calc(100vh - 120px))',
          background: 'var(--card)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--glass)',
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--cyan)' }}>✦ LCA Assistant</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>Ask me about your team, scores, complaints & more</div>
            </div>
            {messages.length > 0 && (
              <button onClick={clear} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', fontSize: 12, cursor: 'pointer', padding: '4px 8px' }}>
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
            {messages.length === 0 && (
              <div>
                <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 14 }}>
                  Ask me anything about your team's performance, complaints, or coaching. Try:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => send(s)} style={{
                      background: 'var(--glass)', border: '1px solid var(--glass-border)',
                      borderRadius: 8, padding: '8px 12px', textAlign: 'left',
                      color: 'var(--t2)', fontSize: 13, cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--cyan)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '88%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'var(--cyan)' : 'var(--glass)',
                  color: m.role === 'user' ? '#000' : 'var(--t1)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: m.role === 'assistant' ? '1px solid var(--glass-border)' : 'none',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                <div style={{
                  padding: '10px 16px', borderRadius: '14px 14px 14px 4px',
                  background: 'var(--glass)', border: '1px solid var(--glass-border)',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--cyan)', opacity: 0.7,
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: 'var(--red)', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your team…"
              rows={1}
              style={{
                flex: 1, resize: 'none', minHeight: 38, maxHeight: 100,
                background: 'var(--glass)', border: '1px solid var(--glass-border)',
                borderRadius: 10, color: 'var(--t1)', fontSize: 13,
                padding: '8px 12px', outline: 'none', fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: input.trim() && !loading ? 'var(--cyan)' : 'var(--glass)',
                border: '1px solid var(--glass-border)',
                color: input.trim() && !loading ? '#000' : 'var(--t3)',
                fontSize: 16, cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(0.7); opacity: 0.4; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
