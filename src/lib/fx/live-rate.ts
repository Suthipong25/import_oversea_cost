import Decimal from 'decimal.js';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRates } from '@/lib/db/schema';

export interface LiveFxSnapshot {
  rate: number;
  rateFixed: string;
  source: 'Yahoo Finance' | 'ExchangeRate-API' | 'Frankfurter' | 'Database' | 'Fallback';
  isLive: boolean;
  updatedAt: string;
}

const CACHE_TTL_MS = 60_000; // 60 seconds real-time cache
const FETCH_TIMEOUT_MS = 4_000;

let cachedSnapshot: { data: LiveFxSnapshot; expiresAt: number } | null = null;
let inflightPromise: Promise<LiveFxSnapshot> | null = null;

function isSaneUsdThb(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 15 && val <= 80;
}

async function fetchYahooUsdThb(): Promise<LiveFxSnapshot | null> {
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/THB=X?interval=1m&range=1d',
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; regularMarketTime?: number };
        }>;
      };
    };
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!isSaneUsdThb(price)) return null;

    const updatedAt = meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();

    return {
      rate: Number(new Decimal(price).toFixed(4)),
      rateFixed: new Decimal(price).toFixed(4),
      source: 'Yahoo Finance',
      isLive: true,
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function fetchOpenErApiUsdThb(): Promise<LiveFxSnapshot | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      rates?: { THB?: number };
      time_last_update_unix?: number;
    };
    const rate = json.rates?.THB;
    if (!isSaneUsdThb(rate)) return null;

    const updatedAt = json.time_last_update_unix
      ? new Date(json.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString();

    return {
      rate: Number(new Decimal(rate).toFixed(4)),
      rateFixed: new Decimal(rate).toFixed(4),
      source: 'ExchangeRate-API',
      isLive: true,
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function fetchFrankfurterUsdThb(): Promise<LiveFxSnapshot | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=THB', {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { THB?: number }; date?: string };
    const rate = json.rates?.THB;
    if (!isSaneUsdThb(rate)) return null;

    return {
      rate: Number(new Decimal(rate).toFixed(4)),
      rateFixed: new Decimal(rate).toFixed(4),
      source: 'Frankfurter',
      isLive: true,
      updatedAt: json.date ? new Date(json.date).toISOString() : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function persistLiveRateToDb(snapshot: LiveFxSnapshot): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(exchangeRates)
      .values({
        fromCurrency: 'USD',
        toCurrency: 'THB',
        rate: snapshot.rateFixed,
        source: snapshot.source,
        effectiveDate: today,
      })
      .onConflictDoUpdate({
        target: [
          exchangeRates.fromCurrency,
          exchangeRates.toCurrency,
          exchangeRates.effectiveDate,
          exchangeRates.source,
        ],
        set: {
          rate: snapshot.rateFixed,
          createdAt: new Date(),
        },
      });
  } catch {
    // Non-critical persistence failure; live rate still returned
  }
}

async function readFallbackRateFromDb(): Promise<LiveFxSnapshot> {
  try {
    const rows = await db
      .select({
        rate: exchangeRates.rate,
        createdAt: exchangeRates.createdAt,
      })
      .from(exchangeRates)
      .where(and(eq(exchangeRates.fromCurrency, 'USD'), eq(exchangeRates.toCurrency, 'THB')))
      .orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.createdAt))
      .limit(1);

    const dbRate = Number(rows[0]?.rate);
    if (isSaneUsdThb(dbRate)) {
      return {
        rate: dbRate,
        rateFixed: new Decimal(dbRate).toFixed(4),
        source: 'Database',
        isLive: false,
        updatedAt: (rows[0]?.createdAt ?? new Date()).toISOString(),
      };
    }
  } catch {
    // Fall through to safe default
  }

  return {
    rate: 33,
    rateFixed: '33.0000',
    source: 'Fallback',
    isLive: false,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchFreshSnapshot(): Promise<LiveFxSnapshot> {
  const live =
    (await fetchYahooUsdThb()) ??
    (await fetchOpenErApiUsdThb()) ??
    (await fetchFrankfurterUsdThb());

  if (live) {
    void persistLiveRateToDb(live);
    return live;
  }

  return readFallbackRateFromDb();
}

/**
 * ดึงอัตราแลกเปลี่ยน USD -> THB แบบ Real-time พร้อมแคชในหน่วยความจำ 60 วินาที
 * และรวมคำขอที่เข้ามาพร้อมกัน (inflightPromise) เพื่อไม่ให้ยิง API ภายนอกซ้ำซ้อน
 *
 * ลำดับ Fallback อัตโนมัติ (Timeout แหล่งละ 4 วินาที, กรองค่าผิดปกติให้อยู่ในช่วง 15–80 บาท):
 *   1) Yahoo Finance (THB=X รายนาที — Real-time)
 *   2) ExchangeRate-API (open.er-api.com)
 *   3) Frankfurter (ECB)
 *   4) PostgreSQL (exchange_rates ล่าสุดที่เคยบันทึกไว้) -> ค่าสำรอง 33.0000
 */
export async function getLiveUsdToThbRate(options?: {
  forceRefresh?: boolean;
}): Promise<LiveFxSnapshot> {
  const now = Date.now();
  if (!options?.forceRefresh && cachedSnapshot && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.data;
  }

  if (!options?.forceRefresh && inflightPromise) {
    return inflightPromise;
  }

  const promise = fetchFreshSnapshot()
    .then((data) => {
      cachedSnapshot = {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      return data;
    })
    .finally(() => {
      inflightPromise = null;
    });

  inflightPromise = promise;
  return promise;
}
