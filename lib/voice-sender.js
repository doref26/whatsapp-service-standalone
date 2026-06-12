import { unlinkSync } from 'fs';

export async function sendVoiceToChat({
  whatsappClient,
  MessageMedia,
  chatId,
  text,
  replyToMessageId = null,
  ttsService,
  ttsOptions = {},
}) {
  if (!whatsappClient) throw new Error('WhatsApp client is not ready');

  const oggPath = await ttsService.synthesizeToOgg(text, ttsOptions || {});

  try {
    const chat = await whatsappClient.getChatById(chatId);
    if (!chat?.id?._serialized) throw new Error(`Chat not found for ID: ${chatId}`);

    const media = MessageMedia.fromFilePath(oggPath);
    media.mimetype = 'audio/ogg; codecs=opus';

    const sendOptions = { sendAudioAsVoice: true, sendSeen: false };
    if (replyToMessageId) sendOptions.quotedMessageId = replyToMessageId;

    const sentMessage = await chat.sendMessage(media, sendOptions);
    console.log(`🎤 Voice reply sent to ${chat.name || chatId}`);

    return {
      success: true,
      messageId: sentMessage.id._serialized,
      type: 'voice',
    };
  } finally {
    try {
      unlinkSync(oggPath);
    } catch {
      // ignore
    }
  }
}
