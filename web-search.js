import fetch from 'node-fetch';

/**
 * Web search service for getting real-time information
 */
class WebSearchService {
  constructor() {
    this.searchEngine = 'duckduckgo'; // Privacy-friendly, no API key needed
  }

  /**
   * Search the web for information
   * @param {string} query - The search query
   * @returns {Promise<{text: string, url: string|null}>} Search results with source URL
   */
  async search(query) {
    try {
      console.log(`🌐 Searching web for: "${query}"`);
      
      // Check if this is a time-sensitive query that needs fresh results
      const timeSensitive = /today|now|current|latest|price|weather|news|score|היום|עכשיו|נוכחי|אחרון|מחיר|חדשות/i.test(query);
      
      if (timeSensitive) {
        console.log('⏰ Time-sensitive query - using live search');
        // For current/time-sensitive info, always scrape fresh results
        return await this.searchWithScraping(query);
      }
      
      // For general queries, try instant answer API first
      const instantUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const instantResponse = await fetch(instantUrl);
      const instantData = await instantResponse.json();
      
      // Extract relevant information
      let results = [];
      let sourceUrl = null;
      
      // Abstract (main summary)
      if (instantData.Abstract) {
        results.push(`📝 ${instantData.Abstract}`);
        if (instantData.AbstractURL && instantData.AbstractURL.startsWith('http')) {
          sourceUrl = instantData.AbstractURL;
        }
      }
      
      // Definition
      if (instantData.Definition) {
        results.push(`📖 ${instantData.Definition}`);
        if (!sourceUrl && instantData.DefinitionURL && instantData.DefinitionURL.startsWith('http')) {
          sourceUrl = instantData.DefinitionURL;
        }
      }
      
      // If we got good instant results, return them
      if (results.length > 0 && sourceUrl) {
        console.log(`✅ Found instant answer with source`);
        return {
          text: results.join('\n\n'),
          url: sourceUrl
        };
      }
      
      // Otherwise, do a web scraping search
      return await this.searchWithScraping(query);
      
    } catch (error) {
      console.error('❌ Web search error:', error.message);
      return null;
    }
  }

  /**
   * Web scraping search for current/real-time information
   */
  async searchWithScraping(query) {
    try {
      // Use DuckDuckGo lite HTML (better for scraping)
      const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const html = await response.text();
      
      // Extract first 3 search results with titles, snippets, and URLs
      const resultPattern = /<a rel=['"]nofollow['"] href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>[^<]*<td class=['"]result-snippet['"]>([^<]+)<\/td>/g;
      const results = [];
      let match;
      let count = 0;
      
      while ((match = resultPattern.exec(html)) && count < 3) {
        const url = match[1].trim();
        const title = match[2].trim();
        const snippet = match[3].trim();
        
        // Skip DuckDuckGo redirect links
        if (!url.includes('duckduckgo.com') && url.startsWith('http')) {
          results.push({
            title,
            snippet,
            url
          });
          count++;
        }
      }
      
      if (results.length > 0) {
        // Format the first result as the main answer
        const mainResult = results[0];
        let text = `🌐 ${mainResult.snippet}`;
        
        // Add other results as related
        if (results.length > 1) {
          text += '\n\n🔍 Related:';
          for (let i = 1; i < results.length; i++) {
            text += `\n• ${results[i].title}`;
          }
        }
        
        console.log(`✅ Found ${results.length} search result(s)`);
        return {
          text,
          url: mainResult.url
        };
      }
      
      return null;
    } catch (error) {
      console.error('Web scraping search failed:', error.message);
      return null;
    }
  }

  /**
   * Determine if a query needs web search
   * @param {string} message - The user's message
   * @returns {boolean}
   */
  needsWebSearch(message) {
    const lower = message.toLowerCase();
    
    // Keywords that suggest needing current/web information
    const webKeywords = [
      'what is', 'מה זה', 'מהו',
      'who is', 'מי זה', 'מי הוא', 'מי היא',
      'when', 'מתי',
      'where', 'איפה', 'היכן',
      'latest', 'אחרון', 'עדכני', 'אחרונה',
      'current', 'נוכחי', 'נוכחית',
      'today', 'היום',
      'now', 'עכשיו',
      'news', 'חדשות',
      'weather', 'מזג אוויר', 'מזג', 'טמפרטורה',
      'price', 'מחיר', 'עולה', 'כמה עולה',
      'search', 'חיפוש',
      'find', 'מצא',
      'look up', 'בדוק',
      'bitcoin', 'ביטקוין',
      'stock', 'מניה', 'מניות',
      'score', 'תוצאה', 'ניצח',
      'won', 'זכה',
      'race', 'מירוץ'
    ];
    
    return webKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * Extract search query from message
   */
  extractSearchQuery(message) {
    // Remove common prefixes
    let query = message
      .replace(/^(what is|who is|tell me about|מה זה|מי זה|ספר לי על)\s+/i, '')
      .replace(/\?+$/g, '')
      .trim();
    
    return query;
  }
}

export default WebSearchService;

