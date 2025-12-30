/**
 * Claude Track & Export - Injected Script
 * Runs in page context to intercept API calls and track usage
 */

(function() {
  'use strict';

  // Store original fetch
  const originalFetch = window.fetch;

  // Intercept fetch requests
  window.fetch = async function(...args) {
    const [resource, options] = args;
    const url = typeof resource === 'string' ? resource : resource.url;

    // Call original fetch
    const response = await originalFetch.apply(this, args);

    // Check for rate limit headers in response
    try {
      if (url.includes('claude.ai/api/') || url.includes('/api/')) {
        // Clone response to read headers
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });

        // Look for rate limit headers
        const rateLimitData = {
          remaining: headers['x-ratelimit-remaining'],
          limit: headers['x-ratelimit-limit'],
          reset: headers['x-ratelimit-reset'],
          used: headers['x-ratelimit-used']
        };

        // Only dispatch if we have rate limit data
        if (rateLimitData.remaining || rateLimitData.limit) {
          window.dispatchEvent(new CustomEvent('cte-rate-limit', {
            detail: {
              url,
              rateLimitData,
              timestamp: Date.now()
            }
          }));
        }

        // Check for conversation API calls
        if (url.includes('/chat_conversations/') && url.includes('/completion')) {
          window.dispatchEvent(new CustomEvent('cte-api-call', {
            detail: {
              type: 'completion',
              url,
              timestamp: Date.now()
            }
          }));
        }
      }
    } catch (error) {
      // Silently ignore errors to not break page functionality
      console.debug('[Claude Track Inject] Error:', error);
    }

    return response;
  };

  // Also intercept XMLHttpRequest for completeness
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._cteUrl = url;
    this._cteMethod = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        if (this._cteUrl && (this._cteUrl.includes('claude.ai/api/') || this._cteUrl.includes('/api/'))) {
          const rateLimitRemaining = this.getResponseHeader('x-ratelimit-remaining');
          const rateLimitLimit = this.getResponseHeader('x-ratelimit-limit');

          if (rateLimitRemaining || rateLimitLimit) {
            window.dispatchEvent(new CustomEvent('cte-rate-limit', {
              detail: {
                url: this._cteUrl,
                rateLimitData: {
                  remaining: rateLimitRemaining,
                  limit: rateLimitLimit,
                  reset: this.getResponseHeader('x-ratelimit-reset'),
                  used: this.getResponseHeader('x-ratelimit-used')
                },
                timestamp: Date.now()
              }
            }));
          }
        }
      } catch (error) {
        console.debug('[Claude Track Inject] XHR Error:', error);
      }
    });

    return originalXHRSend.apply(this, args);
  };

  // Notify content script that injection is complete
  window.dispatchEvent(new CustomEvent('cte-injected', {
    detail: { timestamp: Date.now() }
  }));

  console.debug('[Claude Track] Network interception initialized');
})();
