# Changelog

Every update keeps your sermons, designs, drafts and settings. Before a new version runs for the first time, Church Studio saves a backup of your settings.

## Unreleased

### New
- **Check the spots before you download.** The YouTube dialog plays the video right there. Scrub to a spot and press Start here or End here; click Start or End to jump the video to that time.
- **When a livestream's captions aren't ready.** If YouTube hasn't added captions yet, the dialog says how long ago the stream ended and about how many hours to wait before trying again.
- **Full-screen cards.** In a clip's Graphics tab, add a card at any moment. It covers everything for a while with the words being said, phrase by phrase or all at once with each word lighting up as it's spoken, or your own text, like a verse. Add a reference such as "Luke 22:19" above or below. Backgrounds can be mesh, gradient, pattern, solid or slowly moving (drift, glow or soft lights). Cards fade, blur or slide in from any side.
- **Video tab.** A clip's new Video tab holds the studio looks (moved from Framing), quick fixes for exposure, contrast, saturation and warmth, and a color wash that tints the picture one color.
- **Hook switch.** Turn the on-screen hook on or off in Title & hook; its settings show only when it's on.
- **"You often keep clips like this."** Suggested clips that look like the ones your church usually keeps get a star. It never changes the score.
- **Writing when you ask.** A sermon's writing opens empty, with the blog's title, keyphrase and description suggested from the sermon summary. Pick an angle and press Write post; the post's heading always matches the title you chose. Email, guide and devotional each have a Write it button, and social captions are written about a clip you kept or the blog post.
- **Spots to fill in.** Click the pill to jump to the next [bracketed] spot.

### Changed
- Progress bars follow the real work: bytes downloaded and audio transcribed.
- YouTube downloads fetch several pieces at once, which is faster when YouTube slows a single connection.
- How hard to look is a themed menu showing about how long each choice takes and how many looks it gets. Clip cards no longer show the helper's name.
- Every writing piece starts with a color band header in your first brand color.
- The setup list's "Done?" is a small bubble pointing at the circle.
- The clip editor's tabs are grouped with small dividers.
- The AI working wave is easier to see.

### Fixed
- The clip preview no longer stutters at cuts: the editor makes a small preview copy in the background that jumps across cuts smoothly. Exports still use the original.
- Moving color is no longer offered for clips with video.

## 0.26.0 · November 22, 2026

### New
- **Right-click any file or project.** In All projects, Videos and the Brand library, right-click a card for Rename, Move to, Link to campaign, Show in Finder, Delete project (or Delete clip, or Move to Trash for designs, writing and library files) and Delete source file. Delete source file asks first, then erases the video, export or file from your computer. A project keeps its transcript and clips, and you can add the video back later.
- **Move to and Link to campaign.** Move to puts the item in one of your folders, or makes a new folder for it. Brand library files move between Photos, Logos and the other library folders. Link to campaign ties the item to a campaign, and campaign cards in Social list what's linked, with a click to open it.
- **Shuffle brand colors in Design.** Shuffle (under Design colors) swaps the page's colors for your brand colors. Colors that matched still match, so all the gray text turns the same new color together, and text stays readable on its background. On a multi-page design, a toast asks "Apply to all pages?" to use the same color swap everywhere. Shuffle again for another look, and Undo puts it back.

- **Combine videos.** Videos › Make a clip › Combine videos puts a few videos together: one after another like a Reel, side by side, or top and bottom for two people talking. Pick vertical, square or wide, and skip a few seconds at the start of any video to line up two cameras. The result is a project like any other, ready to caption, clip and export.
- **Hears "um" and "uh" now.** Transcripts keep filler words (apart from the text, so captions and writing stay clean). They show faintly underlined in the clip editor's Words tab, and "Cut um and uh" is a switch with a count that takes them out with the air around them.
- **Cut stumbles.** One click cuts a small word said twice in a row, like "that, that", and leaves repeats said on purpose.
- **Clean up speech.** Light, Medium or Heavy in the Words tab cuts fillers, stumbles and long pauses in one go. Heavy also cuts "you know" and "I mean".
- **Progress bar.** In a clip's Look tab, add a thin bar along the top or bottom that fills as the clip plays, in your brand color or any color.

- **How hard to look.** Find clips has a new choice when an AI helper is on: Auto, Good, Better or Best. Auto reads the whole message, then takes a second look at the best moments. Good is quickest. Best reads every moment twice and checks the finalists again, for the steadiest picks. Your choice is remembered.

### Changed
- **Better clip picks.** Clip finding notices personal stories and the line they land on, rhythm like "It's His love that…", and gives a story room to finish. The AI helper reads the start and end of each moment, looks across the whole message, and rates hook, stands alone, payoff and feeling, so scores spread out and each clip's reason names its own key line. Moments read more than once are averaged, so one odd rating can't decide a clip, and the two best stories that land their point keep a place in the picks.

### Fixed
- Pasting or typing a full hex code in a Brand kit color no longer closes the color picker right away. You see the color first and close it yourself.

## 0.25.0 · November 21, 2026

### New
- **More detail on long tasks.** Downloads show their speed and time left beside the bar. Hover the progress card for the details: size so far, speed and which part is downloading; the Whisper model, position in the audio, words so far and pace while transcribing; frames and render speed while exporting; plus time spent and time left. Updates and the CS Helper download show speed too.
- **Text-only announcements.** Every template pack has a text announcement that needs no photo, in four layouts (Big type, Color block, Badge and Poster), filled in from your event. A new "With a photo / Text only" switch in Design templates finds them, and searching "text" works too.
- **Bold and italic shortcuts.** In Design, Command-B and Command-I make the selected text box bold or italic, even while you're typing in it.
- **Sermon pages of their own.** A Sermon's page is now its own item in All projects, with its own tile, linked to the video it comes from. It opens on its own with a "Video and clips" button, and the video has a "Sermon page" button beside its steps.
- **A sermon summary, right after transcribing.** With an AI helper on, Church Studio sums up each part of the sermon as soon as it's transcribed. The Sermon page's main points and new Next steps come from it, and the blog post, email, discussion guide and devotional are written with it, so each part knows where the whole message is going and the blog's sections don't repeat each other. Older sermons get a "Sum up with AI helper" button.
- **Watch a clip before you pick it.** Clicking a suggested clip plays it on a loop with simple captions and a countdown in the corner.
- **Full-screen slides flagged.** Clips where a sermon slide fills the screen get a "Full-screen slide" tag, found on this Mac with Apple's Vision framework.
- **Move and size the hook and captions in the preview.** Drag the hook or captions to move them, drag the sides to change the width and the corner to change the size. The sliders follow along, and each drag is one undo step. The hook gets its own font.
- **Email, discussion guide and devotional with your helper.** "Write with AI helper" writes them from the whole sermon, not just its first part.
- **Watch the blog being written.** Rewriting with a helper shows the working wave over the text, and paragraphs appear as they're written.
- **Logo versions.** In Brand library, make a white version of a color logo, or a color version of a white one (logos with a see-through background).
- **Photo tags.** With an AI helper on, photos you add get three or four tags, found on this Mac. "Add tags" in Brand library tags the ones you already have.
- **Your social pages, for a quick look.** Add your Instagram, Facebook, YouTube and TikTok links in Social › Accounts and open them in a Church Studio window. Sign in once there if a page asks, and it remembers. No developer account needed.
- **Illustrations first in the Sermon index.** Stories and illustrations are graded and sort by best or most recent.
- **Check off setup steps yourself.** Click a step in the setup list, then click "Done?" to check it off.

### Fixed
- In a post's campaign strip, clicking another post opens it, from the Social screen as well as the Calendar.
- After downloading just the sermon, the transcribe step no longer asks whether to transcribe the whole video, and the sermon is already marked.
- The clip finder's progress bar moves steadily while CS Helper works through its batches.
- Playback no longer freezes at cut words in the clip editor, and cuts keep the end of the word before and the start of the word after, so they sound natural.
- Clip reason tags wrap instead of stretching the card.
- Website colors from Jumpstart come from your logo and the site's own colors, not a photo.

## 0.24.0 · November 21, 2026

### New
- **Blog posts that read like writing.** Rewriting a blog post with CS Helper or another AI helper now writes it one part of the sermon at a time, then the title, intro and closing, so even an on-device helper writes real paragraphs instead of stitching transcript lines together. Posts follow the shape good sermon recaps share: a hook and the big idea up top, four or five short sections with headings that state each point, Scripture named inline, a closing that applies it, and an invitation with your service times. Everything is checked against the sermon: quotes must be the sermon's own words, and numbers must appear in it.
- **Writes in your church's voice.** When your blog is connected, the helper reads the post closest in topic as a style example, so its voice and rhythm match your own posts. If your blog isn't connected yet, Church Studio tries your church website once the first time the helper writes.

### Changed
- **Cleaner drafts without a helper too.** Drafts use whole sentences instead of cut-off pieces, leave out filler and repeated phrases, skip the opening small talk and the closing invitation, and split the message where the preacher turns to a new point or passage.

## 0.23.0 · November 21, 2026

### New
- **Writing learns from your blog.** Connect your blog in Calendar › Inspiration and your 8 newest posts become brand voice writing samples, so writing help sounds like your own posts. When the blog's feed only has a summary, Church Studio reads the full post from its page. They show as "From your blog" in Brand library, update each time new posts are found, and a switch on the blog panel turns this off.
- **Select words to cut or replace.** In the transcript, drag across words (or click one and shift-click another) and a small bar offers Cut and Replace. Replace fixes a phrase the transcription heard wrong, and captions use your words.

### Fixed
- **Smoother cuts.** Cutting a word or a whole sentence used to leave the little pauses around it, so clips felt jumpy. Now the clip goes straight from the last kept word to the next one.
- **CS Helper no longer seems stuck at 40% when finding clips.** It now reads the moments a few at a time and the bar moves as it goes. If it's slow on your Mac, it keeps the app's own picks for the rest instead of waiting.

### Changed
- **More of your fonts.** Font menus already list the fonts installed on your Mac, including ones you've added yourself. They now also include fonts you turned on in Adobe Fonts and the extra Apple fonts you downloaded in Font Book. Fonts you install while Church Studio is open show up the next time you open a font menu, with no refresh needed.

## 0.22.0 · November 21, 2026

### New
- **Start fresh.** If a setting got changed by mistake, Settings has a Start fresh button in its own small panel under the list. It explains what clears and what stays, and asks if you're sure. Everything cleared goes into one folder in the Trash, so you can get it back until you empty the Trash. Downloaded helper programs stay.

### Fixed
- **YouTube works on Macs without developer tools.** On a Mac that had never had developer tools installed, connecting a YouTube channel or downloading a video failed with "certificate verify failed". Church Studio now uses the Mac's own list of trusted certificates, so secure downloads work on every Mac. This also covers downloading transcription models.
- YouTube errors are in plain words now ("Couldn't reach YouTube. Check your internet connection.") instead of the downloader's technical message.

## 0.21.0 · November 21, 2026

### New
- **Fix a word in the transcript.** In the clip editor, click and hold a word to fix one the transcription heard wrong. Captions use your spelling from then on. Click a word to cut it, and click a gray word to add it back.
- **Six more basic shapes:** triangle, equal triangle, diamond, pentagon, octagon and star.
- **Six more arrows:** U-turn, circle, zigzag, dashed, split and tag.
- **New clip or New design, right from a post.** In a post, the clip and design pickers now start with New clip and New design. A new design starts from the campaign's event, with its name, day, time and place filled in, and stays tied to the campaign. A new clip starts in your latest sermon's clip picker.

### Changed
- Click anywhere on a draft or scheduled post to open it. The Edit button is gone, and Delete is a small icon in the corner.
- The clip and design picker is always open in a post, so there's no extra Attach button.
- Switching between Basic, Accents and Arrows glides straight to the tab you tap.
- "Make colors work together" is now "Tint the palette", which says what it does: it nudges your five design colors toward one color so they feel like a set.
- Long writing titles stay on one line in previews, ending in "...".
- Removed the extra help line under the layers list.

## 0.20.0 · November 21, 2026

### Changed
- **Fill and the eraser share one line.** The eraser switch now sits next to Fill, with a small eraser on its knob and the word Eraser beside it, so shape settings take less room.
- **Tidier settings panels.** Settings that sat alone on a line now share one with their neighbor, so there's less scrolling. In Design: the align buttons are icons, so All caps and Italic fit beside them; Size, Turn and Corners each sit next to Opacity; Flip is two small buttons; Background sits next to Darken; and Brand colors moved up beside the Design colors heading. In Writing: Rewrite post and the AI helper switch ride at the end of the angle choices, and the header buttons sit inside the empty header box. In the clip editor: the intro and end cards keep their length and motion on one line, and Make one in Design sits beside Pick a graphic.
- **Clearer switches everywhere.** Every on/off setting is now a switch with a small icon on its knob that shows what it does: a bell for notifications, captions for captions, a palette for brand colors, a droplet for liquid glass and so on. Labels are shorter too ("Captions" instead of "Captions on"), and a few settings that were plain checkboxes, like burning in captions or remembering export settings, are now switches. Lists you pick from keep their checkboxes.

## 0.19.0 · November 21, 2026

### New
- **Swipeable carousels in every template pack.** Seventeen new carousels, one in each pack's look, built to swipe like one long picture: ribbons, winding paths, blobs, circles and color blocks run across the edges between slides so each swipe slides along the same scene. Each is a sermon recap (filled in from your sermon), a first Sunday guide for visitors, or a Bible basics list, and you can change every word.
- **Accent shapes.** A new Accents tab next to the basic shapes: soft blobs, a pebble, a drop, a ribbon wave, a wave edge, a swoosh, a quarter circle, a ring, a leaf, a sparkle, a dot grid, squiggles, a zigzag, wave lines and an underline. Swipe between tabs or tap one. Filled accents can hold a photo too.
- **Arrows.** An Arrows tab with block, straight, curved, wavy, loop, bent and two-way arrows, chevrons, triangles and a swipe arrow. Every shape can now be turned and flipped, and line shapes have a thickness setting.
- **Extend onto the next page.** Drag a shape or picture past the edge of a page and Church Studio asks, "Extend to the next page?" Say yes and the rest of it appears on the next page, linked: move, resize or recolor either piece and the other follows, so they always meet at the edge. Right-click a piece's layer to unlink it. The carousels' shared shapes are linked the same way.

### Changed
- **The menu bar icon is now just our handwritten CS**, with nothing behind it, so it sits in with your other menu bar icons.

### Fixed
- The shape grid no longer disappears in a narrow window.

## 0.18.0 · November 21, 2026

### New
- **Church Studio in the menu bar.** Click the small icon at the top of your screen for a quick look without opening the full app: jump back into what you were last working on, see the week ahead with events and planned posts, check off what's left for this Sunday's sermon, and see how many posts and clips you've made this week. Tap anything to open it in Church Studio. Turn it off in Settings > App theme.

## 0.17.0 · November 20, 2026

### New
- **Six new template packs.** Sanctuary (a quiet monograph serif), Table (one warm ink, like a supper-club poster), Vesper (soft and literary), Daisy (sunny and friendly, for kids and family), Poster (loud and quotable) and Quarterly (a considered editorial). Each has an event post and story, a welcome, an announcement, a sermon quote, a verse and a series slide, with your church's details filled in. They use fonts built into your Mac, so they work offline, and "My brand colors" switches them to your colors.
- **Change a color or font everywhere.** Change a color or a font in a design and a small prompt appears in the canvas: "Change it everywhere?" with how many other places use it. Press **Change all** to update every text, shape, outline and background on every page or slide, in one step you can undo. It goes away on its own after a few seconds (hovering pauses it), or press × to skip.
- **Font pairing in Design.** One pick in the page settings restyles every heading and body line in a design, starting with your brand fonts.
- **Content ideas from the helper.** Ask what to post or plan and the helper brings in ideas that fit the moment: the month's natural focus and invite moment, a recurring series to try (like Ask a Minister or Sunday in 60 Seconds), a good balance of helpful, community and event posts, and when to start promoting what's coming up. Suggestions, never rules. "What to work on today" now ends with one fresh idea to try.
- **Design tips from the helper.** In a design, it can mention a tip when it helps, like keeping a social graphic to a few words or keeping text clear of a story's edges.

## 0.16.1 · November 20, 2026

### Better
- **No more empty gray boxes.** Things without a picture yet now show a real preview: writing shows as a page with its title and first lines, audio sermons and videos without a cover get a tile in your theme's colors with the title, and designs without a preview show their own colors.
- **Cleaner clip hooks from CS Helper.** On-screen hooks stay a few words long, and clip scores use the same scale as other helpers.
- Blog titles no longer end with a stray comma.

## 0.16.0 · November 20, 2026

### New
- **The Sermon page.** Each sermon's last step is now its own page, the hub for everything made from it:
  - **The sermon at a glance:** its main idea, date and length, series, the Bible passages read (tap one to open the transcript right there), its main points and themes, and links to the transcript and the video.
  - **The sermon plan:** every way to share it, what's made, and one tap to make the rest.
  - **Tied to this sermon:** clips, writing, designs, posts and campaigns made from it, each one tap to open. **Link something** ties in anything you've already made, and the × unties it.
- **Sermons are their own project type.** When you find the sermon in a recording (the Find the sermon step), it becomes a Sermon. Keep working right where you are in Videos, where it's labeled Sermon, or find it later under All projects › Sermons, which opens it on its Sermon page. Other recordings stay Videos. Sermons you've already found count right away. A Sermon page can also mark a recording as a sermon, or take one out of Sermons, by hand.
- **"From sermon" everywhere you make things.** The design editor, your own writing, and new posts each have a **From sermon** picker, so they show up on that Sermon page. A post with a clip or design brings its sermon along.
- **Connected search and helper.** Search finds items by the sermon they came from (like "grace blog"). The helper knows what's been made from a sermon, shows a design's sermon at the top of the chat, and its sermon links open the Sermon page.

## 0.15.0 · November 20, 2026

### New
- **Links in helper answers.** When the helper mentions one of your events, sermons, designs, writing, campaigns or brand pictures, the name becomes a pill you can click to open it. The chat stays open while you go.
- **Next steps under answers.** Answers that touch an event or a sermon offer one-tap next steps, like **Start a campaign** (connecting the event and the sermon), **Make a graphic** or **Open the transcript**.
- **Pictures from your Brand library.** In a design, the helper knows your brand photos by name and description. Ask for a picture, or tap **Pick a photo**, and press **Add**: it fills the selected photo spot, or goes on the page.
- **It knows what's selected.** In a design, "this" means the item you've selected (or the whole design). If it isn't sure what you mean, it asks.
- **Saved chats.** Each chat is saved and named by its first question. Press **New chat** to start fresh, or the clock to open a past chat. Delete any you don't need.
- **The helper grows from its button.** Tap the helper button and it grows into the chat; press the minimize button in its top corner and it shrinks back into the button.
- **"Wondering what to work on today?"** Open the helper on the Dashboard, or use the new card at the top of Inspiration, for a few real places to start (events with no posts yet, sermons with clips or writing left, a new video on your channel), each with a button that starts it.
- **AI Helper tips.** A list of the kinds of things you can ask, by tool. Tap one to try it.
- **It knows its way around.** Ask where a setting is or how to do something, like "Where do I change our service times?", and the helper answers with a link straight there.
- **Bible references for writing.** Ask for verses on a topic and the helper suggests real references, from verses that use those words and ones your minister has preached. Church Studio now includes the World English Bible (public domain), so each reference is checked (made-up ones are removed) and shown with its exact wording. The helper never writes verse wording itself.
- **Belief questions point to your minister.** The helper doesn't answer questions of belief. If your minister covered it in a saved sermon, it shares a short line of what they said, with a link that opens the transcript right at that spot. If not, it says that's a question for your minister.
- Links to a sermon's Transcript, Clips or Content plan now open on that step.
- **Image Playground in Design.** With Apple Intelligence on, the helper offers ready prompts for the design you're in, like "An illustration of Fall Harvest Festival", or "Restyle the selected picture". Apple's Image Playground opens with it, and the image you pick goes onto your design and into your Brand library.
- **A working wave.** While an AI helper works on something, a soft wave of color moves over that panel: the design canvas, the writing, or the clip panel. Rewrites in Writing show it too.

### Better
- The helper's header keeps its width: long names end in "…".
- Notifications keep only the big things you might have missed: finished exports, downloads and transcripts, work that didn't finish, updates, and "working locally" notices. Small confirmations no longer pile up there.
- The design editor's right panel never scrolls sideways. Long layer names end in "…", rows wrap, and the background choices (Gradient to Photo) fill the width.
- The left menu fits a full-screen window on a 13-inch MacBook, with slightly smaller buttons.

## 0.14.0 · November 20, 2026

### New
- **AI helpers that run on your Mac.** Settings › AI helper now has four choices: Off, Apple Intelligence, CS Helper and External AI. It's still off unless you turn it on.
  - **Apple Intelligence** comes first. It uses the AI built into your Mac, privately, with nothing to download.
  - **CS Helper** is your own AI that works only inside Church Studio. Download it only if you want it: a one-time 2 GB download, then no internet needed. You can pause the download, and a clear **Delete from this Mac** button on the same card frees the space when you're done with it. (Built with Llama.)
  - **External AI** connects Claude, ChatGPT or Gemini. These work only online and need your own account with them, which may cost money.
- **The helper chat.** With a helper on, a button in the corner opens a chat about what you're working on. Your design, clip, sermon or writing shows at the top. It knows your church's calendar, sermons, voice and brand from Church Studio, and it sticks to them: it won't make up events, names or Bible references.
- **Helper Passes.** One tap for ideas on the page you're on: hooks, titles and captions for a clip, headlines and a caption for a design, titles and openings for writing, and plans for the week. Press Use to put one right on the page; Undo takes it back.
- **Smarter tools.** With a helper on, clip picking, titles, and writing polish and rewrites use it automatically.
- **"Try it with Apple Intelligence!"** If your Mac has it and no helper is on, the welcome card on each tool offers to turn it on.

## 0.13.2 · November 20, 2026

### New
- **Four base looks, each with a night version.** Olive (the standard), Sermon (blue and coral), and two new ones: Classic (tan, classic blue and honey yellow) and Clay (warm cream, heirloom tomato and tawny). Each has a matching night version: Olive Night, Sermon Night, Classic Night and Clay Night. Morning Sage, Night and Evening Glass are retired; if you used one, you're moved to Olive or Olive Night. Pick yours in My App.
- **A clear next step after an update downloads.** A big prompt shows what to do: quit Church Studio, drag the new version into Applications, choose Replace, and open it again. There's a Quit Church Studio button right there. Your work is never touched by an update.

### Fixed
- The sidebar highlight snaps to size when you resize the window, instead of animating.

## 0.13.1 · November 20, 2026

### Fixed
- **The menu scrolls in a short window.** When the window is too short to show every button, the left menu scrolls instead of hiding Settings and the buttons below it. The idea card steps aside first to make room.

## 0.13.0 · November 20, 2026

### Better
- **A calmer standard look.** The new Olive palette is the default: a warm off-white leaning olive, leaf green and a soft clay accent, with Olive Night for dark mode. The background is one still color with a faint frosted grain instead of moving color blobs, and panels sit on top as mostly solid cards. Moving between screens also uses less of your Mac. If you picked another theme on purpose, you keep it; the other themes are still in My App.

- **The app feels alive.** Things move like real objects now, on springs instead of flat fades. Buttons press in and spring back. Switches stretch while you hold them and snap across. Slider knobs grow under your finger. In the sidebar, tab rows and every picker, the highlight glides to your choice with a slight liquid stretch, and stays smooth even while the next tool is loading. Switching tabs slides the new panel in from the side you moved toward. Screens settle in panel by panel, and dialogs, menus and messages grow in from where they start. Nothing moves while the app sits still, and Reduce motion in macOS turns it all off.
- **Night, a true dark theme.** Neutral dark grays with no tint, for a dark room. Pick it in My App.
- **Every color comes from the theme.** The app's own colors all run through theme settings, so themes stay consistent as things change.

### Removed
- **Church logo in the Dock.** The Dock always shows the Church Studio icon now. Your logo still shows at the top of the menu.

## 0.12.0 · November 19, 2026

### New
- **Studio look for clips.** In the clip editor's Framing tab, a small Studio look card gives a quick lighting pass: eight looks (Clean, Warm, Cool, Bright, Punchy, Film, Soft, Black and white) with a strength slider, a lighting lift that brightens faces and shadows without blowing out bright spots, and a background blur that softens the edges and keeps the speaker sharp. Captions and graphics stay crisp. The preview is close; the export is exact.

### Better
- **Wide clips preview wide.** A wide clip now shows in a 16:9 frame in the editor, the whole shot, just like the export. Quick renders of wide clips come out wide too.

## 0.11.0 · November 19, 2026

### New
- **Six new template packs.** Meadow, Pulse, Grove, Ember, Dusk and Collage, each with an event post, event story, welcome, announcement, sermon quote, verse and series title slide. Built to be plug and play: your church's name, minister, website and service times fill in, and most need just one photo.
- **Make from template, from any event.** Click an event on the calendar and choose Make from template. Every event template already shows that event's name, day, time and place. Pick one and it opens with the photo spot selected, so adding a photo is the last step. Use my brand colors switches any pack to your colors. Planning a post from an event offers Make from template or From your computer.
- **Photo edits in Design.** A color wash in your brand colors (tint, darken or lighten), one-tap looks (Duotone, Deep tint, Warm, Cool, Faded, Moody, Black and white, Soft focus), and sliders for brightness, contrast, color, warmth, black and white, and soften. Works on photos, photo spots and background photos.
- **Layers.** A layers list under the page settings and under any selected item: click to select, drag to change what's in front, or delete.
- **Eraser depth.** An eraser can cut through everything under it, or only the layers right under it, so the background stays.
- **New shapes and backgrounds.** Wavy photo frames, scalloped badges, starbursts, window cards and outlined tags. Pattern backgrounds (checker, grid, dots, stripes) and film grain on gradients.
- **Two speakers.** A new clip layout puts one person on top and one below, cropped from the same shot. Great for interviews, panels and two hosts.
- **Messages from every account.** Social › Messages gathers comments from Instagram, Facebook Pages and YouTube (and mentions from Mastodon), newest first.
- **Campaign header.** Any post or design that's part of a campaign shows the campaign at the top: its name, day, time, place, link, website and a hashtag, each one click to copy, plus every post in the campaign with this one marked. Jump between the campaign's posts from there.
- **A friendlier start.** The welcome is three short steps: what Church Studio is, a jumpstart from your website, and one place to start. Each tool says hello the first time you open it, with a few ways to try it.
- **Tag a batch of photos.** Add several pictures at once and Church Studio asks what they are, then adds a description and tags to all of them for search.
- **Seasons you mark.** Turn off seasons your church doesn't observe, like Advent or Lent. They leave Inspiration and the calendar. Seasons now show on the calendar too.

### Changed
- Templates show in your brand colors by default, with a switch to see each pack's own colors. Every color in a template follows your brand, not just the main ones.
- Social accounts put Instagram, Facebook and YouTube first. TikTok, X, LinkedIn, Threads, Bluesky, Telegram, Discord and Mastodon are under Other social media.
- The Brand library has three tabs: Brand kit, Voice and Files.
- Writing's bar keeps the main actions in view and puts the rest in a More menu.
- Design's bar is six choices: Create new, Design, Video, Social, Print and Custom. Each opens the kinds of design inside it.
- Custom size shows a live preview of the canvas shape and size.
- Your church name, minister, website, address and service times fill into templates. Church info has a new Minister name field.
- Clicking outside the page in Design puts the selected item down.
- Speaker notes only show for presentations.
- Writing starts with Blank post.
- Logos have a delete button on the tile.
- Feedback can go to a form service or an email address, not only GitHub, and a copy stays on your Mac.
- Fonts in designs always load before drawing, so heavy weights show right away in previews.

## 0.10.0 · November 19, 2026

### New
- **Calendar, its own place.** Calendar moved out of Social into its own tool, with three tabs: Calendar (church events, scheduled posts and planned campaign posts), Campaigns and Inspiration. Social is now for posting, scheduling and comments.
- **Search everything.** Press ⌘K, or Search in the sidebar, to search sermons (including what was said in them, with the moment it was said), clips, writing, designs, posts, campaigns, brand library pictures, your blog and church events. Plain phrases work without AI: "sermons about prayer from last fall", "flyers from October", "clips on hope this year". Related words count too, so "prayer" also finds "pray".
- **Tags and archive.** Tag any sermon, clip, writing or design from All projects, browse by tag, and search by tag. Archive things you're done with: out of the way, never deleted, still searchable. All projects also shows possible duplicates, and how many times a clip or design has been posted.
- **Backups.** Back up settings, transcripts, clips, writing, designs, posts and campaigns, with or without the brand library, in Settings › Backups and sharing. Turn on weekly backups (the newest four are kept), and save them to Documents or a cloud folder. Restoring opens a backup as a new workspace, so nothing is replaced. Keys and passwords are never in a backup, and videos are left out because of their size.
- **Share a project.** Share any sermon with its transcript, clips, writing and designs as one file, with or without its video. A teammate brings it in as a new project and can add the video later.
- **Team folder in Google Drive, Dropbox, OneDrive or iCloud.** Church Studio finds the cloud folders on your Mac. Pick one as your team folder, share projects there, and teammates see them in Settings to bring in. No accounts needed.
- **Inspiration.** Now a tab in Calendar. See what your church has been saying this month, quarter or year, across sermons, writing, posts and your blog. Find blind spots: topics most churches come back to that you haven't touched lately, with when each last came up and a button to write about it. See church seasons coming up (Advent, Lent, Easter, Pentecost and more) with ideas and a nudge to start three weeks ahead, your scripture balance, and the topics you return to most.
- **Your blog.** Connect your blog and Church Studio reads its public feed (WordPress, Squarespace, Wix and most others), keeping a growing history on your Mac. See how often you post, days since the last post, and ideas for the next one: sermons without a blog post yet, quiet topics, and older posts worth sharing again. Jumpstart finds your blog automatically.
- **Year in review.** One click makes a story set of your year: messages preached, the books you spent the most time in, the topics you kept coming back to, what you made and shared, your busiest month and longest streak. It opens in Design, in your brand, ready to edit and post.
- **Background eraser.** Clear a white or plain background off a logo or picture, around the outside or inside letters too, with a strength slider and a light, dark and see-through preview. Saves a new copy and keeps the original. Find it in a logo's ⋯ menu, on brand files, and on pictures in a design.
- **Campaigns.** In Social, plan a run of posts for a church event, a sermon or anything else. Church Studio suggests each post (save the date, invite, countdown, today, thank you; or preview, recap, clips, quote and question for a sermon) with a caption to start from, and puts them on the calendar as planned drafts. Add a design or clip and schedule each one. Start one from an event card, a sermon's content plan, or the Campaigns tab.
- **Repeat for next time.** Repeat a campaign for a monthly or yearly event and every post moves with the new date, with its caption, design and clip. In Design, **Copy for a new date** makes a copy of a design with every date in its text rewritten.
- **Newsletters.** A new Newsletter in Writing, built from Sunday's message, the next two weeks of your church calendar and a verse from the sermon. Copy formatted gives email-ready HTML in your brand colors and fonts, with your logo and button links, for Mailchimp, Flocknote, Constant Contact or Gmail.
- **Rewrite for an audience.** Rewrite any writing for guests and newcomers, kids, students, volunteers, or as a short version. Works offline with plain-language rules, and does a fuller job with an AI helper turned on.
- **From your computer, everywhere.** Every picture picker has From your computer and drag and drop, for graphics made in Canva, Photoshop or anywhere else. Posts can attach a video or picture from your computer. Design has Bring in your own to turn any picture into a design you can resize, add to or post.
- **Worth sharing again.** Social suggests good posts from three or more months ago to share again.
- **Alt text for photos.** Add alt text and tags to any picture in your brand library, copy it when you post, and search by it. With an AI helper turned on, Suggest writes a first draft.

### Changed
- The brand kit says which logo files work best: SVG, or PNG with a see-through background.
- SVG logos work as your primary logo in the menu and Dock.
- Jumpstart finds a church's mission statement more reliably, skipping welcome text, headings and buttons.
- Planned campaign posts show on the calendar with a dashed outline.
- Moving between screens uses about 40% less CPU: the background glide is quicker, since every frame of it redraws the glass.
- Transcribing, exporting and downloads run a step below normal priority, so the app and your Mac stay responsive while they work. They're just as fast when nothing else is running.

### Fixed
- Bringing in a file with the same name as one already in your brand library no longer replaces it.
- Changing the clip or design on a saved draft post now saves.

## 0.9.0 · November 19, 2026

### New
- **Jumpstart.** In My App. Enter your church website, your YouTube channel and what you want to make first, and Church Studio pulls your logo, colors, fonts, address, phone, email, service times, social links and voice. You see your brand on a post, a clip and an email footer before anything is saved. Skip it any time.
- **Export and import settings.** Share your brand kit, logos, brand voice, church info, links, themes and preferences as one small .zip, for another Mac or a teammate. Pick what to include and which workspaces. Import into the open workspace or a new one. Projects, videos, passwords and keys are never included.
- **Create new in Design.** The first button opens everything you can make: guided makers, clip intro and end cards, every design type with its templates, and any custom size. A plain "Design" type starts you on a blank canvas.
- **Plan a post from a design.** Designs now attach to posts, alongside clips, and the post picker can show one project's clips and designs. From a sermon's content plan, planning a post starts with that project.
- **Pop-up styling.** Pop-ups get text and background colors, background strength, size, all caps, an accent bar color for lower thirds, and one-click brand looks. The export matches the preview.
- **Two-week calendar.** On the Social calendar, This week shows this week and next with taller days. This month goes back.
- **Set aside content plan pieces.** Hide pieces that don't fit your church. They stay as ideas but leave the count, so the ring only tracks what you care about.

### Changed
- Church Studio rests when you do. Sitting idle used about half a CPU core to keep the background moving behind every glass panel. Now the background stays still and glides when you change screens, so idle use is close to zero. Screens also fade in as you move between them.
- Background refreshes pause while the window is hidden, and the brand library checks for new files less often.
- The clip editor stops redrawing its preview while a clip is paused.
- My App: your activity sits in the right column under the welcome card. Jumpstart sits under Your setup.
- Brand library: search and folder filters moved down to a new Brand files section.
- Export options: Remember settings and Export stay at the bottom while the options scroll under them. Every pop-up got the same fix for a gray band at the bottom.
- File sizes past 1 GB show as GB, like 1.4 GB.

### Fixed
- Logos in the brand kit fit their tile instead of covering their name.
- When daylight saving time ended, the calendar showed the same date twice (a Sunday and a Monday both labeled 1).
- Streaks no longer break at a daylight saving change.
- A new pop-up started hidden in the preview because it was at the start of its fade. Paused previews now show pop-ups fully.
- The brand checklist steps for colors and fonts now check off.

## 0.8.0 · November 19, 2026

### New
- **Slide deck maker.** Pick sermon or class, add a title and key passages, choose headlines only, full bullets or a mix, and whether to show discussion questions. Paste your notes (or open a notes file) and headings become slides, or build from a transcribed sermon, or start one slide at a time.
- **One design, many sizes.** Resize makes copies of any design for posts, stories, slides, YouTube, Facebook covers, flyers and banners. The layout carries over.
- **Scripture graphics.** Type a reference any way you like ("first corinthians 10 16") and it's written the standard way, with your verse laid out in your brand.
- **Event flyers and countdowns.** From any church calendar event, make a flyer or a countdown story set (7 days, 3 days, 1 more day, today).
- **Print shop PDFs.** 300 dpi with bleed and crop marks, plus half-letter, 11x17 and 18x24 poster sizes.
- **Intro and end cards for clips.** A graphic for the first seconds of a clip, and one for the last, each with a fade, slide or zoom. New "Clip intro card" and "Clip end card" templates in Design.
- **Support Church Studio.** The Thank you page has a Buy me a coffee button. Church Studio stays free to use, forever.

### Changed
- Text in designs never ends with one word alone on its last line.

## 0.7.0 · November 19, 2026

### New
- **Content plan.** Every sermon has a plan showing the 15 or so pieces you can make from it (clips, blog, email, discussion guide, devotional, captions, quote graphic, carousel, story, slides, notes, thumbnail, podcast and posts) and which are done. One click makes the next one, and everything links back to the sermon.
- **Devotional series.** Turn a sermon into a 3, 5 or 7-day devotional, with a reading, a reflection question and a prayer for each day.
- **Podcast episodes.** The sermon's audio, cleaned up and leveled for podcasts, with intro and outro music from a new Audio folder in your brand library, your logo as cover art, and show notes.
- **Sermon index.** In Videos: every scripture reference by book, the stories and illustrations you've told (make a clip from any of them), recurring themes, series, and a content gap report you can save and share.
- **Start from scratch.** Every way to start in Videos can begin from source content, a video you already have, or a blank editor. Add a video or recording later.
- **Your activity.** My App shows how much you've made in the last week, month, quarter or year, with weekly averages. The dashboard card links there.
- **Notifications.** Missed a message? The Notifications button above My App shows recent ones as a stack of cards, with Dismiss all.

### Changed
- Work that's waiting shows as "Up next" under the running task, and the tray can shrink to a progress ring.
- Idea cards in the sidebar fade between ideas, and can be hidden for an hour.
- Scrolling pages tuck under a rounded edge instead of running into the top of the window.
- Caption themes: a podium in the preview, tabs for captions and the hook, and app previews sized to fit.
- Every switch can be dragged as well as clicked.
- Social opens on the calendar. The Videos home has a single "Add YouTube link" field and shorter buttons.
- The Dock badge is a corner tab in a dark color from your logo.
- Small group guide is now Discussion guide.
- Encouraging notes are simple spiritual nudges.

### Fixed
- Logos show at their real shape in the Brand kit.
- The scene strip stays right under the video while transcribing.

## 0.6.0 · November 19, 2026

### New
- **Three ways to start in Videos.** Clips from a video, make a wide video (announcement or podcast), or make a single clip (from a short video, or a lyric clip from audio). Each shows its steps.
- **Keep means keep.** Kept clips are saved to the video, ready to edit and export. A bar shows how many you've kept and takes you straight to editing them.
- **Edit your clips in a row.** The editor shows your kept clips in a strip. Flip between them and your changes save as you go. Export all, schedule, or save for later.
- **Come back to more.** A video with kept clips opens in the editor. "Cut more clips" takes you back to find more.
- **Text pop-ups.** Add text that comes in and out at the times you choose, as a pill, a lower third or plain text, with a fade, slide or pop. Add an event straight from your church calendar.
- **Lyric clips.** Audio with captions over your brand colors, moving slowly. Great for podcasts and songs.
- **Join clips into one video.** Pick several clips and export them as one, in order.
- **What's next?** After an export, a design or a finished blog, see ways to reuse it: post it, write about it, make a quote graphic and more.

### Changed
- The transcribe step shows the three steps to share-ready clips.

## 0.5.0 · November 19, 2026

### New
- **Your dashboard, more personal.** Streaks replace the weekly goal: see how many weeks in a row you've shared clips, posted, written or designed. New widgets show upcoming church events, scheduled posts, work to jump back into and ideas for what to make next, ordered by the work you do most.
- **Fresh ideas in the sidebar.** The card above My App rotates through ideas for the tools you use.
- **Logos.** Mark a primary logo, label light, dark and icon versions, replace a logo, show it in Finder or move it to the Trash.
- **Brand kit.** Colors are labeled Primary, Secondary, Text, Background and Accent. Drag them to reorder, and see them on a website card, a social post and a video caption.
- **A little encouragement.** Now and then, a short word of encouragement after an export or a save, and at the foot of the dashboard.

### Changed
- Graphics is now **Design**.
- The Church Studio name in the menu uses the Caveat font.
- The Dock badge is a rounded square with enough contrast to stand out on any logo, including white ones.
- Setup checklists show just the next step, with a button to see them all.
- Updating is clearer: **drag Church Studio into Applications and choose Replace.**
- Downloads keep the same name every release, so one link always gets the newest version.
- Official releases are for Macs with Apple chips. Intel Mac downloads are no longer included; instructions for building one are in docs/INTEL.md. Intel copies already installed keep working.

## 0.4.4 · November 18, 2026

### Fixed
- Long event names on the calendar stay inside their day instead of running into the next one. Hover an event to see its full name.

## 0.4.3 · November 18, 2026

### New
- **Intel Macs.** Church Studio now runs on Intel Macs too. Each release has two downloads, one for Apple Silicon and one for Intel, and Settings › Updates picks the right one for your Mac.
- Intel Macs start on the faster Base transcription model. You can switch models anytime in Settings › Transcription & clips.

### Fixed
- Transcription no longer fails when the computer's math library prints a warning first, which some Intel Macs do.

## 0.4.2 · November 18, 2026

### New
- **Writing projects.** Writing opens on a home page: start from a transcript, a blank post, or an event from your church calendar, and find everything you've written below.
- **Brand voice.** In the Brand library, add your mission statement, core copy from your website, a few central themes and writing samples. While you write a blog, a Brand voice score shows how it compares, and new drafts lean toward your themes. "Save to brand voice" adds a finished blog to your samples, so drafts keep getting closer to how your church sounds. The AI helper, when on, follows the same voice.
- **Transcript reader.** Turn on times down the left side. Click a paragraph or drag across words to see a word count, how long it runs and where it starts, then copy it, make a clip, make a quote graphic or start a social post.
- **Sorting** in All projects: most recent, A to Z, or by kind.

### Changed
- Sermons is now **Videos**, and its list is **Your projects**.
- A project that's already transcribed shows **Read transcript** and **Re-transcribe** instead of Transcribe.

### Fixed
- The transcript scrolls with your mouse or trackpad instead of moving the whole page.
- The more button on items with long names stays inside the card.

## 0.4.1 · November 18, 2026

### Changed
- **Church calendars use iCal links.** Add one or more calendar links from Planning Center, Church Center, Subsplash, Tithe.ly or Google, with steps for finding each one. Repeating events now show every time they happen. A link you already added carries over.
- **All projects and Graphics** lay out as masonry, so tall and wide covers fit together without gaps.
- **Welcome walkthrough.** Start it again anytime from My App or Settings › Your tools.
- Every dialog has the same close button in the corner.

### Fixed
- Pop-up cards, like "What is good SEO?", stay inside the window and open above their button when there's no room below.
- Pop-ups and dialogs always open in front, including the header image picker in Writing.
- Three-stack clips use the same background above and below the middle frame, in the preview and the export.
- The design editor's top bar stays on one line on laptop screens.
- The menu no longer flashes a blank highlight when you switch screens.

## 0.4.0 · November 18, 2026

### New
- **Welcome and your tools.** A short welcome on first run asks what kinds of work you do. Turn tools on or off and put them in your order anytime in Settings › Your tools. The menu and dashboard only show what you use.
- **Transcribe any recording.** Open an audio or video file from your Mac, like a class, a podcast or a phone recording. Read the transcript, copy it, or save it as text, text with times, or caption files.
- **Audio cleanup.** Six presets (Clear voice, Loud room, Far from the mic, Recorded outside, Hum or buzz, Phone or laptop) with a strength slider and a before and after sample. Works for transcripts and clips, or save a clean copy of any recording. No AI needed.
- **Present to a second screen.** Slides go full screen on the projector while you get the next slide, notes, a timer and a black screen button. Clickers work. Edits to the live slide wait until you press Update screen.
- **Template packs.** Natural, Smooth, Bold, Youth and Traditional, each with a welcome post, a verse post, an event story and sermon slides. No stock photos: click a photo spot to add your own or make it solid.
- **More design tools.** Any shape can hold a photo or work as an eraser. New hexagon, arch and blob shapes, iPhone and MacBook frames, and color swatches for each color inside an SVG.
- **Church calendar.** Connect Planning Center or any calendar link (Subsplash, Tithe.ly, Google, Outlook). Events show on the social calendar and dashboard and turn into an event graphic in one click. Checked every Monday morning, or press refresh.
- **Your logo, front and center.** The menu shows your church logo, and the Dock icon becomes your logo with a small CS badge.
- **Notifications.** A Mac notification when a transcript, download or export finishes, or when a post you share by hand is due. Only while Church Studio is in the background.
- **Show in Finder** for anything in All projects.
- **Send feedback** with a star rating, and **Thank you**, a page for the open-source projects Church Studio is built on.

### Changed
- New app icon: CS in Caveat.
- Folder tips in All projects moved into an info button.

### Fixed
- Present no longer ends right after it starts.

## 0.3.0 · November 18, 2026

### New
- **All projects.** One place for sermons, clips, writing and designs, with folders, stars, recents and trash.
- **Updates.** Check for updates and read what's new from Settings.
- **Printable guides.** Small group guides print as a full page with the sermon outline down the side, or as two half pages to cut.
- **Images in writing.** Add a header image to blog posts, emails and guides, or drop one into the text. Guides can use a still from the sermon video.
- **Church info.** Add your church's name, address and website once; printed pages show it with your logo.

### Improved
- The status in the sidebar now says **Working locally**, or **Working with** your AI helper when one is connected. If the helper runs out of usage, Church Studio keeps working locally and tells you.
- A short **What is good SEO?** note sits next to the search score.
- Icons and tiles follow your app theme.

## 0.2.0 · November 18, 2026

### New
- **Church Studio.** New name and icon.
- **Design studio.** Presentations, social posts, carousels, stories, thumbnails, flyers and sermon notes. Build them from a sermon, present slides full screen, and export to PNG, PDF or PowerPoint.
- **Formatted writing editor** with a toolbar, plus a Markdown view.
- **Blog suggestions** for titles, keyphrases, web addresses and meta descriptions, and **Rewrite post** with a new angle.
- **Brand kit** with your colors and fonts, and a setup checklist.
- **YouTube channel preview** in Settings.

### Improved
- Bible references are written the standard way: "First Corinthians 10 beginning in verse 16" becomes 1 Corinthians 10:16.
- Twelve more small group question endings.
- New color picker, font menu and sliders.

## 0.1.0 · November 17, 2026

### New
- Download a sermon from your channel, or just the sermon part of a service.
- Transcribe on your Mac, get clip suggestions, and edit them with live captions and speaker tracking.
- Export vertical clips, post or schedule them, and write blog posts, emails and small group guides from the sermon.
