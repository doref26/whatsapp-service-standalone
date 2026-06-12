import fetch from 'node-fetch';
import config from './config.js';

/**
 * Image generation service
 * Supports both local Stable Diffusion and online Pollinations.ai
 */
class ImageService {
  constructor() {
    this.provider = config.imageGeneration?.provider || 'pollinations';
    this.fooocusUrl = config.imageGeneration?.fooocusUrl || 'http://127.0.0.1:7865';
    this.sdUrl = config.imageGeneration?.sdUrl || 'http://127.0.0.1:7860';
    this.onlineUrl = 'https://image.pollinations.ai/prompt/';
    this.defaultSteps = 20;
    this.defaultCfgScale = 7;
    this.defaultWidth = 1024;
    this.defaultHeight = 1024;
  }

  /**
   * Generate an image using configured provider
   * @param {string} prompt - The image description
   * @param {string} negativePrompt - What to avoid in the image
   * @returns {Promise<{url: string}|{base64: string}|null>}
   */
  async generate(prompt, negativePrompt = 'nsfw, nude, ugly, blurry, low quality') {
    try {
      console.log(`🎨 Generating image: "${prompt}"`);
      console.log(`🔧 Using provider: ${this.provider}`);
      
      switch (this.provider) {
        case 'fooocus':
          return await this.generateFooocus(prompt, negativePrompt);
        case 'sd':
          return await this.generateSD(prompt, negativePrompt);
        case 'pollinations':
        default:
          return await this.generateOnline(prompt);
      }
      
    } catch (error) {
      console.error('❌ Image generation error:', error.message);
      return null;
    }
  }

  /**
   * Generate using Fooocus (supports both Gradio API and Fooocus-API)
   */
  async generateFooocus(prompt, negativePrompt) {
    try {
      console.log(`🎨 Generating with Fooocus at ${this.fooocusUrl}...`);
      
      // Try Fooocus-API first (FastAPI endpoint)
      try {
        return await this.generateFooocusAPI(prompt, negativePrompt);
      } catch (apiError) {
        console.log('⚠️ Fooocus-API failed, trying Gradio API...');
        // Fall back to Gradio API
        return await this.generateFooocusGradio(prompt, negativePrompt);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`❌ Fooocus connection timeout (30s) - is it running?`);
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('ECONNREFUSED')) {
        console.error(`❌ Cannot connect to Fooocus at ${this.fooocusUrl}`);
        console.error(`   Check: 1) Fooocus is running, 2) Listening on network (not just localhost), 3) Firewall allows port`);
      } else {
        console.error(`❌ Fooocus generation failed: ${error.message}`);
      }
      console.log('⚠️ Falling back to Pollinations.ai');
      return await this.generateOnline(prompt);
    }
  }

  /**
   * Generate using Fooocus-API (FastAPI)
   */
  async generateFooocusAPI(prompt, negativePrompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(`${this.fooocusUrl}/v1/generation/text-to-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        negative_prompt: negativePrompt,
        image_number: 1,
        image_seed: -1,
        sharpness: 2,
        guidance_scale: this.defaultCfgScale,
        base_model_name: "juggernautXL_v9Rdphoto2Lightning.safetensors",
        refiner_model_name: "None",
        style_selections: ["Fooocus V2", "Fooocus Enhance", "Fooocus Sharp"],
        aspect_ratios_selection: "1152×896",
        async_process: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Fooocus-API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.length > 0 && data[0].base64) {
      console.log('✅ Image generated with Fooocus-API');
      return {
        base64: data[0].base64,
        mimeType: 'image/png'
      };
    }
    
    throw new Error('No image data returned from Fooocus-API');
  }

  /**
   * Generate using Gradio API (standard Fooocus)
   */
  async generateFooocusGradio(prompt, negativePrompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // Gradio can be slower
    
    // First, get the Gradio API info to find the correct endpoint
    const apiInfoResponse = await fetch(`${this.fooocusUrl}/api/`, {
      signal: controller.signal
    });
    
    if (!apiInfoResponse.ok) {
      throw new Error(`Cannot access Gradio API: ${apiInfoResponse.status}`);
    }
    
    const apiInfo = await apiInfoResponse.json();
    
    // Find the text-to-image endpoint (usually the first one)
    // Gradio API format: /api/{endpoint_name}/
    const endpoint = apiInfo.endpoints?.[0] || 'queue';
    
    // Use Gradio's queue API
    const response = await fetch(`${this.fooocusUrl}/api/queue/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [prompt, negativePrompt],
        event_data: null,
        fn_index: 0,
        trigger_id: Math.random()
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Gradio API error: ${response.status}`);
    }

    const result = await response.json();
    
    // Gradio returns a job ID, we need to poll for results
    // For now, this is a simplified version - full implementation would poll
    throw new Error('Gradio API requires polling - use Fooocus-API or Pollinations.ai');
  }

  /**
   * Generate using Stable Diffusion Web UI
   */
  async generateSD(prompt, negativePrompt) {
    const response = await fetch(`${this.sdUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        negative_prompt: negativePrompt,
        steps: this.defaultSteps,
        cfg_scale: this.defaultCfgScale,
        width: this.defaultWidth,
        height: this.defaultHeight,
        sampler_name: 'DPM++ 2M Karras',
      }),
    });

    if (!response.ok) {
      throw new Error(`SD API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.images && data.images.length > 0) {
      console.log('✅ Image generated locally (Stable Diffusion)');
      return {
        base64: data.images[0],
        info: JSON.parse(data.info)
      };
    }
    
    return null;
  }

  /**
   * Generate using Pollinations.ai (free online service)
   */
  async generateOnline(prompt) {
    // Pollinations.ai - construct URL
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
    
    console.log(`🌐 Generating image with Pollinations.ai...`);
    console.log(`🔗 Image URL: ${imageUrl}`);
    
    try {
      // Download the image ourselves to ensure it's sent as actual image
      console.log('📥 Downloading image...');
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      
      console.log(`✅ Image downloaded (${Math.round(buffer.length / 1024)}KB)`);
      
      return {
        base64: base64,
        mimeType: 'image/jpeg'
      };
    } catch (error) {
      console.error(`❌ Download failed: ${error.message}`);
      // Fallback to URL
      return {
        url: imageUrl
      };
    }
  }

  /**
   * Check if Fooocus is available
   */
  async checkFooocus() {
    try {
      const response = await fetch(`${this.fooocusUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse image generation request from bot response
   * @param {string} text - Bot response text
   * @returns {{wantsImage: boolean, prompt: string|null, cleanText: string}}
   */
  parseImageRequest(text) {
    // Look for patterns like [IMAGE: description] or [IMG: description]
    const imagePattern = /\[(IMAGE|IMG):\s*([^\]]+)\]/i;
    const match = text.match(imagePattern);
    
    if (match) {
      return {
        wantsImage: true,
        prompt: match[2].trim(),
        cleanText: text.replace(imagePattern, '').trim()
      };
    }
    
    return {
      wantsImage: false,
      prompt: null,
      cleanText: text
    };
  }
}

export default ImageService;

