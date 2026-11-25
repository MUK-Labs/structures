# Source data

The Bach collection contains 16 fugues from Bach's *Well-Tempered Clavier*,
Book I: BWV 846–854, 857–859, 861, and 866–868. There are 381 thematic entries,
39 engraved theme openings, and 21 recording-specific synchronization maps.

Each `pieces/*.json` file contains its own voices, themes, inline notation SVGs,
entries, source citations, recordings, and timing anchors. `index.json` is the
generated catalog. `score-summary.json` records score-derived work lengths,
meters, and voice counts for the source corpus.

## Attribution and license

The thematic annotation database is adapted from **Mathieu Giraud, Richard
Groult, and Florence Levé / Algomus**, released under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Any rights in individual database contents are licensed under the
[Database Contents License 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).
The adapted annotation database in these JSON files is available under those
same terms. This notice does not relicense independent recordings or source
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
- Only the authors' reference annotations are imported. Labels explicitly
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
