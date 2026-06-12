/**
 * Example: How to integrate with WhatsApp Service API
 * 
 * This file demonstrates how to:
 * 1. Poll for incoming messages
 * 2. Send messages via API
 * 3. Use webhook for real-time message delivery
 */

const API_BASE_URL = 'http://localhost:3000/api';

// Example 1: Poll for incoming messages
async function pollForMessages() {
  console.log('Polling for messages...');
  
  const response = await fetch(`${API_BASE_URL}/webhook`);
  const data = await response.json();
  
  if (data.messages && data.messages.length > 0) {
    console.log(`Received ${data.messages.length} message(s):`);
    
    data.messages.forEach(message => {
      console.log(`\n📩 From: ${message.from.name}`);
      console.log(`   Chat: ${message.chat.name} (${message.chat.isGroup ? 'Group' : 'Individual'})`);
      console.log(`   Message: ${message.body}`);
      console.log(`   Type: ${message.type}`);
      
      // Process the message
      handleIncomingMessage(message);
    });
  } else {
    console.log('No new messages');
  }
}

// Example 2: Handle incoming message
async function handleIncomingMessage(message) {
  // Your custom logic here
  if (message.body.toLowerCase().includes('hello')) {
    // Send a response
    await sendMessage(message.chat.id, 'Hello! How can I help you?');
  }
}

// Example 3: Send a text message
async function sendMessage(chatId, text, replyToMessageId = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chatId,
        message: text,
        replyToMessageId: replyToMessageId,
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Message sent: ${result.messageId}`);
      return result.messageId;
    } else {
      console.error(`❌ Failed to send: ${result.error}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    return null;
  }
}

// Example 4: Send a media message
async function sendMediaMessage(chatId, mediaUrl, caption = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/send-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chatId,
        mediaUrl: mediaUrl,
        caption: caption,
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Media sent: ${result.messageId}`);
      return result.messageId;
    } else {
      console.error(`❌ Failed to send media: ${result.error}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error sending media:', error.message);
    return null;
  }
}

// Example 5: Get list of chats
async function getChats() {
  try {
    const response = await fetch(`${API_BASE_URL}/chats`);
    const data = await response.json();
    
    console.log(`Found ${data.chats.length} chat(s):`);
    data.chats.forEach(chat => {
      console.log(`  - ${chat.name} (${chat.isGroup ? 'Group' : 'Individual'}) - ID: ${chat.id}`);
    });
    
    return data.chats;
  } catch (error) {
    console.error('❌ Error getting chats:', error.message);
    return [];
  }
}

// Example 6: Check service status
async function checkStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/status`);
    const status = await response.json();
    
    console.log('Service Status:');
    console.log(`  WhatsApp Ready: ${status.whatsappReady}`);
    console.log(`  API Port: ${status.apiPort}`);
    console.log(`  Webhook Configured: ${status.webhookConfigured}`);
    console.log(`  Queued Messages: ${status.queuedMessages}`);
    
    return status;
  } catch (error) {
    console.error('❌ Error checking status:', error.message);
    return null;
  }
}

// Example 7: Configure webhook (Express app example)
/*
// In your Express app:
app.post('/webhook', async (req, res) => {
  const message = req.body;
  
  console.log(`📩 New message from ${message.from.name}: ${message.body}`);
  
  // Process message
  if (message.body.toLowerCase().includes('help')) {
    // Send response via API
    await fetch('http://localhost:3000/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: message.chat.id,
        message: 'Here is some help!',
      }),
    });
  }
  
  res.json({ received: true });
});

// Then configure the webhook:
fetch('http://localhost:3000/api/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'http://your-app.com/webhook',
  }),
});
*/

// Example 8: Continuous polling
function startPolling(intervalMs = 5000) {
  console.log(`Starting to poll every ${intervalMs}ms...`);
  
  // Poll immediately
  pollForMessages();
  
  // Then poll at interval
  setInterval(pollForMessages, intervalMs);
}

// Uncomment to run examples:
// checkStatus();
// getChats();
// startPolling(5000); // Poll every 5 seconds

export {
  pollForMessages,
  sendMessage,
  sendMediaMessage,
  getChats,
  checkStatus,
  startPolling,
  handleIncomingMessage,
};

