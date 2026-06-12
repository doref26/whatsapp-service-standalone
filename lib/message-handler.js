import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  resolveSender,
  shouldProcessChat,
  buildMessagePayload,
  downloadMessageMedia,
} from './message-utils.js';

/**
 * Process a single inbound WhatsApp message: transcribe voice, normalize payload, deliver to webhook.
 */
export async function processIncomingMessage(message, deps) {
  const {
    config,
    ingress,
    webhookDelivery,
    transcriptionService,
    sendMessageToChat,
    onAutoReply,
  } = deps;

  if (message.fromMe) return { handled: false, reason: 'from_me' };

  const skipReason = ingress.shouldSkip(message);
  if (skipReason === 'not_ready') {
    console.log(`[ingress] Skip — session not ready yet (id=${message.id?._serialized || 'n/a'})`);
    return { handled: false, reason: 'not_ready' };
  }
  if (skipReason === 'historical') {
    const msgTs = ingress.messageUnixTimestamp(message);
    const nowUnix = Math.floor(Date.now() / 1000);
    console.log(
      `[ingress] Skip historical/sync replay (msgTs=${msgTs} < ingestSince=${ingress.ingestSinceUnix}, age=${nowUnix - (msgTs || 0)}s)`,
    );
    return { handled: false, reason: 'historical' };
  }

  const chat = await message.getChat();
  if (!chat?.id?._serialized) {
    console.error('❌ Chat ID is missing');
    return { handled: false, reason: 'invalid_chat' };
  }

  if (!shouldProcessChat(chat, config)) {
    console.log(`[filter] Skipping chat "${chat.name}" — not in allowed targets`);
    return { handled: false, reason: 'chat_filtered' };
  }

  const { senderId, senderName } = await resolveSender(message);
  const chatType = chat.isGroup ? 'Group' : 'Chat';
  const chatName = chat.name || 'Unknown';
  const includeMediaBase64 = config.webhook?.includeMediaBase64 !== false;

  let messageBody = message.body?.trim() || '';
  let messageType = 'text';
  let mediaAttachment = null;

  // Image / sticker
  if (message.hasMedia && (message.type === 'image' || message.type === 'sticker')) {
    console.log(`🖼️ [${chatType}: ${chatName}] ${senderName}: [Image Message]`);
    const caption = message.body || '';
    if (caption) console.log(`   Caption: "${caption}"`);

    try {
      const { media } = await downloadMessageMedia(message, { includeBase64: includeMediaBase64 });
      mediaAttachment = media;
    } catch (error) {
      console.warn('[media] Could not download image:', error.message);
    }

    const payload = buildMessagePayload({
      message,
      chat,
      senderId,
      senderName,
      body: caption,
      type: 'image',
      media: mediaAttachment,
    });

    await webhookDelivery.deliver(payload);
    return { handled: true, type: 'image', payload };
  }

  // Voice note (ptt)
  if (message.hasMedia && message.type === 'ptt') {
    console.log(`🎤 [${chatType}: ${chatName}] ${senderName}: [Voice Message]`);

    try {
      const { downloaded } = await downloadMessageMedia(message, { includeBase64: false });
      if (!downloaded?.data) throw new Error('Empty voice media');

      const tempPath = join(tmpdir(), `whatsapp-audio-${Date.now()}.ogg`);
      writeFileSync(tempPath, Buffer.from(downloaded.data, 'base64'));

      const transcription = await transcriptionService.transcribe(tempPath);
      unlinkSync(tempPath);

      if (!transcription) {
        try {
          await sendMessageToChat(
            chat.id._serialized,
            transcriptionService.getTranscriptionUnavailableMessage(),
          );
        } catch (sendError) {
          console.error('❌ Failed to send transcription unavailable message:', sendError.message);
        }
        return { handled: true, type: 'voice', reason: 'transcription_failed' };
      }

      messageBody = transcription;
      messageType = 'voice';
      message._transcriptionMeta = {
        provider: transcriptionService.getProviderName?.() || 'whisper',
        language: config.whisper.language || 'auto',
      };
      console.log(`📝 Transcribed: "${transcription}"`);
    } catch (error) {
      console.error('❌ Voice message error:', error.message);
      try {
        await sendMessageToChat(
          chat.id._serialized,
          '⚠️ Sorry, I had trouble processing that voice message. Please try sending text instead.',
        );
      } catch (sendError) {
        console.error('❌ Failed to send error message:', sendError.message);
      }
      return { handled: true, type: 'voice', reason: 'voice_error' };
    }
  } else if (messageBody) {
    console.log(`📩 [${chatType}: ${chatName}] ${senderName}: ${messageBody}`);
  }

  // Document / video / audio file — forward metadata + optional caption
  if (
    message.hasMedia &&
    !['ptt', 'image', 'sticker'].includes(message.type) &&
    !messageBody
  ) {
    messageBody = message.body?.trim() || `[${message.type} message]`;
    messageType = message.type || 'media';
    console.log(`📎 [${chatType}: ${chatName}] ${senderName}: [${message.type}]`);
  }

  const payload = buildMessagePayload({
    message,
    chat,
    senderId,
    senderName,
    body: messageBody,
    type: messageType,
    media: mediaAttachment,
  });

  await webhookDelivery.deliver(payload);

  if (onAutoReply) {
    await onAutoReply({ message, chat, senderId, senderName, messageBody, payload });
  }

  return { handled: true, type: messageType, payload };
}

/**
 * Attach deduplicated message handler to a wwebjs client.
 */
export function attachMessageHandler(client, deps) {
  client.removeAllListeners('message');

  const recentlyHandledMessages = new Set();

  client.on('message', async (message) => {
    let messageKey = null;
    try {
      messageKey = message.id?._serialized;
      if (messageKey && recentlyHandledMessages.has(messageKey)) {
        console.log(`⏭️ Skip duplicate wwebjs event for id=${messageKey}`);
        return;
      }
      if (messageKey) {
        recentlyHandledMessages.add(messageKey);
        setTimeout(() => recentlyHandledMessages.delete(messageKey), 60000);
      }

      await processIncomingMessage(message, deps);
    } catch (error) {
      if (messageKey) recentlyHandledMessages.delete(messageKey);
      console.error('❌ Error handling message:', error);
    }
  });
}
