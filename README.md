# Claude Track & Export

**A Chrome extension that enhances Claude.ai with real-time usage tracking and seamless chat management.**

Built during a weekend vibe coding session - because the best developer tools often come from scratching your own itch.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Chrome](https://img.shields.io/badge/chrome-extension-green)
![License](https://img.shields.io/badge/license-MIT-purple)

## What It Does

Track your Claude usage limits in real-time and export conversations with one click. No fuss, no complicated setup.

### 📊 Real-time Usage Tracking
- Monitor your **5-hour session** limit with auto-refresh every 30 seconds
- Track **weekly session** usage
- Color-coded progress bars (green → yellow → orange → red)

### 📋 One-Click Export
- Single **Export Conversation** button
- Exports entire current conversation to Markdown
- Auto-copies to clipboard + downloads file
- Ready to paste anywhere

### 🎨 Adaptive UI
- Integrates into Claude's sidebar (expanded or collapsed)
- Light/dark theme support
- Floating panel fallback

## Installation

**Not on the Chrome Web Store (yet?)** - Install manually in developer mode:

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/yourusername/ChatExpoter.git
   ```

2. **Open Chrome** → `chrome://extensions/`

3. **Enable Developer Mode** (toggle in top-right)

4. **Click "Load unpacked"** → select the `App` folder

5. **Visit** [claude.ai](https://claude.ai) - panel appears automatically in sidebar

## Usage

### Viewing Stats

Navigate to [claude.ai](https://claude.ai). The **Track & Export** panel shows:

- **5-Hour Session**: Current usage
- **Weekly Limit**: Total for the week

**Color indicators:**
- 🟢 Green: < 50% used
- 🟡 Yellow: 50-70% used
- 🟠 Orange: 70-90% used
- 🔴 Red: > 90% used

### Exporting Conversations

1. Open any conversation
2. Click **Export Conversation**
3. Markdown file downloads + content copied to clipboard

### Export Format

```markdown
# Conversation Title

**Exported:** 2024-01-15
**Messages:** 12

---

### 👤 **User** 
*2024-01-15T10:30:45.123Z*

Your message here...

---

### 🤖 **Claude**
*2024-01-15T10:31:12.456Z*

Claude's response here...
```

## Privacy

**Your data stays local:**

- ✅ No data collection
- ✅ No external servers
- ✅ Everything stored in Chrome
- ✅ Direct API calls to Claude only
- ✅ Open source - review the code
- ✅ No tracking or analytics

## Technical Details

### APIs Used
- Chrome Extension APIs (storage, tabs, clipboardWrite)
- Claude.ai internal APIs (usage, conversations)
- Fetch API interception for rate limit tracking

### File Structure

```
ChatExpoter/
├── LICENSE             # MIT License
├── README.md           # Documentation
└── App/
    ├── manifest.json        # Extension manifest (v3)
    ├── icons/              # Extension icons
    │   ├── icon16.png
    │   ├── icon32.png
    │   ├── icon48.png
    │   └── icon128.png
    └── src/
        ├── background.js   # Service worker
        ├── content.js      # Main content script
        ├── injected.js     # Network interceptor
        ├── popup.html      # Toolbar popup
        ├── popup.js        # Popup logic
        └── styles.css      # Panel styles
```

### Permissions
- `storage`: Save settings locally
- `clipboardWrite`: Copy exports to clipboard
- `tabs`: Detect active Claude.ai tabs
- `host_permissions`: Access claude.ai for API calls

## Troubleshooting

### Panel not appearing?
1. Confirm you're on [claude.ai](https://claude.ai)
2. Refresh the page
3. Verify extension is enabled in `chrome://extensions`

### Export not working?
1. Open an active conversation
2. Check browser console for errors
3. Use the manual refresh button in the popup

### Usage showing 0%?
- Data updates as you use Claude
- Make a few messages to trigger refresh
- Claude may not expose limits on all endpoints

## Known Quirks

Built over a weekend, so keep in mind:

- Panel placement adapts to sidebar state (may take a refresh)
- Very long conversations need to be scrolled to load all messages
- Usage data depends on Claude's API responses

## Future Ideas

Potential improvements for future vibe coding sessions:

- Export to additional formats (JSON, HTML)
- Batch export multiple conversations
- Advanced filtering for specific message types
- Enhanced PDF export with styling
- Custom usage alerts/notifications

## Contributing

Built for fun, but contributions welcome:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - use however you like.

## Disclaimer

Not affiliated with Anthropic. Just a tool to enhance your Claude experience.

---

**Made with coffee and good vibes for the Claude community** ☕✨