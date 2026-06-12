import fetch from 'node-fetch';
import config from './config.js';

/**
 * GIF search service using Tenor API
 */
class GifService {
  constructor() {
    this.apiKey = config.tenor?.apiKey || 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // Public test key
    this.baseUrl = 'https://tenor.googleapis.com/v2';
    this.locale = 'he_IL'; // Support Hebrew
  }

  /**
   * Search for a GIF
   * @param {string} query - Search query
   * @param {number} limit - Number of results (default: 1)
   * @returns {Promise<string|null>} GIF URL or null
   */
  async search(query, limit = 1) {
    try {
      console.log(`🎬 Searching for GIF: "${query}"`);
      
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&key=${this.apiKey}&client_key=whatsapp_bot&limit=${limit}&locale=${this.locale}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        // Get the first result's GIF URL (medium quality for WhatsApp)
        const gifUrl = data.results[0].media_formats.gif.url;
        console.log(`✅ Found GIF: ${gifUrl}`);
        return gifUrl;
      }
      
      console.log('⚠️ No GIF found for query');
      return null;
    } catch (error) {
      console.error('❌ GIF search error:', error.message);
      return null;
    }
  }

  /**
   * Get a random trending GIF
   * @returns {Promise<string|null>}
   */
  async getTrending() {
    try {
      console.log('🎬 Getting trending GIF');
      
      const url = `${this.baseUrl}/featured?key=${this.apiKey}&client_key=whatsapp_bot&limit=1&locale=${this.locale}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const gifUrl = data.results[0].media_formats.gif.url;
        console.log(`✅ Found trending GIF: ${gifUrl}`);
        return gifUrl;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Trending GIF error:', error.message);
      return null;
    }
  }

  /**
   * Check if a message wants to send a GIF
   * @param {string} text - Bot response text
   * @returns {{wantsGif: boolean, query: string|null, cleanText: string}}
   */
  parseGifRequest(text) {
    // Look for patterns like [GIF: search query] or [GIF:search query]
    const gifPattern = /\[GIF:\s*([^\]]+)\]/i;
    const match = text.match(gifPattern);
    
    if (match) {
      return {
        wantsGif: true,
        query: match[1].trim(),
        cleanText: text.replace(gifPattern, '').trim()
      };
    }
    
    return {
      wantsGif: false,
      query: null,
      cleanText: text
    };
  }
}

export default GifService;


