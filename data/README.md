# Source data

The Bach collection contains 16 fugues from Bach's *Well-Tempered Clavier*,
Book I: BWV 846–854, 857–859, 861, and 866–868. There are 381 thematic entries,
39 engraved theme openings, and 21 recording-specific synchronization maps.

Each `pieces/*.json` file contains its own voices, themes, inline notation SVGs,
entries, source citations, recordings, and timing anchors. `index.json` is the
generated catalog. `score-summary.json` records score-derived work lengths,
meters, and voice counts for the source corpus.

## Attribution and license

The Bach and Shostakovich portions of the thematic annotation database are adapted from **Mathieu Giraud, Richard
Groult, and Florence Levé / Algomus**, released under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Any rights in individual database contents are licensed under the
[Database Contents License 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).
Those Algomus-derived annotations are available under the same terms. Other additions identify their source-specific terms below and in their own JSON files; the ODbL notice does not override those terms. This notice does not relicense independent recordings or source
score encodings.

Please cite: Mathieu Giraud, Richard Groult, Emmanuel Leguy, and Florence Levé,
“Computational Fugue Analysis,” *Computer Music Journal* 39(2), 77–96 (2015),
[doi:10.1162/COMJ_a_00300](https://doi.org/10.1162/COMJ_a_00300).

Recording metadata and synchronization points are from
[Dezrann's Bach fugue corpus](https://doc.dezrann.net/status#bach-fugues--the-well-tempered-clavier-book-i).
Recordings remain hosted by their publishers on YouTube. No recording files
are redistributed here. Performer and publisher credits appear in each piece.

Notation previews engrave short excerpts of Bach's public-domain compositions
from [KernScores](https://github.com/humdrum-tools/bach-wtc-fugues), electronically
encoded by **David Huron**. The source encoding's copyright notice is not
relabeled as public domain; the complete encoding is not redistributed here.
The preview records identify the precise source voice and score positions.

## Timing and editorial conventions

- All entry positions and timing-anchor beats are zero-based **quarter-note
  units**, regardless of the written time signature. For example, a 2/2 bar is
  four timeline beats; a 6/4 bar is six.
- Voice order is highest to lowest. Three- and five-voice labels are neutral
  positional names. Four-voice labels use soprano, alto, tenor, and bass.
- For the Bach/Shostakovich import, only the authors' reference annotations are imported. Labels explicitly
  marked `ignore` are omitted. Inversion, augmentation, incomplete statements,
  and other source variants remain associated with their original theme.
- For the Bach import, the source annotation format generally places an entry's end at the onset
  of its last note. The importer extends the displayed/playable entry through
  that note's notated duration and tied continuation. An endpoint inside a
  sounding note extends to its release; an existing release endpoint is kept.
  Every entry retains its original endpoint as `sourceEnd` and explains the
  conversion in `notes`.
- Sections contain only explicit source structure and pedal labels. Empty
  regions are not automatically labeled episodes or exposition boundaries.
- Recording time is linearly interpolated **between source anchors**. It is
  not calculated from a single tempo, and the maps do not assert frame-level
  precision. Endpoints outside the source map cannot support synchronized
  segment playback. A negative anchor is permitted for source preroll.
- BWV 849 and 857 repeat a final score position in the source map. The earliest
  timestamp is retained as the chord's arrival; no timestamp is invented.
- Pieces with missing analyses, placeholder maps, or unresolved metadata
  inconsistencies were left out of this initial collection. Other works may
  be added independently using the same one-file piece format.

## Reproduce the import

Pinned source revisions:

| Repository | Revision |
| --- | --- |
| [Algomus data](https://gitlab.com/algomus.fr/algomus-data) | `a1801b5b42a4f8d99783e1e52b3dc2e7407cd5ef` |
| [Dezrann corpus](https://gitlab.com/algomus.fr/dezrann/dezrann-corpus) | `d828c501f4caf7f860780296292e38faa64a846e` |
| [Bach KernScores](https://github.com/humdrum-tools/bach-wtc-fugues) | `5095752e0503c63663f28f4b8d21a5b6ea081a08` |

Check out these revisions outside this project, then run from the project root:

```sh
python -m pip install music21 verovio
python scripts/engrave-previews.py \
  --scores /path/to/bach-wtc-fugues/kern \
  --analyses /path/to/algomus-data/fugues/bach-wtc-i \
  --output /tmp/fugue-previews.json
python scripts/import-dezrann.py \
  --corpus-dir /path/to/dezrann-corpus \
  --analysis-dir /path/to/algomus-data \
  --scores /path/to/bach-wtc-fugues/kern \
  --previews /tmp/fugue-previews.json
```

When `--previews` is omitted, an import preserves inline previews already
present in the destination piece files. The browser itself needs no music
engraving dependencies.

## Shostakovich Op. 87: first twelve fugues

The additional twelve piece files contain **354 entry segments** and **36 theme previews**, using the **reference** annotations in Algomus
`fugues/fugues.ref`, at revision
`a1801b5b42a4f8d99783e1e52b3dc2e7407cd5ef`. This includes the E-minor double
fugue (no. 4), incomplete statements, and explicitly annotated transfers between
voices. Alternative definitions without occurrence lists are not promoted to
additional entries. Split segments share a `groupId` and retain the source
position, options and line number. One ambiguous source row in fugue 7 (CS2 transferred from soprano to alto at bar 25) has a zero-length first segment in the reference; it remains in `editorialOmissions` pending score verification and is not plotted.

These diagrams are **analysis only**. The surveyed sources provide no verified
recording-specific beat-to-second maps for them, and `recordings` is empty.
No timing has been inferred from a single tempo or borrowed from another
performance. The catalog and viewer identify this limitation.

The importer observes the Algomus distinction between decimal bar offsets and
fractions of a whole note. It retains the published final-note-onset endpoints,
including `sourceEnd`, instead of guessing releases from humanized MIDI. Entry
widths therefore follow analytical source boundaries, not complete sounding
note durations. The `resolution` field is retained in `sourceOptions`; it does
not silently extend the final-onset endpoint.

Measure extent, voice separation and preview pitches derive from José Oscar de
Almeida Marques's MIDI encodings (2002), linked individually in each piece.
Source SHA-256 digests are recorded. The MIDI's initial offset is accounted for
in fugues 1, 8 and 12: preceding silence is trimmed, the musical pickup is
retained as measure 0, and measure 1 retains its analytical downbeat. A full
`measures` map keeps these bar labels aligned. Piece extent follows the MIDI
track extent, including any shortened final bar; it is not a critical edition
of the printed score.

The short theme previews are newly engraved from quantized MIDI with music21
and Verovio. Their captions disclose that spelling and articulation can differ
from the printed score. **The underlying Shostakovich compositions and MIDI
encodings retain their respective rights; these previews are excluded from the
ODbL annotation license.** No complete score, MIDI, or audio file is redistributed.
The general MIT code license does not apply to these musical excerpts.

Reproduce with the pinned Algomus repository and the twelve credited MIDI files
named `01.mid` through `12.mid` in a separate directory:

```sh
python -m pip install mido music21 verovio
python scripts/import-shostakovich.py \
  --analysis /path/to/algomus-data/fugues/fugues.ref \
  --midi-dir /path/to/shostakovich-midi \
  --previews
npm run validate
npm run build
```

The publisher identifies the cycle as Op. **87**; “op. 57” in the historical
Algomus web page/header is a typographical error, not a different collection.
See the [source register](../docs/repertoire-sources.md) for the publisher link
and prospective repertoire beyond this import.

## Methods and limited coverage in later additions

Each later addition includes `analysis.kind`, `analysis.coverage`, and a method
`description`. An exposition excerpt ends after its first group of entries and
retains the score's original measure numbers. A selected-entry map can span an
entire movement without identifying every subject fragment or countersubject.
The viewer displays these distinctions in the piece metadata, including slides.

These additions have no verified recording alignment. Their empty `recordings`
arrays are intentional, and their catalog entries are labelled analysis-only.
Do not create a time map from a score tempo or reuse one from another performance.

### Mozart, K. 546: selected subject matches

`mozart-k546-fugue.json` covers the 119-bar fugue movement, excluding the Adagio.
The source is Carlo Stemberger's Mutopia LilyPond edition, revision
`9743e4379b2e12d0763b216e01abb92e2057853d`; exact input hashes are stored in the
JSON. Its source score and newly engraved preview retain **CC BY-SA 2.5**.
The independently generated annotation database is identified as ODbL-1.0 in
the file; this does not relicense the score or preview.

The conservative detector finds 15 complete twenty-attack subject/tonal-answer
template matches and 29 additional ten-attack head matches. It compares exact
attack spacing and internal durations, permits diatonic transposition/inversion,
and marks the head matches as partial. Matched endpoints include the final
note's notated release. Altered continuations, other transformations, and
countersubjects are not classified. This is **not** a transcription of Dirst's
analytical table or a claim of complete analytical coverage.

All 2,667 source pitch/onset pairs were checked against Mutopia's published
fugue MIDI. To reproduce from the credited source files:

```sh
python scripts/import-mozart-k546.py \
  --score-dir /path/to/MutopiaProject/ftp/MozartWA/KV546/k546/k546-lys \
  --midi-check /path/to/k546-2.mid
```

Use the script's `--midi-check` option to repeat the pitch/onset comparison.
No full score or MIDI is redistributed in this repository.

### Beethoven, Op. 131/I: selected subject statements

`beethoven-op131-01.json` marks ten editorially selected substantial statements
across the complete first movement. They include altered answers and the late
cello augmentation. The selection does not classify every subject head, false
entry, stretto, or episode. Each selected note sequence is checked against the
score, with contiguous ties included through their releases.

The source is the [Annotated Beethoven Corpus](https://github.com/DCMLab/ABC),
revision `b6b7d38500bacb30c81db7e09d8790df1a2edd46`, using its notes and measures
tables, not its harmonic annotations as fugue labels. Source hashes are enforced
by the importer. The source encoding, derived JSON and short preview retain
**CC BY-NC-SA 4.0**. Cite Neuwirth, Harasim, Moss and Rohrmeier (2018),
[doi:10.3389/fdigh.2018.00016](https://doi.org/10.3389/fdigh.2018.00016).
Ormesher's analysis provides context and a cross-check; no thesis chart or
engraving is reproduced.

The timeline has 484 quarter-note units: an opening pickup, 120 numbered bars,
and a separate unnumbered closing bar. The closing span is labelled **Closing
bar**, preserving the encoding's duration without inventing a printed bar 121.

```sh
python scripts/import-beethoven-op131.py --corpus-dir /path/to/ABC
```

### Beethoven, Op. 110/III: first fugue exposition

`beethoven-op110-exposition.json` contains the three opening subject statements,
beginning at the unnumbered fugue upbeat and retaining the score's subsequent
movement numbers 28–41. The preceding Arioso is excluded. The excerpt ends at
eighth-note beat 4 of m. 41, after the soprano subject's final dotted quarter;
the first bass statement includes its tied ending past the answer's entrance.
The remaining fugue, returning arioso and inverted second fugue are outside
this diagram.

The importer checks all 27 selected note attacks, durations and ties against
Craig Stuart Sapp's [Humdrum encoding](https://github.com/craigsapp/beethoven-piano-sonatas),
revision `2d6627b8a2b085145b2be48e640fbb993771542b`. Its exact source hash is
recorded. The Durand 1915 / Paul Dukas source scan independently confirms the
upbeat and subject notes. Ormesher supplies analytical context; the diagram
documents the difference between his entry numbering and the source encoding.

The composition and historical edition are public domain; the encoding's
attribution is retained and no repository license is asserted for it. Only a
three-note, newly engraved subject opening is included. New annotation data
are identified separately as ODbL-1.0; this does not relicense the encoding.

```sh
python scripts/import-beethoven-op110.py \
  --score /path/to/beethoven-piano-sonatas/kern/sonata31-3.krn
```

### Mendelssohn, Op. 35: six exposition excerpts

`mendelssohn-op35-01.json` through `-06.json` contain 25 opening subject/answer
entries and six newly engraved incipits. These are editorial excerpts, not full
maps of the fugues. The reviewable transcription is
[`scripts/mendelssohn-expositions.json`](../scripts/mendelssohn-expositions.json).
It records score pages, analytical references, notes, and the source PDF hash.

| Fugue | Displayed measures | Entries |
| --- | --- | --- |
| 1, E minor | 1–10 | 4 |
| 2, D major | 1–13 | 4 |
| 3, B minor | 1–11 | 4 |
| 4, A-flat major | 1–22 | 4 |
| 5, F minor | Pickup (0), then 1–19 | 4 |
| 6, B-flat major | 1–28 | 5 |

Onsets and subject-core releases are transcribed from the historical score
available through [Cantorion](https://cantorion.org/music/1147/6-Preludes-and-Fugues),
checked against Saayman's discussion and examples. No. 4 preserves the one-bar
link and tied endings; no. 5 preserves its eighth-note pickup; no. 6 includes
the additional bass entry in mm. 25–28. These subject-core bounds do not include
every subsequent melodic extension or a countersubject inventory.

The composition and historical score are public domain. Saayman's thesis
retains its author's copyright and is cited for analytical context; its prose,
charts and score images are not redistributed. The previews are short,
independently engraved score transcriptions. Regenerate from the manifest with
music21 and Verovio installed:

```sh
python scripts/import-mendelssohn-expositions.py
```

### Hindemith, Ludus Tonalis: twelve opening excerpts

`hindemith-ludus-01.json` through `-12.json` cover the initial subject/answer
expositions; no. 11 is labelled as an opening canon. The reviewable manual
transcription is [`scripts/hindemith-expositions.json`](../scripts/hindemith-expositions.json).
It identifies the AMP 1943 score pages and Foster's 1973 analytical discussion
for each excerpt. Source PDFs and thesis graphics are not bundled.

The three voice lanes retain the score's contrapuntal identities. Where the
opening is canonic rather than a three-entry fugue exposition, an accompaniment
lane can remain unmarked. Later subjects, developmental sections and complete
whole-work entry inventories are outside this import. The excerpts include
the final selected note's written duration and ties, sometimes extending beyond
the exposition cadence into a partial final bar. Each entry describes its
individual score boundary; quarter-note positions remain independent of the
printed meter.

The twelve previews are independently engraved short subject incipits,
transcribed from the score with its pitches, spelling and rhythm. **The
underlying compositions and edition retain their respective rights**, separately
from the project code and annotation data. Foster's thesis is cited for
analytical context and retains its author's copyright. Neither source is
relabelled as an openly licensed score or image collection.

```sh
python scripts/import-hindemith-expositions.py
```
