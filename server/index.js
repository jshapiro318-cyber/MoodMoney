import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Explicitly point to this file's directory so dotenv always finds .env
// regardless of what directory the process was launched from
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import plaidRoutes from './routes/plaid.js';
import transactionRoutes from './routes/transactions.js';
import userRoutes from './routes/users.js';
import gamificationRoutes from './routes/gamification.js';
import savingsRoutes from './routes/savings.js';
import stocksRoutes from './routes/stocks.js';
import learnRoutes from './routes/learn.js';
import tradingRoutes from './routes/trading.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Railway's proxy so rate-limiting and IP detection work correctly
app.set('trust proxy', 1);

// Log crashes instead of silently dying
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

// Security headers
app.use(helmet());

// CORS — allow the React dev server and production Vercel domain
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL,
  'https://mood-money-jet.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server (no origin) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: ${origin} not allowed`));
    }
  },
  credentials: true,
}));

// Request logging in development
app.use(morgan('dev'));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' })); // 10mb for screenshot uploads

// Global rate limiter — 100 req/15min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please slow down.' },
}));

// Tighter rate limit for AI endpoints (they're expensive)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI rate limit reached. Please wait a moment.' },
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/plaid', plaidRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/learn', learnRoutes);
app.use('/api/trading', tradingRoutes);

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MoodMoney server running on port ${PORT}`);
});
