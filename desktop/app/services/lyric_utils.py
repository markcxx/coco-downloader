import re
from app.models.music import LyricLine


def clean_lyric(value: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", value.replace("\r\n", "\n")).strip()


def parse_lrc_lines(lyric: str) -> list[LyricLine]:
    lines: list[LyricLine] = []
    time_pattern = re.compile(r"\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?]")
    word_time_pattern = re.compile(r"<\d+,-?\d+>")

    for raw_line in lyric.splitlines():
        matches = list(time_pattern.finditer(raw_line))
        if not matches:
            continue
        text = word_time_pattern.sub("", time_pattern.sub("", raw_line)).strip()
        if not text:
            continue
        for match in matches:
            lines.append(LyricLine(time=_parse_lrc_time(match), text=text))

    return sorted(lines, key=lambda line: line.time)


def _parse_lrc_time(match: re.Match[str]) -> float:
    minutes = int(match.group(1))
    seconds = int(match.group(2))
    fraction_text = (match.group(3) or "").ljust(3, "0")[:3]
    fraction = int(fraction_text or "0") / 1000
    return minutes * 60 + seconds + fraction
