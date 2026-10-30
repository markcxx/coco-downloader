# coding: utf-8
from .qq_official import QQOfficialProvider


class QQProvider(QQOfficialProvider):
    """QQ official search and VKeys parsing, matching the Web provider."""

    name = "qq"
