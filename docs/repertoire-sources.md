# Repertoire beyond Bach: source register

Research checked on 25 November 2026. This register separates published analyses
from data that are ready for the viewer. A source being listed here does **not**
mean its pieces, notation previews, or synchronized recordings have been added.
The generated [catalog](../data/index.json) is the list of available diagrams.

## Implemented expansion

The new diagrams deliberately state their coverage. A whole-movement timeline
does not make a selected-entry diagram a complete analysis. These additions have
newly engraved short notation previews; none currently has recording alignment.
See [data provenance](../data/README.md) and each piece's sources for exact
revisions, editorial conventions, and rights.

| Repertoire | Actual coverage | Method and source distinctions |
| --- | --- | --- |
| Mozart, K. 546, fugue movement | **44 selected matches:** 15 twenty-attack subject/tonal-answer matches and 29 additional ten-attack head matches. The Adagio is outside this diagram; other transformations and countersubjects are not classified. | Reproducible matching in four voice-separated Mutopia parts, with diatonic transposition/inversion and exact attack spacing/internal durations. This is not a transcription of Dirst's stretto inventory. Carlo Stemberger's digital score and the derived preview retain **CC BY-SA 2.5**; the new annotation database is identified separately as ODbL-1.0. [Importer](../scripts/import-mozart-k546.py). |
| Beethoven, String Quartet Op. 131/I | **10 selected substantial statements**, including altered answers, the middle viola continuation, the high A-major entry, and cello augmentation. False entries, episodic fragments, and short stretti are omitted. | Editorial selection measured in the Annotated Beethoven Corpus score and cross-checked with Ormesher. ABC is a harmonic corpus, not a source of fugue-entry labels. The score-derived JSON and newly engraved preview retain **CC BY-NC-SA 4.0**; no thesis diagram or engraving is reproduced. [Importer](../scripts/import-beethoven-op131.py). |
| Mendelssohn, all six Op. 35 fugues | **Six opening expositions**, containing 25 subject/answer entries in total. Later entries, episodes, and final sections are outside the diagrams. | Entries manually checked in the historical score, with Saayman's analysis as corroboration. Public-domain score material and newly engraved incipits are credited separately from the copyrighted thesis. [Importer](../scripts/import-mendelssohn-expositions.py). |
| Hindemith, all 12 *Ludus Tonalis* fugues | **Opening excerpts:** eleven subject/answer expositions and the opening canon of no. 11. Later subjects and complete whole-work inventories are outside these diagrams. | Entries and incipits manually transcribed from the AMP score and checked against Foster. True written releases and ties are retained. Composition, edition and thesis rights remain separate; no source graphics are reproduced. [Importer](../scripts/import-hindemith-expositions.py). |
| Beethoven, Sonata Op. 110/III | **First fugue exposition:** three verified subject statements, from the unnumbered upbeat through part of m. 41. The rest of the movement is outside the excerpt. | Note-by-note checks against a pinned Humdrum encoding, corroborated by the Durand scan and Ormesher. Original score numbering and source rights are preserved. [Importer](../scripts/import-beethoven-op110.py). |

## Machine-readable reference annotations

**Shostakovich, *24 Preludes and Fugues*, Op. 87, nos. 1–12.**
[Algomus's fugue dataset](https://www.algomus.fr/fugues/) provides reference
annotations with symbolic positions for complete subjects, countersubjects, and
pedals. Use these reference files, not the site's algorithm-output diagrams.
The [data repository](https://gitlab.com/algomus.fr/algomus-data) is the source
for the collection's Shostakovich import; see [data provenance](../data/README.md)
for the actual revision, coverage, and import conventions.

The Algomus web page mistakenly labels the cycle “op. 57”; the correct opus is
87, as confirmed by the [publisher's work page](https://www.wisemusicclassical.com/work/35414/Twenty-four-Preludes-and-Fugues--Dmitri-Shostakovich/).
The reference dataset does not itself establish timing for any chosen YouTube
performance. Its annotation license does not license recordings or source scores.

## Sources and remaining editorial work

The partial diagrams above do not replace the broader research below. In
particular, the published whole-work charts and analyses remain sources for a
future complete inventory, rather than completed imports.

| Repertoire | Verified source and analytical coverage | Readiness and missing work |
| --- | --- | --- |
| Hindemith, *Ludus Tonalis*, fugues 1, 3, 4, 6, 7, 9, 10, 12 | Siglind Bruhn, *Symmetry and Dissymmetry in Paul Hindemith's Ludus Tonalis*, [Soundset album booklet](https://www.soundset.com/album_files/EQ12/ludus_tonalis.pdf), printed pp. 8–17. Voice-row structural charts cover these pieces and include subject notation. | **Whole-piece chart candidates for the next stage**, not completed imports or a downloadable annotation database. Transcribe positions and check exact entry boundaries against a score. No recording alignment supplied. No open reuse license was identified in the booklet; do not copy its charts or engravings into the application as licensed assets. |
| Hindemith, all 12 *Ludus Tonalis* fugues: expositions | Dorothy Nell Foster, [*A Comparative Analysis of the Expositions…*](https://digital.library.unt.edu/ark:/67531/metadc663498/), North Texas State University, 1973, especially chapter IV. Discusses voice order, subject lengths, answers, countersubjects, and exposition boundaries. | **Opening excerpts are implemented**, not a complete entry inventory. No. 11 is explicitly an opening canon rather than a fugue exposition. This source can also help check Bruhn's charts. No synchronization data. UNT identifies Foster as rights holder; no adaptation license was verified. |
| Beethoven, Op. 102/2 III; Op. 106 IV; Op. 110 III; Op. 120 variation 32; Op. 133; Op. 131 I | Richard Ormesher, [*Beethoven's Instrumental Fugal Style*](https://etheses.whiterose.ac.uk/id/eprint/1894/), University of Sheffield, repository year 1989. A chapter-length analysis is devoted to each of these six fugues. | Op. 131's selected statements and Op. 110's first exposition are implemented. **Complete inventories remain future work** for all six. These are substantial analytical sources, not verified complete machine-readable entry lists. Further score-based transcription and recording alignment are needed. Repository license: CC BY-NC-ND 2.5; do not assume permission to adapt its diagrams into this database. |
| Beethoven, Sonata Op. 110 III | Milton Fernandez Peña, [*A Performer's Guide to Beethoven's Sonata in A-flat major, Op. 110*](https://scholarsbank.uoregon.edu/items/dc91b732-dfd2-4ad0-8b54-3c377283e8e6), University of Oregon, 2021. Chapter II addresses harmonic and formal structure; chapter III compares performances. | Supporting analysis for the alternating arioso/fugue design. No reusable beat-to-second map or full entry list verified. Reuse license not established. A complete movement also needs correct handling of meter changes. |
| Mozart, Fugue K. 426; related string version K. 546 | Matthew Dirst, [“What Mozart learned from Bach,” *Engaging Bach*, chapter 3](https://www.cambridge.org/core/books/abs/engaging-bach/what-mozart-learned-from-bach/C03E9502A6001EF0E1C3DBF0F491B5CF), Cambridge University Press, 2012, pp. 55–86. [Christopher Brody's review](https://mtosmt.org/issues/mto.13.19.3/mto.13.19.3.brody.php), paragraph 9, identifies Table 3.2, p. 79, as an inventory of nearly 30 stretti. | **Bibliographic lead**: the table itself was not retrieved or transcribed; the implemented 44 score-pattern matches do not establish its inventory. Access the chapter, verify its scope against the score, and treat the two instrumentations separately for recording alignment. No open adaptation license or timing data verified. |
| Mendelssohn Op. 35 and other Romantic piano fugues, including Franck | Jasper Jacobus Saayman, [*The Influence of J.S. Bach's Contrapuntal Style in the Well-Tempered Clavier on Selected Piano Fugues by Romantic Composers*](https://open.uct.ac.za/server/api/core/bitstreams/4fe8b467-1f77-40c1-8e65-0d4093dc3a13/content), University of Cape Town, 2011. Chapters 4–6 compare expositions, middle sections, and final sections. | Six Op. 35 expositions are implemented. **Middle/final sections and other Romantic works remain leads**, not verified complete maps. No recording alignment. The thesis retains author copyright and states private-study/noncommercial-research use; no open database adaptation license verified. |

For Hindemith's first fugue, Daniel K. S. Walden's
[“Noting Images”](https://mtosmt.org/issues/mto.10.16.3/mto.10.16.3.walden.html)
(*Music Theory Online* 16.3, 2010, paragraphs 25–28) provides useful corroborating
discussion of the three subjects and the composer's own visual representation.
It is interpretive context, not synchronization data.

## Promotion into the collection

For each new work, establish the exact movement/version and voice identities,
verify entry starts **and releases** in a score, and record the analytical source
and coverage limits. Resolve changing meters or pickup numbering before displaying
measure labels. Preserve alternative or disputed readings rather than silently
merging them.

A verified diagram may be published without playback. Enable bounded playback
only after checking many anchors against the particular recording; never derive
them from a single assumed tempo or transfer them between performances. Notation
previews need their own score provenance and appropriate reuse basis. Record
source, annotation, score, and recording rights separately.
