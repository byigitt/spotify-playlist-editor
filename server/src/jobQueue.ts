/**
 * Simple Background Job Queue
 * 
 * Uzun süren işlemleri arka planda çalıştırır.
 * Client polling ile durumu takip eder.
 */

export interface Job {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  result?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

class JobQueue {
  private jobs = new Map<string, Job>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Her 5 dakikada bir eski job'ları temizle
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  create(): Job {
    const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const job: Job = {
      id,
      status: 'pending',
      progress: 0,
      message: 'İşlem başlatılıyor...',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string): Job | null {
    return this.jobs.get(id) || null;
  }

  update(id: string, updates: Partial<Job>) {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates, { updatedAt: Date.now() });
    }
  }

  delete(id: string) {
    this.jobs.delete(id);
  }

  private cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 dakika
    
    for (const [id, job] of this.jobs) {
      if (now - job.updatedAt > maxAge) {
        this.jobs.delete(id);
      }
    }
  }
}

export const jobQueue = new JobQueue();
