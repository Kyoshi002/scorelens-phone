"""Read piano practice information from a MusicXML transcription."""

from collections import defaultdict
from fractions import Fraction
from itertools import combinations
import re
from xml.etree import ElementTree as ET


PITCHES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
BLACK_KEYS = {1, 3, 6, 8, 10}
MAJOR = ("C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯")
MINOR = ("A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯", "G♯", "D♯", "A♯")
NOTE_TYPES = {
    "maxima": 32, "long": 16, "breve": 8, "whole": 4, "half": 2, "quarter": 1,
    "eighth": Fraction(1, 2), "16th": Fraction(1, 4), "32nd": Fraction(1, 8),
    "64th": Fraction(1, 16), "128th": Fraction(1, 32), "256th": Fraction(1, 64),
    "512th": Fraction(1, 128), "1024th": Fraction(1, 256),
}
UNKNOWN = "Unknown"


def _value(element, path, default=""):
    return (element.findtext(path) or "").strip() or default


def _number(value, fallback=0):
    try:
        return Fraction(value)
    except (ValueError, ZeroDivisionError):
        return Fraction(fallback)


def _key_signature(element):
    fifths = _number(_value(element, "fifths"), -99)
    if fifths.denominator != 1 or not -7 <= fifths <= 7:
        return UNKNOWN, "No readable standard key signature was transcribed."
    mode = _value(element, "mode").lower()
    major, minor = MAJOR[int(fifths) + 7], MINOR[int(fifths) + 7]
    accidental_count = abs(int(fifths))
    accidental_name = "sharp" if fifths > 0 else "flat"
    signature = (
        f"{accidental_count} {accidental_name}{'s' if accidental_count != 1 else ''}"
        if fifths else "no sharps or flats"
    )
    if mode == "major":
        return f"{major} major", f"The score specifies major. The signature has {signature}."
    if mode == "minor":
        return f"{minor} minor", f"The score specifies minor. The signature has {signature}."
    if mode not in {"", "none"}:
        return f"{mode.capitalize()} mode", f"The score specifies {mode}. The signature has {signature}."
    return (
        f"{major} major or {minor} minor",
        f"The signature has {signature}. The transcription leaves the mode open. "
        "Listen for the note and chord that sound like home.",
    )


def _meter(element):
    groups = []
    labels = []
    for beats, unit in zip(element.findall("beats"), element.findall("beat-type")):
        label = (beats.text or "").strip()
        parts = [_number(item.strip()) for item in label.split("+")]
        denominator = _number((unit.text or "").strip())
        if denominator <= 0 or any(value <= 0 for value in parts):
            return UNKNOWN, [], ""
        labels.append(f"{label}/{denominator}")
        quarter_lengths_per_unit = Fraction(4, denominator)
        for size in parts:
            if size.denominator != 1 or size > 128:
                return UNKNOWN, [], ""
            is_compound = len(parts) == 1 and denominator >= 8 and size >= 6 and size % 3 == 0
            if is_compound:
                groups.extend([(quarter_lengths_per_unit * 3, True)] * int(size // 3))
            else:
                groups.extend([(quarter_lengths_per_unit, False)] * int(size))
    if not groups or len(groups) > 128:
        return UNKNOWN, [], ""
    count = " · ".join(f"{index} la li" if compound else str(index)
                       for index, (_, compound) in enumerate(groups, 1))
    return " + ".join(labels), groups, count


def _count_onset(start, groups):
    for beat, (length, compound) in enumerate(groups, 1):
        if start >= length:
            start -= length
            continue
        division = start / length
        if division == 0:
            return str(beat)
        suffix = ({"1/3": "la", "2/3": "li"} if compound else
                  {"1/4": "e", "1/2": "&", "3/4": "a"})
        if str(division) in suffix:
            return f"{beat} {suffix[str(division)]}"
        return f"{beat} + {division} beat"
    return ""


def _duration(element, divisions):
    if element.find("grace") is not None:
        return Fraction(0)
    written = _value(element, "duration")
    if written:
        return max(_number(written) / divisions, Fraction(0))
    if element.tag != "note":
        return Fraction(0)
    rhythm = NOTE_TYPES.get(_value(element, "type"), 0)
    dots = len(element.findall("dot"))
    actual = _number(_value(element, "time-modification/actual-notes"), 1)
    normal = _number(_value(element, "time-modification/normal-notes"), 1)
    return rhythm * sum(Fraction(1, 2**index) for index in range(dots + 1)) * normal / (actual or 1)


def _rhythm(element, duration):
    rest = element.find("rest")
    if rest is not None and rest.get("measure") == "yes":
        return "Measure rest"
    if element.find("grace") is not None:
        return "Grace note"
    kind = _value(element, "type")
    if not kind:
        kind = next((name for name, length in NOTE_TYPES.items() if length == duration), "")
    if not kind:
        unit = "quarter-note beat" if duration == 1 else "quarter-note beats"
        return f"{duration} {unit}" + (" of rest" if rest is not None else "")
    dots = len(element.findall("dot"))
    dotted = {0: "", 1: "Dotted ", 2: "Double-dotted "}.get(dots, f"{dots}-dot ")
    actual = _value(element, "time-modification/actual-notes")
    normal = _value(element, "time-modification/normal-notes")
    tuplet = " (triplet)" if (actual, normal) == ("3", "2") else (
        f" ({actual}:{normal} tuplet)" if actual and normal else ""
    )
    return dotted + kind + (" rest" if rest is not None else " note") + tuplet


def _pitch(element):
    step = _value(element, "pitch/step")
    octave = _number(_value(element, "pitch/octave"), -99)
    alter = _number(_value(element, "pitch/alter"))
    if step not in PITCHES or octave.denominator != 1 or not -1 <= octave <= 9:
        return None
    accidental = {-2: "♭♭", -1: "♭", 0: "", 1: "♯", 2: "♯♯"}.get(alter, f"({alter})")
    midi = (octave + 1) * 12 + PITCHES[step] + alter
    if not 0 <= midi <= 127:
        return None
    midi = int(midi) if midi.denominator == 1 else float(midi)
    return f"{step}{accidental}{octave}", midi


def _printed_finger(element):
    for fingering in element.findall("notations/technical/fingering"):
        value = (fingering.text or "").strip()
        if value in {"1", "2", "3", "4", "5"}:
            return int(value)
    return None


def _part_measures(root):
    piano_ids = {
        part.get("id") for part in root.findall("part-list/score-part")
        if re.search(r"piano|keyboard", _value(part, "part-name"), re.IGNORECASE)
        or 1 <= _number(_value(part, "midi-instrument/midi-program")) <= 8
    }
    if root.tag == "score-partwise":
        parts = root.findall("part")
        if not parts:
            return []
        piano = next((part for part in parts if part.get("id") in piano_ids
                      and part.findall("measure")), None)
        grand_staff = next((part for part in parts
                            if part.find(".//attributes/staves[.='2']") is not None), None)
        chosen = next((part for part in (piano, grand_staff) if part is not None), parts[0])
        return chosen.findall("measure")
    if root.tag == "score-timewise":
        measures = root.findall("measure")
        ids = [part.get("id") for measure in measures for part in measure.findall("part")]
        if not ids:
            return []
        selected = next((part for part in ids if part in piano_ids), ids[0])
        converted = []
        for measure in measures:
            target = ET.Element("measure", measure.attrib)
            part = next((item for item in measure.findall("part") if item.get("id") == selected), None)
            if part is not None:
                target.extend(part)
            converted.append(target)
        return converted
    raise ValueError("Expected a score-partwise or score-timewise MusicXML document.")


def _hand(staff, staff_count, clefs, cross_staff_chord_hand):
    if cross_staff_chord_hand is not None:
        return cross_staff_chord_hand
    if staff_count == 2 and staff in {1, 2}:
        return "right" if staff == 1 else "left"
    if staff_count == 1:
        return {"G": "right", "F": "left"}.get(clefs.get(staff), "unknown")
    return "unknown"


def _read_note(element, name, midi, duration, rhythm, hand):
    finger = _printed_finger(element)
    ties = {tag.get("type") for tag in element.findall("tie")}
    if not ties:
        ties = {tag.get("type") for tag in element.findall("notations/tied")}
    if "continue" in ties:
        ties.update({"start", "stop"})
    note = {
        "name": name, "midi": midi, "hand": hand, "duration": float(duration),
        "rhythm": rhythm, "finger": finger, "fingeringSource": "printed" if finger else "unavailable",
        "attack": True, "_play_length": duration, "_ties": ties,
        "_voice": _value(element, "voice", "1"), "_staff": _value(element, "staff", "1"),
        "_length": duration, "_grace": element.find("grace") is not None,
    }
    for comment in (child for child in element if child.tag is ET.Comment):
        position = re.fullmatch(r"\s*imgpos:\s*(\d+)\s*,\s*(\d+)\s*", comment.text or "")
        if position:
            note["position"] = [int(axis) for axis in position.groups()]
            break
    return note


def _resolve_ties(events):
    active = {}
    for start, event in events:
        active = {key: value for key, value in active.items() if value[0] >= start}
        for note in event["notes"]:
            if not note["_ties"] or note["_grace"]:
                continue
            key = (note["midi"], note["_voice"], note["_staff"])
            match = None
            if "stop" in note["_ties"]:
                direct = active.get(key)
                if direct is not None and direct[0] == start:
                    match = active.pop(key)
                else:
                    candidates = [other for other, chain in active.items()
                                  if other[:2] == key[:2] and chain[0] == start]
                    if len(candidates) == 1:
                        match = active.pop(candidates[0])
            end = start + note["_length"]
            root_start, first = (match[1], match[2]) if match else (start, note)
            if match:
                first["_play_length"] = end - root_start
                note["attack"] = False
                note["_play_length"] = Fraction(0)
                note["_held"] = first
                note["hand"] = first["hand"]
            elif "stop" in note["_ties"]:
                note["_tie_entry"] = True
            if "start" in note["_ties"]:
                active[key] = (end, root_start, first)


def _finger_candidates(notes, hand):
    fingers = range(1, 6) if hand == "right" else range(5, 0, -1)
    candidates = [choice for choice in combinations(fingers, len(notes))
                  if all(note["finger"] in {None, finger} for note, finger in zip(notes, choice))]
    return candidates or [tuple(note["finger"] for note in notes)]


def _shape_cost(notes, fingers):
    cost = sum(0.7 if finger in {1, 5} and note["midi"] % 12 in BLACK_KEYS else 0
               for note, finger in zip(notes, fingers))
    if len(notes) == 1:
        return cost
    for first, second, first_finger, second_finger in zip(notes, notes[1:], fingers, fingers[1:]):
        if first_finger is not None and second_finger is not None:
            pitch_gap = second["midi"] - first["midi"]
            finger_gap = abs(second_finger - first_finger)
            cost += abs(pitch_gap / 2 - finger_gap) * 0.35
    if fingers[0] is not None and fingers[-1] is not None:
        stretch = notes[-1]["midi"] - notes[0]["midi"]
        if stretch >= 10 and {fingers[0], fingers[-1]} != {1, 5}:
            cost += 2
    return cost


def _movement(before, after, old_finger, new_finger, hand, gap):
    if old_finger is None or new_finger is None:
        return 0
    pitch_change = after - before
    if pitch_change == 0:
        return 0 if old_finger == new_finger else 1
    finger_change = (new_finger - old_finger) * (1 if hand == "right" else -1)
    if abs(pitch_change) > 5 or gap >= 3:
        return 0.15 if new_finger == old_finger else 0
    if finger_change == 0:
        return 2.4
    if finger_change * pitch_change > 0:
        return abs(abs(pitch_change) / 2 - abs(finger_change)) * 0.4
    if (new_finger == 1 and old_finger in {2, 3, 4}) or (
        old_finger == 1 and new_finger in {2, 3, 4}
    ):
        crossing_finger = max(old_finger, new_finger)
        return {2: 1.4, 3: 1.16, 4: 1.3}[crossing_finger]
    return 3.5


def _hand_fingerings(events, hand):
    blocks = []
    previous_at = None
    for at, event in events:
        by_pitch = defaultdict(list)
        for note in event["notes"]:
            if note["hand"] == hand and note["attack"] and not note["_grace"]:
                by_pitch[note["midi"]].append(note)
        if not by_pitch:
            continue
        pitches = sorted(by_pitch)
        notes = [next((note for note in by_pitch[pitch] if note["finger"] is not None),
                      by_pitch[pitch][0]) for pitch in pitches]
        candidates = _finger_candidates(notes, hand)
        local_costs = [_shape_cost(notes, option) for option in candidates]
        parents = [-1] * len(candidates)
        if blocks:
            old_pitches, _, old_candidates, old_costs, _ = blocks[-1]
            gap = at - previous_at
            for index, option in enumerate(candidates):
                # Compare the melody edge of each shape, whichever hand is playing.
                edge = -1 if hand == "right" else 0
                score, parent = min(
                    (old_costs[old] + _movement(old_pitches[edge], pitches[edge],
                                               prior[edge], option[edge], hand, gap), old)
                    for old, prior in enumerate(old_candidates)
                )
                local_costs[index] += score
                parents[index] = parent
        else:
            for index, option in enumerate(candidates):
                local_costs[index] += sum(abs(finger - 3) * 0.04 for finger in option if finger)
        blocks.append((pitches, by_pitch, candidates, local_costs, parents))
        previous_at = at
    if not blocks:
        return
    best = min(range(len(blocks[-1][3])), key=blocks[-1][3].__getitem__)
    for pitches, by_pitch, candidates, _, parents in reversed(blocks):
        for pitch, finger in zip(pitches, candidates[best]):
            for note in by_pitch[pitch]:
                if note["finger"] is None and finger is not None:
                    note["finger"] = finger
                    note["fingeringSource"] = "suggested"
        best = parents[best]


def _technique(event, previous):
    notes = event["notes"]
    if not notes:
        return "Keep counting through the rest. Release keys as each written sound ends."
    if any(not note["attack"] for note in notes):
        return "Hold each tied note through this count. Play only the notes that begin here."
    if any(note.get("_tie_entry") for note in notes):
        return "This tie begins outside the scan. Start on this note when practicing the excerpt by itself."
    if any(note["_grace"] for note in notes):
        return "Fit the small grace note close to its main note and keep the main pulse steady."
    hands = {note["hand"] for note in notes if note["hand"] != "unknown"}
    if len(hands) == 2:
        return "Start both hands together, then hold each sound for its own written length."
    if len({note["midi"] for note in notes}) > 1:
        if max(note["midi"] for note in notes) - min(note["midi"] for note in notes) > 12:
            return "Check the wide span at a slow tempo. Keep your wrist loose and check the printed hand assignment."
        return "Shape the chord over the keys first. Press the keys together with a loose wrist."
    note = notes[0]
    if "triplet" in note["rhythm"]:
        return "Space the three notes evenly across the written triplet."
    old = previous.get(note["hand"])
    if old is not None and note["finger"] and old["finger"]:
        interval = note["midi"] - old["midi"]
        finger_step = (note["finger"] - old["finger"]) * (1 if note["hand"] == "right" else -1)
        if abs(interval) >= 7:
            return "Look toward the landing key and move your forearm to carry your hand there."
        if 0 < abs(interval) <= 4 and finger_step * interval < 0 and 1 in {old["finger"], note["finger"]}:
            return ("Let the thumb move under the hand as the forearm shifts." if note["finger"] == 1
                    else "Let the next finger pass over the thumb as the forearm shifts.")
    if "dotted" in note["rhythm"].lower():
        return "Count through the dot. It adds half the value of the undotted note."
    if note["midi"] % 12 in BLACK_KEYS:
        return "Move your hand slightly inward so the finger reaches the black key comfortably."
    return "Land with a naturally curved finger and release after the written length."


def _pitch_class(spelling):
    return (PITCHES[spelling[0]] + spelling.count("♯") - spelling.count("♭")) % 12


def _final_harmonies(events):
    """Sounding key sets on the last two distinct attacked positions."""
    active = {}
    recent = []
    for at, event in events:
        active = {pitch: end for pitch, end in active.items() if end > at}
        attacks = [note for note in event["notes"] if note["attack"] and not note["_grace"]
                   and note["_length"] > 0]
        if not attacks:
            continue
        if any(not isinstance(note["midi"], int) for note in attacks):
            return []
        for note in attacks:
            end = at + note["_play_length"]
            active[note["midi"]] = max(end, active.get(note["midi"], end))
        harmony = tuple(sorted(active))
        if not recent or harmony != recent[-1]:
            recent.append(harmony)
    return recent[-2:]


def _infer_key(measures, events):
    signature = measures[-1]["key"]
    if " or " not in signature or any(measure["key"] != signature for measure in measures):
        return None
    harmonies = _final_harmonies(events)
    if len(harmonies) != 2:
        return None
    penultimate, final = harmonies
    dominant_notes = {pitch % 12 for pitch in penultimate}
    tonic_notes = {pitch % 12 for pitch in final}
    options = signature.split(" or ")
    for option, alternative in (options, options[::-1]):
        spelling, mode = option.split()
        tonic = _pitch_class(spelling)
        dominant = (tonic + 7) % 12
        tonic_chord = {tonic, (tonic + (4 if mode == "major" else 3)) % 12, (tonic + 7) % 12}
        dominant_triad = {dominant, (dominant + 4) % 12, (dominant + 7) % 12}
        dominant_seventh = dominant_triad | {(dominant + 10) % 12}
        if (final[0] % 12 == final[-1] % 12 == tonic and tonic_notes == tonic_chord
                and penultimate[0] % 12 == dominant
                and dominant_notes in (dominant_triad, dominant_seventh)):
            return (
                f"Likely {option}",
                f"The excerpt ends with a root-position dominant chord moving to {spelling} {mode}, "
                f"with {spelling} in the bass and melody. The shared signature also allows {alternative}.",
            )
    return None


def _parse_musicxml(raw):
    root = ET.fromstring(raw, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True)))
    for element in root.iter():
        if isinstance(element.tag, str):
            element.tag = element.tag.rsplit("}", 1)[-1]
    return root


def read_score(raw):
    """Return a JSON-ready piano practice guide for a MusicXML document."""
    return _read_score_tree(_parse_musicxml(raw))


def _read_score_tree(root):
    sources = _part_measures(root)
    if not sources:
        raise ValueError("The MusicXML document has no score measures.")

    title = _value(root, "work/work-title") or _value(root, "movement-title")
    if not title:
        title = next(((credit.text or "").strip() for credit in root.findall("credit/credit-words")
                      if (credit.text or "").strip()), "Scanned score")
    divisions = Fraction(1)
    measure_offset = Fraction(0)
    time_signature, beat_groups, count_pattern = UNKNOWN, [], ""
    key, key_detail = UNKNOWN, "No key signature was transcribed."
    clefs = {}
    staves = {item.text for source in sources for item in source.findall(".//note/staff")}
    staff_count = max({1, *(int(_number(staff or "")) for staff in staves)})
    measures = []
    timeline = []

    for source in sources:
        onsets = {}
        cursor = maximum = chord_start = Fraction(0)
        chord_hand = None
        number = source.get("number", str(len(measures) + 1))
        for child in source:
            if child.tag == "attributes":
                divisions = _number(_value(child, "divisions"), divisions)
                if divisions <= 0:
                    raise ValueError("MusicXML divisions must be positive.")
                staff_count = max(staff_count, int(_number(_value(child, "staves"), staff_count)))
                for clef in child.findall("clef"):
                    staff = int(_number(clef.get("number", "1"), 1))
                    clefs[staff] = _value(clef, "sign")
                time = child.find("time")
                if time is not None:
                    time_signature, beat_groups, count_pattern = _meter(time)
                signature = child.find("key")
                if signature is not None:
                    key, key_detail = _key_signature(signature)
            if child.tag not in {"note", "forward", "backup"}:
                continue
            duration = _duration(child, divisions)
            rest_element = child.find("rest")
            if duration == 0 and rest_element is not None and rest_element.get("measure") == "yes":
                duration = sum((length for length, _ in beat_groups), Fraction(0))
            if child.tag == "backup":
                cursor = max(Fraction(0), cursor - duration)
                continue
            if child.tag == "forward":
                cursor += duration
                maximum = max(maximum, cursor)
                continue
            chord = child.find("chord") is not None
            staff = int(_number(_value(child, "staff", "1"), 1))
            hand = _hand(staff, staff_count, clefs, chord_hand if chord else None)
            if not chord:
                chord_start, chord_hand = cursor, hand
                cursor += duration
            start = chord_start
            maximum = max(maximum, start + duration)
            pitch = _pitch(child)
            if child.find("cue") is not None or (not pitch and rest_element is None):
                continue
            event = onsets.setdefault(start, {"start": float(start), "duration": 0.0, "notes": [],
                                               "rests": [], "_rhythms": []})
            event["duration"] = max(event["duration"], float(duration))
            rhythm = _rhythm(child, duration)
            if pitch:
                event["notes"].append(_read_note(child, *pitch, duration, rhythm, hand))
                event["_rhythms"].append(rhythm)
            else:
                event["rests"].append({"duration": float(duration), "rhythm": rhythm, "hand": hand})

        nominal = sum((length for length, _ in beat_groups), Fraction(0))
        pickup = maximum < nominal and maximum > 0 and (
            number == "0" or (source.get("implicit") == "yes" and not measures)
        )
        count_offset = nominal - maximum if pickup else 0
        duration = maximum if maximum else nominal
        events = []
        for start, event in sorted(onsets.items()):
            event["count"] = _count_onset(start + count_offset, beat_groups)
            rhythms = event.pop("_rhythms") or [entry["rhythm"] for entry in event["rests"]]
            event["rhythm"] = " + ".join(dict.fromkeys(rhythms))
            events.append(event)
            timeline.append((measure_offset + start, event))
        measures.append({"number": number, "duration": float(duration), "timeSignature": time_signature,
                         "countPattern": count_pattern, "pickup": pickup, "key": key,
                         "keyDetail": key_detail, "events": events})
        measure_offset += duration

    if not timeline:
        raise ValueError("The MusicXML document has no readable notes or rests.")
    _resolve_ties(timeline)
    inferred_key = _infer_key(measures, timeline)
    for hand in ("right", "left"):
        _hand_fingerings(timeline, hand)
    previous = {}
    for _, event in timeline:
        event["technique"] = _technique(event, previous)
        for note in event["notes"]:
            held = note.get("_held")
            if held is not None and note["finger"] is None:
                note["finger"] = held["finger"]
                note["fingeringSource"] = held["fingeringSource"]
            if note["attack"] and not note["_grace"]:
                previous[note["hand"]] = note
    for _, event in timeline:
        for note in event["notes"]:
            note["playDuration"] = float(note["_play_length"])
            for field in tuple(note):
                if field.startswith("_"):
                    del note[field]

    first = measures[0]
    key, key_detail = inferred_key or (first["key"], first["keyDetail"])
    return {
        "title": title, "timeSignature": first["timeSignature"], "key": key,
        "keyDetail": key_detail, "measures": measures,
        "tips": [
            "Finger numbers run from 1 at the thumb through 5 at the little finger on each hand. "
            "Try suggested choices slowly and adjust for a comfortable reach.",
            "Tap an even pulse and say the counts aloud. The ampersand marks a halfway subdivision "
            "and “la li” marks the second and third parts of a compound beat.",
            "Practice one hand at a time. When joining them, use the count to line up notes that start "
            "together and keep holding notes for their written lengths.",
        ],
    }
