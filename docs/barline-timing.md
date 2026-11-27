# Barline timing

[Open the timing tool](https://muk-labs.github.io/structures/timing.html), or choose a recording in Structures and follow **Time this recording**. The tool lives on its own page; it opens with that piece and recording selected.

## Capture a first pass

1. Click **Load recording**, then **Play**. When a verified chapter cue is available, the recording is automatically prepared to start there; the ready message shows the chapter time. **Open recording** also links to that time. Without a cue, playback starts at the beginning: read the scope below the selectors and locate the relevant fugue or movement. The embedded YouTube player remains visible for listening, seeking and playback-speed controls.
2. Check **Next boundary**. Press **Space** (or tap the large button) at the start of that bar. The first tap is the first score boundary, not the instant the video starts. The counter advances after each accepted tap.
3. Continue at each barline. Pickups, changing time signatures, excerpt numbering, and labels such as the Duo's P1/C1 are taken from the score map. Tap once more at the **final displayed endpoint** to cover the end of the piece or excerpt.
4. Use **P** to pause/play and **Undo** or **Backspace** to undo a mark. After touching the video controls, click **Focus for Space**: keypresses inside a cross-origin video player cannot reach the timing page. Text fields and selectors retain their normal keyboard behavior.
5. Click **Finish & review**. The timestamp table lets you listen near a boundary, edit its absolute seconds, or remove it. If you missed a bar, use **Next boundary** to select the correct score location before continuing. The tool rejects duplicate barlines and times that would run backward.

You may start at a later boundary or finish early. A partial map is useful: only diagram entries whose start and end lie inside its marked span become playable. Repeated score passages must be timed along one continuous pass through the diagram. The tool does not infer repeats, omitted bars, or a missed tap.

Chapter cues are navigation aids, not measured barlines. Loading does not play automatically or add a mark; press Space when you hear the actual first boundary. Pause/resume continues at your current position, while **Reload recording** returns to the chapter cue. A saved draft remains intact. The clock and exported timings always use absolute seconds on the complete video, including any prelude before the fugue.

## Use and share the result

- **Use in my diagram** stores an explicitly applied estimate in this browser and returns to the selected recording in Structures. It opens a covered entry when one is available. Other recordings retain their own alignment.
- **Download piece JSON** produces the complete piece with this recording's estimated anchors. It can be opened with the viewer's **Open piece…**, or integrated into `data/pieces/` to publish the timing for everyone.
- **Download timing CSV** exports only captured boundary timestamps using the repository worksheet's existing seven columns. Send this file back for integration. Internal entry boundaries are interpolated, not presented as independently measured values.
- **Use published timing** removes the applied local estimate for this recording. The draft remains available for further work. **Clear draft** removes the working marks without changing any applied estimate; it can be undone while the page remains open.

Drafts autosave separately for each piece and recording. Applied estimates are also local: sharing a viewer URL does not transfer them to someone else's browser. Export a file to preserve work outside the browser or share it. Storage failures are reported, and exports remain available. A changed source or changed measure grid invalidates old local timing so it cannot silently attach to a different performance or bar layout.

## What is estimated

Every mark uses the player's **media timestamp**, rather than elapsed wall-clock time. Pauses, buffering and playback-rate changes therefore do not accumulate clock drift. Marks are accepted only while the source is playing. Keyboard repeats do not add extra marks.

The score positions are quarter-note coordinates derived from the actual measure map. For example, a 6/8 bar spans three quarter units, while a 2/2 bar spans four. Times between neighboring marks use the same piecewise linear interpolation as the existing viewer; nothing is extrapolated beyond the first and last anchor.

This gives a broad alignment, as requested. Reaction time, within-bar rubato, fermatas, and YouTube seeking precision can affect entry starts and stops. The result is labelled **estimated**, and should be checked by listening to several entries before publication. Finer anchors can still be added using the [manual worksheet](manual-timing.md).

The initial tool supports the linked YouTube recordings used by Structures' synchronized player. Arbitrary external listening pages remain external links; they cannot supply a usable playback clock to this page.

YouTube must permit embedded playback for the selected upload. A source can work on youtube.com while refusing an embedded player; the tool shows the provider's error and does not capture invented timestamps. Such a source needs an embeddable alternative before it can be timed here.
