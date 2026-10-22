/** 生成独立 JSON 读取器；上传脚本仅需 POSIX awk，无 Node 或 jq 依赖。 */
export function createTargetReader(): string {
  return String.raw`function fail(message) {
  print "Invalid deploy-target.json: " message > "/dev/stderr"
  exit 2
}
function whitespace() {
  while (substr(input, position, 1) ~ /^[ \t\r\n]$/) position++
}
function hexadecimal(text,    result, offset, digit) {
  result = 0
  if (length(text) != 4) fail("invalid Unicode escape")
  for (offset = 1; offset <= 4; offset++) {
    digit = index("0123456789abcdef", tolower(substr(text, offset, 1))) - 1
    if (digit < 0) fail("invalid Unicode escape")
    result = result * 16 + digit
  }
  return result
}
function utf8(code) {
  if (code < 128) return sprintf("%c", code)
  if (code < 2048) return sprintf("%c%c", 192 + int(code / 64), 128 + code % 64)
  if (code < 65536) return sprintf("%c%c%c", 224 + int(code / 4096), 128 + int(code / 64) % 64, 128 + code % 64)
  return sprintf("%c%c%c%c", 240 + int(code / 262144), 128 + int(code / 4096) % 64, 128 + int(code / 64) % 64, 128 + code % 64)
}
function string_value(    result, character, escaped, code, low) {
  if (substr(input, position++, 1) != "\"") fail("expected string")
  result = ""
  while (position <= length(input)) {
    character = substr(input, position++, 1)
    if (character == "\"") return result
    if (character ~ /[[:cntrl:]]/) fail("control character in string")
    if (character != "\\") { result = result character; continue }
    escaped = substr(input, position++, 1)
    if (escaped == "\"" || escaped == "\\" || escaped == "/") result = result escaped
    else if (escaped == "b") result = result sprintf("%c", 8)
    else if (escaped == "f") result = result sprintf("%c", 12)
    else if (escaped == "n") result = result "\n"
    else if (escaped == "r") result = result "\r"
    else if (escaped == "t") result = result "\t"
    else if (escaped == "u") {
      code = hexadecimal(substr(input, position, 4)); position += 4
      if (code >= 55296 && code <= 56319) {
        if (substr(input, position, 2) != "\\u") fail("missing low surrogate")
        position += 2
        low = hexadecimal(substr(input, position, 4)); position += 4
        if (low < 56320 || low > 57343) fail("invalid low surrogate")
        code = 65536 + (code - 55296) * 1024 + low - 56320
      } else if (code >= 56320 && code <= 57343) fail("unexpected low surrogate")
      if (code == 0) fail("NUL is not allowed")
      result = result utf8(code)
    } else fail("invalid escape")
  }
  fail("unterminated string")
}
function object_value(depth,    key, character, value, kind) {
  if (depth > 16) fail("nesting is too deep")
  position++
  whitespace()
  if (substr(input, position, 1) == "}") { position++; return }
  while (position <= length(input)) {
    whitespace(); key = string_value(); whitespace()
    if (substr(input, position++, 1) != ":") fail("expected colon")
    whitespace(); character = substr(input, position, 1)
    if (character == "{") { object_value(depth + 1); value = ""; kind = "object" }
    else if (character == "\"") { value = string_value(); kind = "string" }
    else if (substr(input, position, 4) == "true") { value = "true"; kind = "boolean"; position += 4 }
    else if (substr(input, position, 5) == "false") { value = "false"; kind = "boolean"; position += 5 }
    else if (substr(input, position, 4) == "null") { value = ""; kind = "null"; position += 4 }
    else if (match(substr(input, position), /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/)) {
      value = substr(input, position, RLENGTH); position += RLENGTH; kind = "number"
    } else fail("unsupported value")
    if (depth == 1) {
      if (key in values) fail("duplicate field: " key)
      values[key] = value; kinds[key] = kind
    }
    whitespace(); character = substr(input, position++, 1)
    if (character == "}") return
    if (character != ",") fail("expected comma or closing brace")
  }
  fail("unterminated object")
}
{ input = input $0 "\n" }
END {
  position = 1
  if (substr(input, 1, 3) == sprintf("%c%c%c", 239, 187, 191)) position = 4
  whitespace()
  if (substr(input, position, 1) != "{") fail("expected object")
  object_value(1); whitespace()
  if (position <= length(input)) fail("trailing content")
  if (!(field in values) || kinds[field] == "null") { print fallback; exit }
  if (kinds[field] != expected) fail("wrong type for " field)
  if (values[field] ~ /[[:cntrl:]]/) fail("control character in " field)
  print values[field]
}
`
}
