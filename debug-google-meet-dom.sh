#!/bin/bash
# Script to help extract Google Meet DOM structure
# Run this in your browser console during a Google Meet call

echo "=== Google Meet DOM Inspector ==="
echo ""
echo "Copy and paste these commands in your browser console during a meeting:"
echo ""
echo "1. Get participants list HTML:"
echo "---"
cat << 'EOF'
// Get participants panel HTML
const participantsPanel = document.querySelector('[aria-label="Participants"]');
if (participantsPanel) {
  console.log("=== PARTICIPANTS PANEL ===");
  console.log(participantsPanel.outerHTML);
} else {
  console.log("Participants panel not found. Try these:");
  console.log(document.querySelector('[role="list"]')?.outerHTML);
}
EOF

echo ""
echo "2. Get all participant elements:"
echo "---"
cat << 'EOF'
// Find participant items
const items = Array.from(document.querySelectorAll('[data-participant-id]'));
console.log("=== PARTICIPANT ITEMS ===");
items.forEach((item, idx) => {
  console.log(`Participant ${idx}:`, {
    id: item.getAttribute('data-participant-id'),
    ariaLabel: item.getAttribute('aria-label'),
    text: item.textContent?.trim().substring(0, 100),
    html: item.outerHTML.substring(0, 500)
  });
});
EOF

echo ""
echo "3. Check for window objects with participant data:"
echo "---"
cat << 'EOF'
// Check window objects
console.log("=== WINDOW OBJECTS ===");
Object.keys(window).filter(k => k.toLowerCase().includes('meet')).forEach(k => {
  console.log(k, typeof window[k]);
});
EOF

echo ""
echo "4. Look for speaking indicators:"
echo "---"
cat << 'EOF'
// Find speaking indicators
console.log("=== SPEAKING INDICATORS ===");
const speakingElements = document.querySelectorAll('[class*="speak"], [class*="audio"], [class*="mic"]');
speakingElements.forEach(el => {
  if (el.textContent) {
    console.log({
      classes: el.className,
      text: el.textContent.trim().substring(0, 50),
      parent: el.parentElement?.getAttribute('aria-label')
    });
  }
});
EOF

echo ""
echo "5. Get captions with speaker names:"
echo "---"
cat << 'EOF'
// Check captions
const captions = document.querySelector('[aria-live="polite"]') || 
                 document.querySelector('[class*="caption"]');
if (captions) {
  console.log("=== CAPTIONS ===");
  console.log(captions.outerHTML);
  
  // Monitor captions
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.textContent) {
          console.log("Caption:", node.textContent);
        }
      });
    });
  });
  observer.observe(captions, { childList: true, subtree: true });
  console.log("Captions observer started - speak to see output");
}
EOF

echo ""
echo "=== INSTRUCTIONS ==="
echo "1. Join a Google Meet meeting"
echo "2. Open participants panel by clicking the people icon"
echo "3. Open browser console (F12)"
echo "4. Copy/paste each code block above"
echo "5. Share the output with me"
