import fetch from 'node-fetch';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Delivers normalized messages to an external webhook with in-memory + file-backed queue and retries.
 */
export class WebhookDelivery {
  constructor(config, options = {}) {
    this.config = config;
    this.dataDir = options.dataDir || join(process.cwd(), '.data');
    this.queueFile = join(this.dataDir, 'webhook-queue.json');
    this.queue = [];
    this.retryTimer = null;
    this.retryIntervalMs = Number.parseInt(process.env.WEBHOOK_RETRY_INTERVAL_MS || '30000', 10);
    this.maxRetries = Number.parseInt(process.env.WEBHOOK_MAX_RETRIES || '10', 10);
    this.timeoutMs = Number.parseInt(process.env.WEBHOOK_TIMEOUT_MS || '20000', 10);

    this._loadQueue();
    this._startRetryWorker();
  }

  _loadQueue() {
    try {
      if (existsSync(this.queueFile)) {
        const parsed = JSON.parse(readFileSync(this.queueFile, 'utf-8'));
        if (Array.isArray(parsed)) this.queue = parsed;
      }
    } catch (error) {
      console.warn('[webhook] Could not load queue file:', error.message);
      this.queue = [];
    }
  }

  _persistQueue() {
    try {
      if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(this.queueFile, JSON.stringify(this.queue, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[webhook] Could not persist queue:', error.message);
    }
  }

  _startRetryWorker() {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      void this.flushQueue();
    }, this.retryIntervalMs);
    this.retryTimer.unref?.();
  }

  get queuedCount() {
    return this.queue.length;
  }

  drainQueue() {
    const messages = [...this.queue];
    this.queue = [];
    this._persistQueue();
    return messages;
  }

  setWebhookUrl(url) {
    this.config.api.webhookUrl = url;
  }

  _buildDeliveryUrls() {
    const primary = (this.config.api.webhookUrl || '').trim();
    if (!primary) return [];

    const backendPort = process.env.BACKEND_PORT || '3000';
    const loopbackUrl = `http://127.0.0.1:${backendPort}/whatsapp/webhook`;
    const urls = [primary];

    const looksLikeDevPublicHttps =
      /^https:\/\//i.test(primary) &&
      !/127\.0\.0\.1|localhost/i.test(primary) &&
      /\.(duckdns\.org|ngrok-free\.(app|dev)|ngrok\.io)\b/i.test(primary);

    const allowInternalFallback =
      process.env.WEBHOOK_INTERNAL_FALLBACK === 'true' || looksLikeDevPublicHttps;

    if (
      allowInternalFallback &&
      !primary.includes('127.0.0.1') &&
      !primary.includes('localhost') &&
      !urls.includes(loopbackUrl)
    ) {
      urls.push(loopbackUrl);
    }

    return urls;
  }

  _buildHeaders(payload) {
    const headers = { 'Content-Type': 'application/json' };
    const secret = (process.env.WEBHOOK_SECRET || '').trim();
    if (secret) {
      headers['X-Webhook-Secret'] = secret;
    }
    const apiKey = (this.config.api?.apiKey || '').trim();
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    headers['X-WhatsApp-Service-Event'] = 'message.received';
    headers['X-Message-Id'] = payload.id || '';
    return headers;
  }

  async _postToUrl(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: this._buildHeaders(payload),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return response;
  }

  _enqueue(messageData, reason) {
    const entry = {
      ...messageData,
      _queuedAt: Date.now(),
      _attempts: messageData._attempts || 0,
      _lastError: reason || null,
    };
    this.queue.push(entry);
    this._persistQueue();
  }

  async deliver(messageData) {
    const urls = this._buildDeliveryUrls();
    if (urls.length === 0) {
      console.warn('[webhook] WEBHOOK_URL is empty — message queued for polling at GET /api/webhook');
      this._enqueue(messageData, 'no_webhook_url');
      return { delivered: false, queued: true };
    }

    const payload = { ...messageData };
    delete payload._attempts;
    delete payload._queuedAt;
    delete payload._lastError;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        console.log(`📤 Forwarding message to webhook: ${url}`);
        const response = await this._postToUrl(url, payload);

        if (response.ok) {
          console.log(i > 0 ? `✅ Message forwarded via fallback webhook (${url})` : '✅ Message forwarded to webhook successfully');
          return { delivered: true, queued: false, url };
        }

        const errorText = await response.text().catch(() => 'No error details');
        console.error(`❌ Webhook returned status ${response.status} from ${url}: ${errorText.substring(0, 200)}`);

        if (i === urls.length - 1) {
          this._enqueue(messageData, `HTTP ${response.status}`);
          return { delivered: false, queued: true };
        }
      } catch (error) {
        console.error(`❌ Failed to forward to webhook (${url}): ${error.message}`);
        if (i === urls.length - 1) {
          this._enqueue(messageData, error.message);
          return { delivered: false, queued: true };
        }
      }
    }

    return { delivered: false, queued: true };
  }

  async flushQueue() {
    if (this.queue.length === 0) return;

    const pending = [...this.queue];
    this.queue = [];
    this._persistQueue();

    for (const item of pending) {
      const attempts = (item._attempts || 0) + 1;
      if (attempts > this.maxRetries) {
        console.error(`[webhook] Dropping message ${item.id} after ${this.maxRetries} retries`);
        continue;
      }

      const { _queuedAt, _lastError, _attempts, ...messageData } = item;
      const result = await this.deliver({ ...messageData, _attempts: attempts });

      if (!result.delivered && result.queued) {
        const requeued = this.queue[this.queue.length - 1];
        if (requeued) requeued._attempts = attempts;
      }
    }
  }

  stop() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
