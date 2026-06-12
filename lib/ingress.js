/**
 * Controls when inbound WhatsApp messages are accepted (filters historical sync replays).
 */
export function createIngressController(options = {}) {
  const defaultSlackSec = options.defaultSlackSec ?? 120;
  const defaultMaxAgeSec = options.defaultMaxAgeSec ?? 600;

  let acceptInboundMessages = false;
  let ingestSinceUnix = 0;

  function messageUnixTimestamp(message) {
    const t = message?.timestamp;
    if (typeof t === 'number') return t;
    if (t && typeof t === 'object' && typeof t.seconds === 'number') return t.seconds;
    return null;
  }

  function historicalSkipReason(message) {
    if (ingestSinceUnix <= 0) return null;

    const msgTs = messageUnixTimestamp(message);
    if (typeof msgTs !== 'number') return null;
    if (msgTs >= ingestSinceUnix) return null;

    const nowUnix = Math.floor(Date.now() / 1000);
    const wallClockAgeSec = nowUnix - msgTs;
    const maxAge = Number.parseInt(process.env.MESSAGE_MAX_AGE_SEC || String(defaultMaxAgeSec), 10);
    const maxAgeSec = Number.isFinite(maxAge) && maxAge > 0 ? maxAge : defaultMaxAgeSec;

    if (wallClockAgeSec >= 0 && wallClockAgeSec <= maxAgeSec) {
      console.log(
        `[ingress] Accept wall-clock recent message (${wallClockAgeSec}s old, msgTs=${msgTs} < ingestSince=${ingestSinceUnix})`,
      );
      return null;
    }

    return 'historical';
  }

  function activate(source) {
    if (process.env.SKIP_HISTORICAL_MESSAGE_FILTER === 'true') {
      ingestSinceUnix = 0;
      acceptInboundMessages = true;
      console.warn('[ingress] SKIP_HISTORICAL_MESSAGE_FILTER=true — replayed/old messages may be processed.');
      return;
    }

    const slack = Number.parseInt(process.env.MESSAGE_INGEST_SLACK_SEC || String(defaultSlackSec), 10);
    const s = Number.isFinite(slack) && slack >= 0 ? slack : defaultSlackSec;
    ingestSinceUnix = Math.floor(Date.now() / 1000) - s;
    acceptInboundMessages = true;
    console.log(
      `[ingress] Accepting inbound (${source}); skipping messages older than unix ts ${ingestSinceUnix} (${s}s slack)`,
    );
  }

  function deactivate(reason) {
    acceptInboundMessages = false;
    ingestSinceUnix = 0;
    console.log(`[ingress] Inbound paused (${reason}).`);
  }

  function shouldSkip(message) {
    if (!acceptInboundMessages) return 'not_ready';
    return historicalSkipReason(message);
  }

  return {
    get acceptInboundMessages() {
      return acceptInboundMessages;
    },
    get ingestSinceUnix() {
      return ingestSinceUnix;
    },
    messageUnixTimestamp,
    activate,
    deactivate,
    shouldSkip,
  };
}
