const { jsPDF } = window.jspdf;

document.addEventListener('DOMContentLoaded', async () => {
  const downloadCurrentBtn = document.getElementById('downloadCurrent');
  const downloadUrlBtn = document.getElementById('downloadUrl');
  const urlInput = document.getElementById('urlInput');
  const currentStatus = document.getElementById('currentStatus');
  const urlStatus = document.getElementById('urlStatus');

  // Check if current tab is a supported chat page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isChatPage = tab.url.includes('chat.openai.com') || 
                     tab.url.includes('chatgpt.com') || 
                     tab.url.includes('claude.ai');

  if (!isChatPage) {
    downloadCurrentBtn.disabled = true;
    currentStatus.textContent = 'Not on a chat page';
    currentStatus.className = 'status error';
  } else {
    currentStatus.textContent = 'Ready to export';
    currentStatus.className = 'status success';
  }

  // Download current page
  downloadCurrentBtn.addEventListener('click', async () => {
    downloadCurrentBtn.disabled = true;
    currentStatus.textContent = 'Extracting conversation...';
    currentStatus.className = 'status loading';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('Executing extraction on tab:', tab.id);
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractConversation
      });

      console.log('Extraction results:', results);
      const chatData = results[0].result;
      
      console.log('Chat data:', chatData);
      console.log('Messages found:', chatData?.messages?.length || 0);
      
      if (!chatData) {
        throw new Error('Failed to extract conversation data');
      }
      
      if (!chatData.messages || chatData.messages.length === 0) {
        throw new Error('No messages found. Try scrolling through the conversation first.');
      }

      currentStatus.textContent = `Generating PDF (${chatData.messages.length} messages)...`;
      await generatePDF(chatData);
      
      currentStatus.textContent = `✓ Downloaded ${chatData.messages.length} messages!`;
      currentStatus.className = 'status success';
    } catch (error) {
      console.error('Error:', error);
      currentStatus.textContent = '✗ Error: ' + error.message;
      currentStatus.className = 'status error';
    } finally {
      downloadCurrentBtn.disabled = false;
    }
  });

  // Download from URL
  downloadUrlBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    
    if (!url) {
      urlStatus.textContent = 'Please enter a URL';
      urlStatus.className = 'status error';
      return;
    }

    if (!url.includes('chat.openai.com') && 
        !url.includes('chatgpt.com') && 
        !url.includes('claude.ai')) {
      urlStatus.textContent = 'Invalid URL (must be ChatGPT or Claude)';
      urlStatus.className = 'status error';
      return;
    }

    downloadUrlBtn.disabled = true;
    urlStatus.textContent = 'Opening conversation...';
    urlStatus.className = 'status loading';

    let newTab = null;

    try {
      // Create new tab with the URL
      newTab = await chrome.tabs.create({ url, active: false });
      console.log('Created new tab:', newTab.id);
      
      // Wait for page to load
      await new Promise(resolve => {
        const listener = (tabId, changeInfo) => {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            console.log('Tab loaded');
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 30000);
      });

      // Wait a bit more for dynamic content
      urlStatus.textContent = 'Loading conversation...';
      await new Promise(resolve => setTimeout(resolve, 5000));

      urlStatus.textContent = 'Extracting messages...';

      const results = await chrome.scripting.executeScript({
        target: { tabId: newTab.id },
        func: extractConversation
      });

      console.log('URL extraction results:', results);
      const chatData = results[0].result;
      
      console.log('URL chat data:', chatData);
      console.log('URL messages found:', chatData?.messages?.length || 0);
      
      if (!chatData) {
        throw new Error('Failed to extract conversation data');
      }
      
      if (!chatData.messages || chatData.messages.length === 0) {
        throw new Error('No messages found. The page may not have loaded properly.');
      }

      urlStatus.textContent = `Generating PDF (${chatData.messages.length} messages)...`;
      await generatePDF(chatData);
      
      // Close the tab
      await chrome.tabs.remove(newTab.id);
      newTab = null;
      
      urlStatus.textContent = `✓ Downloaded ${chatData.messages.length} messages!`;
      urlStatus.className = 'status success';
      urlInput.value = '';
    } catch (error) {
      console.error('URL download error:', error);
      urlStatus.textContent = '✗ Error: ' + error.message;
      urlStatus.className = 'status error';
      
      // Try to close the tab if it was created
      if (newTab) {
        try {
          await chrome.tabs.remove(newTab.id);
        } catch (e) {
          console.error('Error closing tab:', e);
        }
      }
    } finally {
      downloadUrlBtn.disabled = false;
    }
  });
});

// Function to extract conversation (runs in page context)
function extractConversation() {
  console.log('Starting conversation extraction...');
  const hostname = window.location.hostname;
  let platform = '';
  let messages = [];
  let title = '';

  if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) {
    platform = 'ChatGPT';
    console.log('Detected ChatGPT');
    
    // Try to get title
    const titleElement = document.querySelector('title');
    title = titleElement ? titleElement.textContent : 'ChatGPT Conversation';
    
    // Method 1: Try data-message-author-role attribute
    let messageElements = document.querySelectorAll('[data-message-author-role]');
    console.log('Method 1: Found elements with data-message-author-role:', messageElements.length);
    
    if (messageElements.length > 0) {
      messageElements.forEach(el => {
        const role = el.getAttribute('data-message-author-role');
        const contentElement = el.querySelector('.markdown, .whitespace-pre-wrap, [class*="markdown"]');
        
        if (contentElement) {
          const content = contentElement.innerText || contentElement.textContent;
          if (content && content.trim()) {
            messages.push({
              role: role === 'user' ? 'User' : 'Assistant',
              content: content.trim()
            });
          }
        }
      });
    }
    
    // Method 2: Try article elements
    if (messages.length === 0) {
      console.log('Method 2: Trying article elements');
      messageElements = document.querySelectorAll('article');
      
      messageElements.forEach(el => {
        const content = el.innerText || el.textContent;
        if (content && content.trim() && content.trim().length > 10) {
          // Check parent attributes to determine role
          const isUser = el.outerHTML.toLowerCase().includes('user') ||
                        el.querySelector('[data-message-author-role="user"]') !== null;
          
          messages.push({
            role: isUser ? 'User' : 'Assistant',
            content: content.trim()
          });
        }
      });
    }

    // Method 3: Look for any div with substantial text content
    if (messages.length === 0) {
      console.log('Method 3: Looking for conversation container');
      const mainContainer = document.querySelector('main, [role="main"], .conversation');
      if (mainContainer) {
        const allDivs = mainContainer.querySelectorAll('div');
        let lastRole = null;
        
        allDivs.forEach(div => {
          const text = div.innerText;
          if (text && text.trim().length > 20 && !div.querySelector('div')) {
            // This is likely a leaf node with actual content
            const html = div.outerHTML.toLowerCase();
            const isUser = html.includes('user');
            const role = isUser ? 'User' : 'Assistant';
            
            // Avoid duplicates
            if (lastRole !== role || messages.length === 0 || 
                messages[messages.length - 1].content !== text.trim()) {
              messages.push({
                role: role,
                content: text.trim()
              });
              lastRole = role;
            }
          }
        });
      }
    }
    
  } else if (hostname.includes('claude.ai')) {
    platform = 'Claude';
    console.log('Detected Claude');
    
    // Try to get title
    title = document.title || 'Claude Conversation';
    
    // Method 1: Look for specific Claude message structure
    const messageContainers = document.querySelectorAll('[class*="font-"], [data-test*="message"]');
    console.log('Method 1: Found potential message containers:', messageContainers.length);
    
    messageContainers.forEach(el => {
      const content = el.innerText || el.textContent;
      if (content && content.trim().length > 10) {
        const isUser = el.className.includes('user') || 
                      el.outerHTML.toLowerCase().includes('user') ||
                      el.closest('[class*="user"]') !== null;
        
        // Avoid duplicates
        if (messages.length === 0 || messages[messages.length - 1].content !== content.trim()) {
          messages.push({
            role: isUser ? 'User' : 'Assistant',
            content: content.trim()
          });
        }
      }
    });

    // Method 2: Try to find all paragraphs in conversation
    if (messages.length === 0) {
      console.log('Method 2: Looking for paragraphs and divs');
      const conversationArea = document.querySelector('main, [role="main"]');
      if (conversationArea) {
        const allElements = conversationArea.querySelectorAll('p, div[class*="message"]');
        
        allElements.forEach(el => {
          const text = el.innerText || el.textContent;
          if (text && text.trim().length > 20) {
            const isUser = el.outerHTML.toLowerCase().includes('user') ||
                          el.closest('[class*="user"]') !== null;
            
            if (messages.length === 0 || messages[messages.length - 1].content !== text.trim()) {
              messages.push({
                role: isUser ? 'User' : 'Assistant',
                content: text.trim()
              });
            }
          }
        });
      }
    }

    // Method 3: Fallback - get all text content and try to separate
    if (messages.length === 0) {
      console.log('Method 3: Fallback extraction');
      const main = document.querySelector('main');
      if (main) {
        const allText = main.innerText;
        if (allText) {
          messages.push({
            role: 'Assistant',
            content: allText
          });
        }
      }
    }
  }

  console.log('Extraction complete. Found', messages.length, 'messages');
  console.log('First few messages:', messages.slice(0, 3));
  
  return { platform, title, messages };
}

// Generate PDF from chat data
async function generatePDF(chatData) {
  try {
    console.log('Generating PDF with data:', chatData);
    
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Title
    pdf.setFontSize(18);
    pdf.setFont(undefined, 'bold');
    pdf.text(chatData.title || 'Conversation Export', margin, yPosition);
    yPosition += 10;

    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(128, 128, 128);
    pdf.text(`${chatData.platform} • ${new Date().toLocaleDateString()}`, margin, yPosition);
    yPosition += 15;

    pdf.setTextColor(0, 0, 0);

    // Messages
    chatData.messages.forEach((message, index) => {
      console.log(`Processing message ${index + 1}/${chatData.messages.length}`);
      
      // Check if we need a new page
      if (yPosition > pageHeight - margin - 20) {
        pdf.addPage();
        yPosition = margin;
      }

      // Role header
      pdf.setFontSize(11);
      pdf.setFont(undefined, 'bold');
      
      if (message.role === 'User') {
        pdf.setTextColor(102, 126, 234);
      } else {
        pdf.setTextColor(118, 75, 162);
      }
      
      pdf.text(message.role + ':', margin, yPosition);
      yPosition += 7;

      // Message content
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(0, 0, 0);

      const lines = pdf.splitTextToSize(message.content, maxWidth);
      
      lines.forEach(line => {
        if (yPosition > pageHeight - margin - 10) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(line, margin, yPosition);
        yPosition += 5;
      });

      yPosition += 10; // Space between messages
    });

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${chatData.platform}_Chat_${timestamp}.pdf`;

    console.log('Saving PDF as:', filename);
    
    // Save PDF
    pdf.save(filename);
    
    console.log('PDF saved successfully!');
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF: ' + error.message);
  }
}
