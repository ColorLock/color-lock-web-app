import { TileColor, DailyPuzzle } from '../types';

/**
 * Convert a TileColor to an emoji representation for sharing
 */
export function tileColorToEmoji(color: TileColor): string {
  const colorEmojis = {
    [TileColor.Red]: "🟥",
    [TileColor.Green]: "🟩",
    [TileColor.Blue]: "🟦",
    [TileColor.Yellow]: "🟨",
    [TileColor.Purple]: "🟪",
    [TileColor.Orange]: "🟧"
  };
  return colorEmojis[color] || "⬜";
}

/**
 * Convert a TileColor to a display name
 */
export function tileColorToName(color: TileColor): string {
  const colorNames = {
    [TileColor.Red]: "Red",
    [TileColor.Green]: "Green",
    [TileColor.Blue]: "Blue",
    [TileColor.Yellow]: "Yellow",
    [TileColor.Purple]: "Purple",
    [TileColor.Orange]: "Orange",
  };
  
  return colorNames[color] || "Color";
}

/**
 * Copy text to clipboard and show a notification
 */
export function copyToClipboard(text: string, message: string = 'Copied to clipboard!'): void {
  // Create a tooltip element for feedback
  const tooltip = document.createElement('div');
  tooltip.className = 'copy-tooltip';
  
  navigator.clipboard.writeText(text)
    .then(() => {
      // Success message
      tooltip.textContent = message;
      tooltip.classList.add('success');
    })
    .catch((err) => {
      // Error message
      console.error('Failed to copy: ', err);
      tooltip.textContent = 'Failed to copy';
      tooltip.classList.add('error');
    })
    .finally(() => {
      // Display tooltip
      document.body.appendChild(tooltip);
      
      // Remove tooltip after 2 seconds
      setTimeout(() => {
        tooltip.classList.add('fade-out');
        setTimeout(() => {
          document.body.removeChild(tooltip);
        }, 300);
      }, 2000);
    });
}

/**
 * Share content to Twitter
 */
export function shareToTwitter(shareText: string): void {
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  window.open(twitterUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Share content to Facebook
 */
export function shareToFacebook(shareText: string): void {
  // Facebook sharing requires a URL, so we'll share the game URL and use the text as the quote
  const baseUrl = window.location.href.split('?')[0]; // Remove any query parameters
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(baseUrl)}&quote=${encodeURIComponent(shareText)}`;
  window.open(facebookUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Function to generate share text with emojis
 */
export function generateShareText(puzzle: DailyPuzzle): string {
  if (!puzzle) return "";
  
  // Get current date
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  
  // Create header text
  let shareText = `Color Lock - ${dateStr}\n`;
  shareText += `Target: ${tileColorToEmoji(puzzle.targetColor)}\n\n`;
  shareText += `Score: ${puzzle.userMovesUsed} moves`;
  
  // Add medal emoji if move count meets or beats the goal
  if (puzzle.userMovesUsed <= puzzle.algoScore) {
    shareText += " 🏅";
  }
  
  shareText += "\n\n";
  shareText += "Today's Board:\n";
  
  // Add the starting grid
  for (let r = 0; r < puzzle.startingGrid.length; r++) {
    const row = puzzle.startingGrid[r];
    const rowEmojis = row.map(color => tileColorToEmoji(color)).join("");
    shareText += rowEmojis + "\n";
  }
  
  return shareText;
}

/**
 * Function to handle generic share action
 */
export async function handleShare(shareText: string): Promise<void> {
  // Try to use the Web Share API if available
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Color Lock Results',
        text: shareText,
      });
      console.log('Successfully shared');
    } catch (error) {
      console.error('Error sharing:', error);
      // Fall back to clipboard if sharing fails
      copyToClipboard(shareText, 'Result copied to clipboard!');
    }
  } else {
    // Fallback to clipboard for browsers that don't support Web Share API
    copyToClipboard(shareText, 'Result copied to clipboard!');
  }
} 