import json

path = r'c:\Users\PAFF-DADDY\OneDrive\Desktop\POS1\src\locales\fr\translation.json'

with open(path, 'rb') as f:
    raw = f.read()

# Strip BOM
if raw[:3] == b'\xef\xbb\xbf':
    raw = raw[3:]

# The file is UTF-8 but has some mojibake (UTF-8 bytes mis-decoded as Latin-1 then re-encoded as UTF-8)
text = raw.decode('utf-8')

# Fix mojibake: these are UTF-8 code points that represent Latin-1 encoded UTF-8 bytes
# Method: fix each pair of unicode chars that represent double-encoded UTF-8
def fix_mojibake(s):
    # Convert to bytes as latin-1 then decode as utf-8 for the broken parts
    # We need to selectively fix only the broken sequences
    result = []
    i = 0
    while i < len(s):
        c = s[i]
        code = ord(c)
        # If it's a Latin-1 supplement character (0x80-0xFF) that shouldn't be here,
        # it may be a mojibake byte
        if 0xC0 <= code <= 0xFF and i + 1 < len(s):
            # Could be start of a double-encoded sequence
            next_c = s[i + 1]
            next_code = ord(next_c)
            if 0x80 <= next_code <= 0xBF:
                # Try to decode this pair as UTF-8 bytes
                try:
                    fixed = bytes([code, next_code]).decode('utf-8')
                    result.append(fixed)
                    i += 2
                    continue
                except:
                    pass
        result.append(c)
        i += 1
    return ''.join(result)

fixed = fix_mojibake(text)

# Also fix common special chars
replacements = [
    ('\u00e2\u0080\u0099', "'"),
    ('\u00e2\u0080\u009c', '\u201c'),
    ('\u00e2\u0080\u009d', '\u201d'),
    ('\u00e2\u0080\u0093', '\u2013'),
    ('\u00e2\u0080\u0094', '\u2014'),
    ('\u00c2\u00a0', '\u00a0'),
]
for bad, good in replacements:
    fixed = fixed.replace(bad, good)

# Validate JSON
try:
    json.loads(fixed)
    print("JSON is valid!")
except Exception as e:
    print(f"JSON error: {e}")

remaining = sum(1 for c in fixed if 0xC0 <= ord(c) <= 0xFF)
print(f"Remaining non-ASCII Latin-1 chars: {remaining}")
print("Sample:", repr(fixed[380:580]))

with open(path, 'w', encoding='utf-8') as f:
    f.write(fixed)
print("File saved.")
