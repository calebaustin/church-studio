// Church marketing ideas the helper can bring up in passing ("why not try…"), never as rules.
// Distilled from the church marketing playbook (content mix, pillars, series, seasons, lead times, stories).
// Only a few ideas are handed to the helper at a time, picked for the moment: what's being asked, the month,
// what's coming up, and what the recent posts have been.

export const SERIES = [
  { name: 'Ask a Minister', idea: 'a 30 to 60 second answer to one real question people ask, like "How do I start reading the Bible?"', note: 'Collect questions from members and visitors; have leadership agree on answers before posting.' },
  { name: 'Sunday in 60 Seconds', idea: 'one thought from Sunday, one Scripture and one way to live it this week', note: 'A good Friday or Saturday "come back this Sunday" bridge.' },
  { name: 'Behind the Church', idea: 'meet the people who serve, or show what happens before Sunday', note: 'Makes the church feel approachable.' },
  { name: 'Bible in Real Life', idea: 'explain one passage in plain words and how it shapes an ordinary week', note: 'Evergreen; pair it with a blog post on the same topic.' },
];

export const PILLARS = [
  { name: 'Sermon', ideas: ['a 30 to 90 second clip that makes one complete point', 'a quote graphic with the line that landed', 'a recap blog that answers a question people search for'] },
  { name: 'Community', ideas: ['a volunteer or member spotlight (with permission)', 'a behind-the-scenes moment from Sunday morning', 'a thank-you post for kids, volunteers and families'] },
  { name: 'Educational', ideas: ['a short answer to a common Bible question', 'a faith-and-parenting tip', 'a short devotional'] },
  { name: 'Ministry', ideas: ['a spotlight on a ministry people may not know about', 'what a small group is actually like', 'a peek at the kids ministry'] },
  { name: 'Invitation', ideas: ['"what to expect on Sunday": parking, doors, how long, what to wear', 'meet the minister and staff', 'a personal invite graphic members can text a friend'] },
];

// Month by month: the lead emphasis, an evergreen topic and the natural invite moment.
const MONTHS = [
  ['reaching new people', 'how to start reading the Bible, with a reading plan', 'New Year Sunday'],
  ['community', 'marriage, friendship and love', 'bring a friend to small group'],
  ['reaching new people', 'what happened at the cross and why it matters', 'Easter invite cards'],
  ['community', 'resurrection hope and stories of changed lives', 'Easter Sunday'],
  ['ministry events', 'faith milestones and parenting through change', 'the summer series launch'],
  ['ministry events', 'short summer devotionals and faith at home', 'the summer series as an easy first step'],
  ['ministry events', 'serving the community, kids and faith', 'VBS for community families'],
  ['church family news', 'back-to-school prayer and teaching kids to pray', 'back-to-school Sunday'],
  ['community', 'Christian living and belonging', 'the fall series launch'],
  ['reaching new people', 'common faith questions (a good month for Ask a Minister)', 'a fall community event'],
  ['community', 'gratitude, generosity and missions stories', 'Thanksgiving'],
  ['reaching new people', 'why Jesus came and the hope of Christmas', 'Christmas invite cards and graphics'],
];

const MIX = 'A healthy mix is roughly a third each: value (clips, quotes, Bible answers), community (people, stories, thank-yous) and promotion (events, signups). Give before you ask.';
const LEAD = 'Promote big church-wide events 6 to 8 weeks out, registration events 4 to 6 weeks out, regular events about 3 weeks out.';
const STORY = 'Share real stories only with permission (and a parent\'s for minors); never health, hardship or private details.';
const GUARD = 'Lead with what the church is for, avoid church jargon, and write for someone with no church background.';

/** Is this a question about what to make, post or plan? */
export const asksForIdeas = (q) => /\b(post|posts|social|instagram|facebook|reel|reels|short|shorts|tiktok|content|idea|ideas|campaign|promote|promotion|plan|planning|calendar|week|month|engage|engagement|reach|grow|invite|blog|series|what should (we|i) (make|post|do))\b/i.test(String(q || ''));

/**
 * A few ideas for right now, as short lines. recent: { promos, total } over the last posts, if known.
 * Rotates which series and pillar ideas show, so the helper doesn't repeat itself.
 */
export function ideasFor({ now = new Date(), recent = null, soonEvent = null, budget = 'small' } = {}) {
  const m = MONTHS[now.getMonth()];
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const spin = Math.floor(now.getTime() / 86400_000); // changes daily
  const series = SERIES[spin % SERIES.length];
  const pillar = PILLARS[(spin + 2) % PILLARS.length];
  const lines = [
    `${monthName} is a natural month to lean toward ${m[0]}. A good evergreen topic: ${m[1]}. Invite moment: ${m[2]}.`,
    `A recurring series idea: "${series.name}", ${series.idea}. ${series.note}`,
    `A ${pillar.name.toLowerCase()} post idea: ${pillar.ideas[spin % pillar.ideas.length]}.`,
  ];
  if (recent && recent.total >= 4 && recent.promos / recent.total > 0.5) lines.push(`Their recent posts have mostly been promotions. ${MIX}`);
  else if (budget !== 'small') lines.push(MIX);
  if (soonEvent) lines.push(`${soonEvent} is coming up. ${LEAD}`);
  if (budget !== 'small') lines.push(STORY, GUARD);
  return lines;
}
