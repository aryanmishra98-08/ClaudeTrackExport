# Claude Track & Export

A Chrome extension that enhances your Claude.ai experience with real-time usage tracking and seamless chat management.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Chrome](https://img.shields.io/badge/chrome-extension-green)
![License](https://img.shields.io/badge/license-MIT-purple)

## Features

### 📊 Real-time Usage Tracking
- Monitor your **5-hour session** limit in real-time
- Track **weekly session** usage
- Visual progress bars with color-coded status (green → red)
- Auto-refresh every 30 seconds

### 📋 One-Click Export
- Single **Export Conversation** button
- Exports the **entire current conversation** to Markdown
- **One-click** copy to clipboard
- Instant file download

### ⚡ Simple Workflow
1. Open any conversation on Claude.ai
2. Click **Export Conversation**
3. Markdown downloads automatically
4. Content copied to clipboard
5. Ready to paste anywhere!

### 🎨 Adaptive UI
- Integrates seamlessly into Claude's sidebar
- Works in both expanded and collapsed modes
- Light and dark theme support
- Floating panel fallback

### 🔄 Auto-Refresh
- Updates every 30 seconds
- Manual refresh button available
- Smart caching for performance

## Installation

### From Source (Developer Mode)

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/yourusername/claude-track-export.git
   ```

2. **Open Chrome** and navigate to:
   ```
   chrome://extensions/
   ```

3. **Enable Developer Mode** (toggle in top-right corner)

4. Click **"Load unpacked"** and select the `claude-track-export` folder

5. The extension icon should appear in your toolbar

6. **Visit** [claude.ai](https://claude.ai) - the panel will appear in the sidebar!

### From Chrome Web Store
*(Coming soon)*

## Usage

### Viewing Usage Stats

Once installed, navigate to [claude.ai](https://claude.ai). The **Track & Export** panel will appear at the bottom of the sidebar showing:

- **5-Hour Session**: Your current session usage
- **Weekly Limit**: Total usage for the week

Progress bars change color based on usage:
- 🟢 **Green**: < 50% used
- 🟡 **Yellow**: 50-70% used
- 🟠 **Orange**: 70-90% used
- 🔴 **Red**: > 90% used

### Exporting Conversations

1. Open any conversation on Claude.ai
2. Click the **Export Conversation** button in the panel
3. The export will:
   - Download a `.md` file with all messages
   - Copy content to your clipboard

### Export Format

Exports are saved as Markdown files with:

```markdown
# Conversation Title

**Exported:** 2024-01-15
**Messages:** 10 of 50 (20%)

---

### 👤 **User**

Your message here...

---

### 🤖 **Claude**

Claude's response here...
```

### Settings

Click the extension icon in your toolbar to access settings:

- **Auto-refresh**: Toggle 30-second auto-refresh
- **Copy to clipboard**: Auto-copy on export
- **Auto-open new chat**: Open new chat after export
- **Show notifications**: Toggle in-app notifications

## Privacy

🔒 **Your data stays private:**

- ✅ No data collection
- ✅ No external servers
- ✅ Everything stored locally in Chrome
- ✅ Direct API calls to Claude only
- ✅ Open source - review the code yourself
- ✅ No tracking or analytics

## File Structure

```
claude-track-export/
├── manifest.json        # Extension manifest (v3)
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── content.js      # Main content script
│   ├── styles.css      # Panel styles
│   ├── background.js   # Service worker
│   ├── popup.html      # Toolbar popup
│   ├── popup.js        # Popup logic
│   └── injected.js     # Network interceptor
└── README.md           # This file
```

## Technical Details

### APIs Used
- Chrome Extension APIs (storage, tabs, clipboardWrite)
- Claude.ai internal APIs (usage, conversations)
- Fetch API interception for rate limit tracking

### Permissions
- `storage`: Save settings and export history locally
- `clipboardWrite`: Copy exports to clipboard
- `tabs`: Detect active Claude.ai tabs
- `host_permissions`: Access claude.ai for API calls

## Troubleshooting

### Panel not appearing?
1. Make sure you're on [claude.ai](https://claude.ai)
2. Try refreshing the page
3. Check if the extension is enabled in `chrome://extensions`
4. Look for the floating panel if sidebar integration fails

### Export not working?
1. Ensure you have an active conversation open
2. Check the browser console for errors
3. Try a manual refresh using the refresh button

### Usage data showing 0%?
- Claude may not expose rate limits on all endpoints
- The data will update as you use Claude
- Try making a few messages to trigger data refresh

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for the Claude.ai community
- Inspired by the need for better usage tracking
- Thanks to Anthropic for creating Claude

---

**Made with ❤️ for Claude users**
