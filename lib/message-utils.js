/**
 * Resolve sender display name and WhatsApp ID from a wwebjs message.
 */
export async function resolveSender(message) {
  let senderName = 'User';
  let senderId = message.author || message.from;

  try {
    const contact = await message.getContact();
    senderName = contact.pushname || contact.name || contact.number || 'User';

    let phoneNumber = contact.number;
    if (!phoneNumber && contact.id) {
      phoneNumber = contact.id.user || contact.id._serialized?.split('@')[0] || null;
    }
    if (!phoneNumber && contact.id?._serialized) {
      const idParts = contact.id._serialized.split('@');
      if (idParts[0] && /^\d+$/.test(idParts[0])) {
        phoneNumber = idParts[0];
      }
    }

    if (phoneNumber) {
      senderId = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@c.us`;
    }
  } catch (error) {
    if (senderId) {
      senderName = senderId.split('@')[0];
    }
  }

  return { senderId, senderName };
}

/**
 * Check if a chat should be processed based on TARGET_GROUP_NAME / ALLOWED_CHAT_IDS config.
 */
export function shouldProcessChat(chat, config) {
  const targetGroupName = (config.whatsapp?.targetGroupName || '').trim();
  const allowedChatIds = (config.whatsapp?.allowedChatIds || []).filter(Boolean);

  if (allowedChatIds.length > 0) {
    return allowedChatIds.includes(chat.id._serialized);
  }

  if (targetGroupName) {
    const chatName = (chat.name || '').trim();
    return chatName.toLowerCase() === targetGroupName.toLowerCase();
  }

  return true;
}

/**
 * Build normalized message payload for webhook / polling consumers.
 */
export function buildMessagePayload({ message, chat, senderId, senderName, body, type, media = null }) {
  const chatName = chat.name || 'Unknown';
  const payload = {
    id: message.id._serialized,
    timestamp: message.timestamp,
    from: {
      id: senderId,
      name: senderName,
    },
    chat: {
      id: chat.id._serialized,
      name: chatName,
      isGroup: chat.isGroup || false,
    },
    body: body || '',
    type,
    hasMedia: Boolean(message.hasMedia || media),
    mediaType: message.type || null,
  };

  if (media) {
    payload.media = media;
  }

  if (type === 'voice' && message._transcriptionMeta) {
    payload.transcription = message._transcriptionMeta;
  }

  return payload;
}

/**
 * Download media from message and optionally include base64 in payload.
 */
export async function downloadMessageMedia(message, { includeBase64 = false, maxBytes = 5 * 1024 * 1024 } = {}) {
  const downloaded = await message.downloadMedia();
  if (!downloaded?.data) return null;

  const sizeBytes = Buffer.byteLength(downloaded.data, 'base64');
  const media = {
    mimetype: downloaded.mimetype,
    filename: downloaded.filename || null,
    sizeBytes,
  };

  if (includeBase64 && sizeBytes <= maxBytes) {
    media.data = downloaded.data;
  } else if (includeBase64) {
    media.truncated = true;
    media.reason = `Media exceeds max size (${maxBytes} bytes)`;
  }

  return { downloaded, media };
}
