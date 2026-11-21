"""Assemble recognized MusicXML into the same practice guide on the server and in the browser."""

from collections import defaultdict, deque
import xml.etree.ElementTree as ET

from score import _parse_musicxml, _part_measures, _read_score_tree, read_score


class ScoreConversionError(ValueError):
    """A recognized page could not be turned into a readable score."""


def _chords(measure):
    chord = []
    for note in measure.findall("note"):
        if chord and note.find("chord") is None:
            yield chord
            chord = []
        chord.append(note)
    if chord:
        yield chord


def _slurred_notes(chord, direction):
    for note in chord:
        pitch = note.find("pitch")
        if pitch is None:
            continue
        for notation in note.findall("notations"):
            slur = notation.find(f"slur[@type='{direction}']")
            if slur is not None:
                signature = tuple(pitch.findtext(name, "") for name in ("step", "alter", "octave"))
                yield signature, (note, notation, slur)
                break


def _replace_slur(mark, direction):
    note, notation, slur = mark
    notation.remove(slur)
    notation.insert(0, ET.Element("tied", type=direction))
    duration = note.find("duration")
    offset = list(note).index(duration) + 1 if duration is not None else 0
    note.insert(offset, ET.Element("tie", type=direction))


def _join_ties(part):
    # Homr's model emits the same mark for slurs and ties. Its native exporter
    # uses adjacent equal pitches in the same voice to distinguish them.
    # Applying that rule again to the assembled part also covers page breaks.
    previous = {}
    for measure in part.findall("measure"):
        for chord in _chords(measure):
            voice = tuple(chord[0].findtext(name, "1") for name in ("staff", "voice"))
            starts = previous.get(voice, {})
            for pitch, stop in _slurred_notes(chord, "stop"):
                if starts.get(pitch):
                    _replace_slur(starts[pitch].popleft(), "start")
                    _replace_slur(stop, "stop")
            next_starts = defaultdict(deque)
            for pitch, start in _slurred_notes(chord, "start"):
                next_starts[pitch].append(start)
            previous[voice] = next_starts


class PdfScore:
    """Accumulate pages in source order and interpret the whole passage once."""

    def __init__(self):
        self.root = ET.Element("score-partwise", version="4.0")
        self.part = ET.SubElement(self.root, "part", id="P1")
        self.pages = []
        self.measure_pages = []
        self.next_measure = 1

    def add_page(self, xml, page):
        number = page["number"]
        try:
            measures = _part_measures(_parse_musicxml(xml))
        except (ET.ParseError, ValueError) as error:
            raise ScoreConversionError(
                f"Could not read the music on PDF page {number}. Try a clearer score or extract that page."
            ) from error
        if not any(measure.find(".//note/pitch") is not None or measure.find(".//note/rest") is not None
                   for measure in measures):
            raise ScoreConversionError(f"No readable notes or rests were found on PDF page {number}.")
        for measure in measures:
            if self.measure_pages or measure.get("number") != "0":
                measure.set("number", str(self.next_measure))
                self.next_measure += 1
            self.part.append(measure)
            self.measure_pages.append(len(self.pages))
        self.pages.append(page)

    def finish(self, *, title="", page_count, skipped_pages=()):
        if not self.pages:
            raise ScoreConversionError("No readable sheet music was found in this PDF.")
        try:
            _join_ties(self.part)
            score = _read_score_tree(self.root)
            for measure, page_index in zip(score["measures"], self.measure_pages, strict=True):
                measure["pageIndex"] = page_index
        except (ET.ParseError, ValueError) as error:
            raise ScoreConversionError("Could not combine the recognized PDF pages into a score.") from error
        score.update(title=title, imageSize=self.pages[0]["imageSize"], pages=self.pages, pageCount=page_count)
        if skipped_pages:
            score["skippedPages"] = skipped_pages
        return score


def convert_pages(pages, *, pdf=False, title=None, page_count=None, skipped_pages=()):
    if pdf:
        score = PdfScore()
        for page in pages:
            score.add_page(page["xml"], {key: value for key, value in page.items() if key != "xml"})
        return score.finish(title=" ".join((title or "").split())[:250],
                            page_count=len(pages) if page_count is None else page_count,
                            skipped_pages=skipped_pages)

    if len(pages) != 1:
        raise ScoreConversionError("Choose one photo to scan.")
    page = pages[0]
    try:
        score = read_score(page["xml"])
    except (ET.ParseError, ValueError) as error:
        raise ScoreConversionError(
            "Could not read the notes. Try a straight, well-lit photo of one printed page."
        ) from error
    score["imageSize"] = page["imageSize"]
    return score
