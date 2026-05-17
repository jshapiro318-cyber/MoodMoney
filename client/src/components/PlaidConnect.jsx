import { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { motion } from 'framer-motion';
import { api } from '../lib/api.js';

export default function PlaidConnect({ onSuccess, bankConnected, institutionName }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: async (public_token, metadata) => {
      setSyncing(true);
      setError('');
      try {
        await api.exchangeToken(public_token, metadata.institution);
        await api.getTransactions(60);
        onSuccess?.();
      } catch (err) {
        setError('Failed to link bank. Try again.');
      } finally {
        setSyncing(false);
        setLinkToken(null);
      }
    },
    onExit: () => {
      setLinkToken(null);
      setLoading(false);
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready]);

  async function connect() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getLinkToken();
      if (data.demo) {
        await api.exchangeToken('demo', null);
        onSuccess?.();
        setLoading(false);
      } else {
        setLinkToken(data.link_token);
      }
    } catch (err) {
      setError('Could not connect. Try again.');
      setLoading(false);
    }
  }

  if (bankConnected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="glass-card flex items-center gap-3 border border-green-500/20">
        <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center text-xl">🏦</div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{institutionName || 'Bank'} Connected</p>
          <p className="text-xs text-surface-500">Real transactions syncing</p>
        </div>
        <span className="text-green-400 text-xs font-medium">● Live</span>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="glass-card border border-brand-500/30 border-dashed">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-brand-500/15 flex items-center justify-center text-xl">🏦</div>
        <div>
          <p className="font-semibold text-sm">Connect Real Bank</p>
          <p className="text-xs text-surface-500">Unlock real insights from actual spending</p>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
      <button onClick={connect} disabled={loading || syncing}
        className="btn-primary text-sm py-2.5 w-full">
        {syncing ? 'Syncing transactions...' : loading ? 'Opening...' : 'Connect bank account →'}
      </button>
      <p className="text-xs text-surface-500 text-center mt-2">
        Secured by Plaid · 256-bit encryption
      </p>
    </motion.div>
  );
}
