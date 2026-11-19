// Small words of encouragement, shown now and then: after an export or a post, on next-steps
// screens and at the foot of the dashboard. Drawn from a shuffled deck saved on this Mac, so every
// line shows once before any repeats.
export const NOTES = [
  'You are the light of the world. Let it shine.',
  'Go into all the world. Today, that includes a feed.',
  "It's not about likes. It's about the one who sees Jesus.",
  'Faithful in little things. This counts.',
  'Someone needed to hear that this week.',
  "The seed is sown. God gives the growth.",
  'How beautiful are the feet that bring good news.',
  'Small work, eternal echo.',
  'Every share is an open door.',
  "You're telling the best story there is.",
  "Behind every post is a person you're praying for.",
  'Let your light shine before others.',
  'Not by might, nor by power, but by His Spirit.',
  "Whatever you do, do it for the Lord. Even this.",
  'One more way for someone to hear.',
  'The word goes out and does not return empty.',
  "You're carrying Sunday into Monday.",
  'Well done. Keep going.',
  'Proclaim it from the rooftops. Or the timeline.',
  'This is ministry too.',
  'Thank you for making the message easy to find.',
  'A city on a hill cannot be hidden.',
  'Be ready to give a reason for the hope you have.',
  "Ordinary work, extraordinary news.",
  'Love made visible, one post at a time.',
  'Someone will find hope here this week.',
  'Plant faithfully. Leave the harvest to God.',
  "You didn't just make content. You shared good news.",
  "The church is bigger than the building. You're proving it.",
  'Make the most of every opportunity.',
  'Your work matters, even when no one claps.',
  'Let everything that has breath praise the Lord. Even the reels.',
  "Go tell it. You just did.",
  'Faithful, not famous.',
  'He is able to do far more than we ask or imagine.',
  "May the words of our mouths, and our posts, be pleasing to Him.",
  'Keep sowing. Harvest is coming.',
  "Grace, shared well.",
  'Thanks for showing up for your church today.',
  'Light travels farther than you think.',
];

const KEY = 'cs-encourage';
export function nextNote() {
  let deck;
  try { deck = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { deck = []; }
  if (!Array.isArray(deck) || !deck.length) {
    deck = NOTES.map((_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  }
  const i = deck.shift();
  try { localStorage.setItem(KEY, JSON.stringify(deck)); } catch { /* fine */ }
  return NOTES[i] || NOTES[0];
}
/** About one time in three, so it stays a nice surprise. */
export const maybeNote = (chance = 0.34) => (Math.random() < chance ? nextNote() : null);
