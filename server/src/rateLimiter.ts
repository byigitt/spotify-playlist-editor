// Rate Limiter ve Retry Logic for Spotify API
import dotenv from 'dotenv';
dotenv.config();

const isDev = process.env.DEV_MODE === 'true';
if (isDev) console.log('⚡ Dev mode: Rate limiting disabled');

interface QueuedRequest {
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retries: number;
}

class SpotifyRateLimiter {
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private minRequestInterval = isDev ? 0 : 100; // Dev'de bekleme yok
  private retryAfter = 0;
  private maxRetries = 3;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Dev modunda direkt çalıştır, queue kullanma
    if (isDev) {
      return fn();
    }
    
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, retries: 0 });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Rate limit beklemesi
      if (this.retryAfter > Date.now()) {
        const waitTime = this.retryAfter - Date.now();
        console.log(`⏳ Rate limited, waiting ${waitTime}ms...`);
        await this.sleep(waitTime);
      }

      // Minimum interval beklemesi
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.minRequestInterval) {
        await this.sleep(this.minRequestInterval - timeSinceLastRequest);
      }

      const request = this.queue.shift()!;
      
      try {
        this.lastRequestTime = Date.now();
        const result = await request.fn();
        request.resolve(result);
      } catch (error: any) {
        // 429 Rate Limited
        if (error?.statusCode === 429 || error?.body?.error?.status === 429) {
          const retryAfterSecs = error?.headers?.['retry-after'] || 5;
          this.retryAfter = Date.now() + (retryAfterSecs * 1000);
          console.warn(`🚫 Rate limited! Retry after ${retryAfterSecs}s`);
          
          // Retry ekle
          if (request.retries < this.maxRetries) {
            request.retries++;
            this.queue.unshift(request); // Başa ekle
          } else {
            request.reject(new Error('Rate limit exceeded, max retries reached'));
          }
        } else {
          request.reject(error);
        }
      }
    }

    this.isProcessing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const rateLimiter = new SpotifyRateLimiter();

// Simple in-memory cache
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 60000; // 1 minute

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set<T>(key: string, data: T, ttl = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  // Pattern ile silme (örn: playlist:* gibi)
  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new SimpleCache();
