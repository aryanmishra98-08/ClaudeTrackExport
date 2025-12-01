# Chat Exporter for ChatGPT & Claude

> A vibe coding project built on a lazy Sunday afternoon - because sometimes the best tools come from playful experimentation!

A simple browser extension that lets you export your ChatGPT and Claude conversations to PDF with just one click. No fuss, no complicated setup - just click and download.

## What Does It Do?

This extension adds a handy popup to your browser that lets you:
- Export the current chat you're viewing to a nicely formatted PDF
- Export any ChatGPT or Claude conversation by pasting its URL
- Keep your conversations organized with automatic timestamps

## Installation

Since this is a Sunday vibe project, it's not on the Chrome Web Store (yet?). Here's how to install it manually:

1. **Clone or download this repository**
   ```bash
   git clone <your-repo-url>
   ```

2. **Open your browser's extension page**
   - Chrome/Edge: Navigate to `chrome://extensions/`
   - Make sure "Developer mode" is enabled (toggle in the top right)

3. **Load the extension**
   - Click "Load unpacked"
   - Select the `App` folder from this repository
   - The Chat Exporter icon should appear in your browser toolbar

## How to Use

### Method 1: Export Current Chat

1. Open a ChatGPT or Claude conversation
2. Click the Chat Exporter extension icon
3. Click "Download This Chat"
4. Wait a moment while it extracts and formats your conversation
5. Your PDF will download automatically!

### Method 2: Export from URL

1. Copy the URL of any ChatGPT or Claude conversation
2. Click the Chat Exporter extension icon
3. Paste the URL in the input field
4. Click "Download from URL"
5. The extension will open the chat, extract it, and download the PDF

**Note:** Make sure you're logged in to the respective platform if the conversation is private!

## Supported Platforms

- [ChatGPT](https://chatgpt.com) (chatgpt.com)
- [Claude](https://claude.ai) (claude.ai)

## What's Inside?

```
ChatExpoter/
├── App/                    # Extension source files
│   ├── manifest.json       # Extension configuration
│   ├── popup.html          # The popup interface
│   ├── popup.js            # Main logic for extraction and PDF generation
│   ├── content.js          # Content script (for future enhancements)
│   ├── background.js       # Background service worker
│   ├── styles.css          # Styling for the popup
│   ├── jspdf.umd.min.js    # PDF generation library
│   └── icons/              # Extension icons
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── README.md               # You're reading it!
└── .gitignore             # Git ignore rules
```

## Technical Details

- Built with vanilla JavaScript (keeping it simple!)
- Uses [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- Chrome Extension Manifest V3
- Extracts conversations using DOM parsing (adapts to both ChatGPT and Claude's structures)

## Known Quirks

Since this was built in a playful Sunday coding session, here are some things to keep in mind:

- The extension tries multiple methods to extract messages (websites change their structure often!)
- For very long conversations, you might need to scroll through them first to ensure all messages are loaded
- PDF formatting is simple but functional - no fancy styling (yet)
- If extraction fails, try refreshing the page and clicking "Download" again

## Future Ideas

Just some random thoughts for potential improvements:
- Add more export formats (Markdown, JSON, etc.)
- Better PDF styling with code syntax highlighting
- Option to include/exclude timestamps
- Export multiple conversations at once
- Add filters to export only specific parts of a conversation

## Contributing

This is a casual vibe coding project, but if you want to contribute or suggest improvements, feel free to open an issue or PR!

## License

Built for fun on a Sunday - use it however you like! (MIT License implied)

## Disclaimer

This extension is not affiliated with OpenAI or Anthropic. It's just a tool to help you keep your conversations organized.

---

Made with coffee and good vibes on a Sunday afternoon ☕✨
