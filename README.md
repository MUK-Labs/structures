# Structures

A listening atlas of counterpoint: colored voice timelines, miniature theme scores, and bounded playback from public YouTube performances.

**[Open the viewer](https://muk-labs.github.io/structures/)** · [Presentation view](https://muk-labs.github.io/structures/?piece=bwv847&view=slides)

## Using the viewer

- Choose a piece. Voice-entry diagrams follow the performing or contrapuntal parts; thematic-form diagrams follow thematic families. Colors identify related material.
- Hover or keyboard-focus an entry to inspect its theme. Where synchronized playback is available, click to play the full recorded texture during that entry, then stop automatically.
- Use **Loop entry** for repeated listening. **Space** plays/pauses outside form controls; arrow keys move between entry buttons.
- **Compare** stacks up to three pieces with the same thematic color convention. Each diagram fits its displayed score span, so horizontal widths compare proportions, not equal elapsed seconds. Exposition excerpts are identified explicitly.
- **Presentation** (`view=slides`) shows only the composer/title, theme legend and diagram on white. Click entries to listen with the video hidden; hover or keyboard-focus still shows the theme. **Escape** restores all controls, including the recording player; **Space** plays/pauses. If a browser requires interaction with YouTube to start playback, leave slides with Escape and start it there, then return to Presentation. **Copy link** preserves the piece, comparison, entry and presentation view.
- **Open piece…** loads a self-contained JSON from your computer. Nothing is uploaded. Publish the JSON in the repository before sharing its URL.

The collection contains **52 diagrams**, with different levels of analytical coverage:

| Repertoire | Diagrams | Coverage |
| --- | --- | --- |
| Bach, WTC I | 16 | Reference annotations with recording-specific timing maps |
| Shostakovich, Op. 87 nos. 1–12 | 12 | Reference annotations, including incomplete and split-voice statements |
| Hindemith, *Ludus Tonalis* | 12 | Opening expositions and no. 11's opening canon, checked against the score and Foster |
| Mendelssohn, Op. 35 | 6 | Opening exposition excerpts, checked against the score and Saayman |
| Mozart, K. 546 | 1 | Selected subject and head matches across the fugue movement |
| Beethoven, Op. 131/I | 1 | Ten selected substantial statements across the movement |
| Beethoven, Op. 110/III | 1 | The first fugue's opening three-voice exposition |
| Bartók | 3 | Selected Duo 37 and Mikrokosmos 141 phrases; a thematic-form map of Quartet 5/I |

All 52 pieces have listening links. Shostakovich Op. 87 no. 4 now has **estimated barline timing** for Sofia Sacco’s recording, contributed by Adrián Artacho. The other 35 additions beyond Bach are labelled **Manual timing needed**: you can open their recordings now, while synchronized entry playback remains disabled until timing maps are added. Selected-entry maps, exposition excerpts and thematic-form maps retain their coverage labels; they do not imply complete inventories of voice entries.

The first Bartók selection offers three ways to follow returning material:

- [Duo no. 37, Prelude and Canon](https://muk-labs.github.io/structures/?piece=bartok-duo-37): selected folk-tune statements and three canons across two violins.
- [Mikrokosmos no. 141, Subject and Reflection](https://muk-labs.github.io/structures/?piece=bartok-mikrokosmos-141): selected refrain phrases, inversion and changing imitation delays in the moving piano lines.
- [String Quartet no. 5/I](https://muk-labs.github.io/structures/?piece=bartok-quartet-5-1): thematic regions from Bartók's own outline, including inverted returns in reversed order. Its rows represent thematic families.

**[Manual timing checklist and instructions](docs/manual-timing.md)** · [CSV timing worksheet](docs/manual-timing-template.csv). The checklist links every pending piece and its exact recording, and separately lists four Bach entries needing timing-map extensions. Download a copy of the CSV, fill the `seconds` column for your chosen pieces, and send it back for integration.

For a quicker first pass, use the **[barline timing tool](https://muk-labs.github.io/structures/timing.html)**. Open **Time this recording** beside the viewer's recording selector, load the video, and press **Space at the start of each bar**, then at the final displayed endpoint. It counts the score's actual measures, including pickups and meter changes. Undo, edit and review timestamps, then **Use in my diagram** to hear an estimated alignment in your browser. Drafts save locally; download the piece JSON or timing CSV to contribute the result. [Timing-tool instructions](docs/barline-timing.md).

The [repertoire source register](docs/repertoire-sources.md) distinguishes these implemented diagrams from sources for further work, including whole-fugue inventories, later sections, other Beethoven and Romantic fugues, and recording alignment. [Data provenance](data/README.md) documents the exact methods and reproduction commands.

The [counterpoint research register](docs/counterpoint-research.md) extends the search to Bartók, recurring themes, canons, rhythmic layers, and other contrapuntal repertoire. It includes verified analyses, page and measure references, data sources, and priorities for future diagrams, with the first three Bartók implementations identified explicitly.

The [recording review](docs/recording-alternatives.md) documents the replacement of 35 label-distributed Topic uploads with performer-published concert or educational videos. These are candidate alternatives for fewer interruptions, not verified nonmonetized or ad-free uploads. All of Bach, OpenGoldberg and the WDR/ARD performance remain. Each replacement starts with its own empty timing map; the timing tool shows movement navigation notes for videos containing several pieces.

## Timing and interpretation

Each piece identifies its analytical method and coverage. Bach and Shostakovich use the Algomus reference corpus. Later additions may use independently checked exposition excerpts or conservative score-pattern matching; **selected matches are not a complete thematic analysis**. Method descriptions and source references are included in each file and in **Analysis, sources & timing**.

All positions are zero-based **quarter-note units**. Measure labels follow the notated meter or the explicit measure map; excerpts retain original measure numbers.

The Algomus source's endpoints generally mark the onset of the last note. For Bach, the import extends thematic entries through that note's notated release, including tied continuations, using the source score. For Shostakovich, the published final-onset endpoint is retained: humanized MIDI does not establish a reliable notated release. Later score-derived additions include the final selected note's written release and ties; selected heads and subject cores are identified in the notes. `sourceEnd` and entry notes preserve these distinctions. Unmarked areas do not automatically mean silence or episodes.

Playback uses each recording's own beat-to-second anchors, with linear interpolation between anchors. It never extrapolates or applies an assumed tempo. Some final entries extend beyond the published map; their playback button is disabled. YouTube seeks and stops with platform-dependent tolerance, so this is a classroom listening aid, not sample-accurate editing. Ads, regional restrictions, embedding permissions or a withdrawn video can affect playback; an **Open on YouTube** link is provided.

In the normal view the player is visible and retains YouTube's controls. In slides it remains mounted outside the visible slide, so the synchronization callbacks continue. It loads only after a playback click. Recordings are streamed through the official iframe API; the app does not download audio or isolate stems. Theme previews show the first occurrence and may show only its opening two bars, as stated in the caption. Bach previews derive from score encodings; Shostakovich previews derive from quantized MIDI and are not a critical transcription of the printed score. They do not automatically transpose to the selected entry.

## Adding a piece

**Add one JSON file to `data/pieces/`. No application code or manually maintained catalog is required.** The deployment build discovers the file and regenerates `data/index.json`.

Each file contains metadata, voice definitions, thematic entries, inline SVG notation previews, formal sections, sources, YouTube IDs, and synchronization anchors. To try it before publishing, use **Open piece…**.

```json
{
  "schemaVersion": 1,
  "id": "unique-piece-id",
  "title": "Title",
  "composer": "Composer",
  "subtitle": "Collection and catalog number",
  "form": "Fugue",
  "key": "C minor",
  "totalBeats": 128,
  "meter": { "beats": 4, "unit": 4 },
  "voices": [{ "id": "upper", "label": "Upper" }],
  "themes": [{
    "id": "subject", "label": "Subject", "color": "#3263b9",
    "previewSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 100\">…actual engraved notation…</svg>",
    "previewCaption": "Opening two bars of the first occurrence."
  }],
  "entries": [{
    "id": "subject-1", "voice": "upper", "theme": "subject",
    "start": 0.5, "end": 8.25, "sourceIds": ["analysis"]
  }],
  "sections": [],
  "sources": [{
    "id": "analysis", "title": "Analytical source",
    "url": "https://example.org/analysis", "author": "Analyst"
  }],
  "recordings": []
}
```

The numbers above illustrate the format; they are not a musical analysis. Replace the SVG placeholder with actual notation. A piece can be displayed without a recording. Optional entry fields include `variant`, `key`, `label`, `notes`, and `sourceEnd`; optional section fields are `id`, `label`, `start`, `end`, and `type`. Sections can overlap, so retain distinct types such as `structure` and `pedal`.

For a new analytical source, include an `analysis` object with `kind` (`reference`, `editorial`, or `pattern-matching`), `coverage` (`complete`, `selected-entries`, `exposition`, or `formal-outline`), and a plain-language `description` of the method and its limits. Selected entries, exposition excerpts and thematic-form maps receive visible coverage labels, including in slides. A full-length timeline does not itself imply a complete inventory.

Use `formal-outline` when blocks describe thematic regions in a formal design. In this mode, `voices` defines labeled thematic rows and each `entry` is a source-defined region, which can contain several literal statements or transformations. The viewer calls these **thematic rows** and labels the map **Thematic form**. Keep exact score coordinates and document alternative formal boundaries. Hover/focus shows the cited theme preview and the selected block's label and variant.

To enable playback, add a recording:

```json
{
  "id": "performance-1",
  "title": "Performer / collection",
  "youtubeId": "VIDEO_ID_11",
  "alignment": {
    "status": "source-aligned",
    "description": "Source, method and any timing limitations.",
    "anchors": [{ "beat": 0, "seconds": 12.3 }, { "beat": 4, "seconds": 15.8 }]
  }
}
```

Use the actual 11-character video ID and **many verified anchors across the performance**, ideally at every entry boundary or bar. The two anchors above demonstrate syntax only. A clip is playable only when both endpoints lie within the map. Anchor beats and seconds must strictly increase; negative beats can represent recording preroll. Use `estimated` for estimated mappings and `unavailable` for missing ones. Record where the synchronization came from.

To add a listening source before timing it, keep `alignment: { "status": "unavailable", "anchors": [] }`. Supply `youtubeId` for YouTube, or an HTTP(S) `url` for an external listening page. External links are supported for listening; synchronized playback currently requires YouTube. The normal view shows the source link and **Manual timing needed**, without enabling entry playback. The score-import scripts preserve existing recordings and manual anchors when regenerating analysis.

For a verified uploader chapter, add optional `cueStartSeconds` to the recording (for example, `193` for 3:13) and document the source of that cue. The barline timing tool prepares playback at this absolute video time when loading; the user still presses Play and marks the first barline. Cues must be finite, nonnegative numbers. They do not create alignment anchors, change existing drafts, or offset captured/exported timestamps. Omit the field when no chapter has been verified; it is never inferred from a title, tempo or score position.

For pickups or changing meter, provide an optional `measures` array. Each item has `number`, `start`, `end` (quarter-note units), and `meter: {beats, unit}`. The map must cover the complete timeline contiguously from zero through `totalBeats`; measure numbers increase and may start at 0 for a pickup. An optional measure `label` can identify an unnumbered span such as `Closing bar` without inventing a printed bar number. Axis ticks and entry labels follow this map. Omit it for a constant-meter piece numbered from measure 1. The thematic timeline remains expressed in quarter-note units.

An optional boolean `sourceDontCount` keeps an encoded but unnumbered span out of the printed-bar count; give it a descriptive `label`. Excerpts that stop within a bar retain that bar's number and report their actual ending beat.

## Local development and publication

Node 22+; no npm dependencies or installation needed for the website.

```sh
npm run dev
npm test
npm run validate
npm run timing:list
npm run build
```

Open the local URL printed by the dev server. `npm run build` writes `dist/` and regenerates the catalog. The GitHub Actions workflow validates, tests, builds and publishes this directory. In repository **Settings → Pages**, use **GitHub Actions** as the publishing source.

## Sources and credits

- [Algomus fugue research](https://www.algomus.fr/fugues/): Mathieu Giraud, Richard Groult, Emmanuel Leguy and Florence Levé, *Computational Fugue Analysis*, Computer Music Journal 39(2), 2015. Reference annotations draw on published analyses; consult each piece's source references.
- [Dezrann](https://www.dezrann.net/explore/bach-fugues): annotated corpus and recording synchronization. The annotation database is distributed under ODbL-1.0; the adapted data retain that license. See [data/README.md](data/README.md).
- [Humdrum Bach WTC fugues](https://github.com/humdrum-tools/bach-wtc-fugues): voice-separated score encodings, including David Huron's encoding work. Bach's compositions are public domain; the encoding source retains its attribution.
- Bach theme miniatures are newly engraved from those scores with music21 and Verovio; embedded in each piece file. Shostakovich miniatures use short excerpts of José Oscar de Almeida Marques’s MIDI encodings, with original composition/encoding rights retained separately from the analytical data. No complete Shostakovich score or MIDI is redistributed. No analytical diagrams or score images were copied from earsense.
- Performances remain with their respective providers, including the Netherlands Bach Society and the Open Well-Tempered Clavier project. No audio/video files are redistributed here.

Application code: MIT. Algomus-derived analytical data: ODbL-1.0. Other analyses and notation previews retain the source-specific terms recorded in each JSON and the data documentation. The code license does not relicense third-party scores, encodings, analyses or recordings.
