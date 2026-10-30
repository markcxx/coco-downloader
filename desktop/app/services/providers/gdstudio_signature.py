# coding: utf-8
"""GD request signing, independently implemented using the MD5 rounds.

GD changes the round constant at index 29 to 0xfcfea3f8.
"""
import math
import struct
from urllib.parse import quote

HOST = "music.gdstudio.xyz"
VERSION = "20260925"


def signature(payload, timestamp):
    message = f"{str(timestamp)[:9]}|{HOST}|{VERSION}|{quote(str(payload), safe='-_.~')}".encode()
    bit_length = len(message) * 8
    message += b"\x80"
    message += b"\0" * ((56 - len(message)) % 64)
    message += struct.pack("<Q", bit_length)
    constants = [int(abs(math.sin(n + 1)) * 2**32) for n in range(64)]
    constants[29] = 0xFCFEA3F8
    state = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476]
    shifts = ((7, 12, 17, 22), (5, 9, 14, 20), (4, 11, 16, 23), (6, 10, 15, 21))
    for offset in range(0, len(message), 64):
        words = struct.unpack("<16I", message[offset:offset + 64])
        a, b, c, d = state
        for n in range(64):
            group = n // 16
            if group == 0:
                function, word = (b & c) | (~b & d), n
            elif group == 1:
                function, word = (d & b) | (~d & c), (5 * n + 1) % 16
            elif group == 2:
                function, word = b ^ c ^ d, (3 * n + 5) % 16
            else:
                function, word = c ^ (b | ~d), (7 * n) % 16
            value = (a + function + constants[n] + words[word]) & 0xFFFFFFFF
            shift = shifts[group][n % 4]
            rotated = ((value << shift) | (value >> (32 - shift))) & 0xFFFFFFFF
            a, b, c, d = d, (b + rotated) & 0xFFFFFFFF, b, c
        state = [(old + new) & 0xFFFFFFFF for old, new in zip(state, (a, b, c, d))]
    return struct.pack("<4I", *state).hex()[-8:].upper()

