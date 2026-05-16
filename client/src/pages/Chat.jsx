import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import ChatBubble from '../components/ChatBubble.jsx';

const SUGGESTED_PROMPTS = [
  "Why do I keep overspending?",
  "Can I afford a vacation this year?",
  "What's my worst spending habit?",
  "How do I stop impulse buying?",
  "Roast my spending this month 🔥",
];

export default function Chat() {
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Pre-fill prompt if navigated from an insight card
  useEffect(() => {
    if (location.state?.prompt) {
      setInput(location.state.prompt);
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text) {
    const content = text || input.trim();
    if (!content || loading) return;

    setInput('');
    const userMessage = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      const { message } = await api.chat(newMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
      api.awardXP('chat_session').catch(() => {});
    } catch (err) {
      if (err.data?.error === 'monthly_limit_reached') {
        setLimitReached(true);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: err.data.message,
          isPaywall: true,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "Sorry, I hit a snag. Try again in a sec.",
          isError: true,
        }]);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-screen bg-surface-900 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-surface-600">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-xl">
          🤖
        </div>
        <div>
          <h1 className="font-bold text-base">MoodMoney AI</h1>
          <p className="text-xs text-green-400">Your money therapist</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3 mt-4"
          >
            <p className="text-center text-surface-500 text-sm mb-2">
              Ask me anything about your money 💬
            </p>
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="glass-card text-left text-sm text-white/80 active:border-brand-500"
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 mb-4 ml-2"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-sm flex-shrink-0">
              🤖
            </div>
            <div className="glass-card py-3 px-4">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full bg-surface-500"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-surface-600 pb-24">
        {limitReached ? (
          <div className="glass-card text-center py-4 border border-brand-500/30">
            <p className="text-sm mb-3">Upgrade to Premium for unlimited coaching</p>
            <button className="btn-primary py-3 text-sm max-w-[200px] mx-auto">
              Upgrade — $9.99/mo
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              rows={1}
              className="flex-1 bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-white placeholder-surface-500 outline-none focus:border-brand-500 transition-colors resize-none text-sm"
              style={{ maxHeight: '100px', overflowY: 'auto' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="w-11 h-11 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2}>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
