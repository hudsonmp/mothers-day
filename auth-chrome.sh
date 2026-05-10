#!/bin/bash
# Reconnect Claude-in-Chrome extension. Run this if the MCP says
# "Browser extension is not connected" mid-session.
echo "Opening Claude-in-Chrome auth page in Chrome..."
open -a "Google Chrome" "https://claude.ai/chrome"
echo "→ In the Chrome tab that just opened:"
echo "  1. Make sure you're logged into claude.ai"
echo "  2. Check the extension shows 'Connected'"
echo "  3. If not, click 'Connect' in the extension popup (top-right of Chrome)"
echo "After this, retry the action that needed the browser."
