/**
 * 生成部署清单读取与 Compose 快照合并所用的 POSIX awk 程序。
 * @returns 不依赖 Node/jq 的严格 JSON 工具；输出仅由 action 指定。
 * @example 模块内部上下文
 * ```ts
 * const program = createDeploymentJsonTool()
 * // 将 program 交给 awk，action=merge 时输入已安装快照与本次服务定义。
 * void program
 * ```
 */
export function createDeploymentJsonTool(): string {
  return String.raw`function fail(message) {
  failed = 1
  print "Invalid deployment JSON: " message > "/dev/stderr"
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
function value_node(depth,    node, start, character, key, key_start, child) {
  if (depth > 32) fail("nesting is too deep")
  whitespace(); start = position; node = ++node_count
  character = substr(input, position, 1)
  if (character == "{") {
    kinds[node] = "object"; position++; whitespace()
    if (substr(input, position, 1) == "}") position++
    else while (position <= length(input)) {
      whitespace(); key_start = position; key = string_value()
      if ((node SUBSEP key) in children) fail("duplicate object field")
      key_json[node, key] = substr(input, key_start, position - key_start)
      whitespace()
      if (substr(input, position++, 1) != ":") fail("expected colon")
      child = value_node(depth + 1)
      children[node, key] = child; order[node, ++sizes[node]] = key
      whitespace(); character = substr(input, position++, 1)
      if (character == "}") break
      if (character != ",") fail("expected comma or closing brace")
    }
    if (character != "{" && character != "}") fail("unterminated object")
  } else if (character == "[") {
    kinds[node] = "array"; position++; whitespace()
    if (substr(input, position, 1) == "]") position++
    else while (position <= length(input)) {
      child = value_node(depth + 1); items[node, ++sizes[node]] = child
      whitespace(); character = substr(input, position++, 1)
      if (character == "]") break
      if (character != ",") fail("expected comma or closing bracket")
    }
    if (character != "[" && character != "]") fail("unterminated array")
  } else if (character == "\"") {
    kinds[node] = "string"; values[node] = string_value()
  } else if (substr(input, position, 4) == "true") {
    kinds[node] = "boolean"; values[node] = "true"; position += 4
  } else if (substr(input, position, 5) == "false") {
    kinds[node] = "boolean"; values[node] = "false"; position += 5
  } else if (substr(input, position, 4) == "null") {
    kinds[node] = "null"; position += 4
  } else if (match(substr(input, position), /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/)) {
    kinds[node] = "number"; values[node] = substr(input, position, RLENGTH); position += RLENGTH
  } else fail("unsupported value")
  raw[node] = substr(input, start, position - start)
  return node
}
function parse_document(    node) {
  if (length(input) > (action == "runtime" ? 16777216 : 1048576)) fail("document exceeds its size limit")
  position = 1
  if (substr(input, 1, 3) == sprintf("%c%c%c", 239, 187, 191)) position = 4
  whitespace(); node = value_node(1); whitespace()
  if (kinds[node] != "object") fail("expected object")
  if (position <= length(input)) fail("trailing content")
  roots[++document_count] = node
}
function object_text(node,    result, i, key) {
  result = "{"
  for (i = 1; i <= sizes[node]; i++) {
    key = order[node, i]
    result = result (i > 1 ? "," : "") key_json[node, key] ":" raw[children[node, key]]
  }
  return result "}"
}
function merged_map(previous, incoming,    result, count, i, key, child) {
  if (previous && kinds[previous] == "null") previous = 0
  if (incoming && kinds[incoming] == "null") incoming = 0
  if ((previous && kinds[previous] != "object") || (incoming && kinds[incoming] != "object")) fail("expected Compose mapping")
  result = "{"; count = 0
  for (i = 1; i <= sizes[previous]; i++) {
    key = order[previous, i]
    child = (incoming SUBSEP key) in children ? children[incoming, key] : children[previous, key]
    result = result (count++ ? "," : "") key_json[previous, key] ":" raw[child]
  }
  for (i = 1; i <= sizes[incoming]; i++) {
    key = order[incoming, i]
    if ((previous SUBSEP key) in children) continue
    result = result (count++ ? "," : "") key_json[incoming, key] ":" raw[children[incoming, key]]
  }
  return result "}"
}
function merge_compose(    previous, incoming, result, count, i, key, before, after, value, pass, node) {
  if (document_count != 2) fail("Compose merge requires two documents")
  previous = roots[1]; incoming = roots[2]
  if (kinds[children[previous, "services"]] != "object" || kinds[children[incoming, "services"]] != "object") fail("Compose services are missing")
  result = "{"; count = 0
  for (pass = 1; pass <= 2; pass++) {
    node = pass == 1 ? previous : incoming
    for (i = 1; i <= sizes[node]; i++) {
      key = order[node, i]
      if (pass == 2 && ((previous SUBSEP key) in children)) continue
      before = children[previous, key]; after = children[incoming, key]
      if (key == "services" || key == "volumes" || key == "networks") value = merged_map(before, after)
      else value = raw[after ? after : before]
      result = result (count++ ? "," : "") key_json[node, key] ":" value
    }
  }
  return result "}"
}
function quote_json(value,    result, i, character) {
  if (value ~ /[[:cntrl:]]/) fail("control character in proxy mount")
  result = "\""
  for (i = 1; i <= length(value); i++) {
    character = substr(value, i, 1)
    result = result (character == "\\" || character == "\"" ? "\\" : "") character
  }
  return result "\""
}
function metadata_string(value,    result, i, character) {
  result = "\""
  for (i = 1; i <= length(value); i++) {
    character = substr(value, i, 1)
    if (character == "\n") result = result "\\n"
    else if (character ~ /[[:cntrl:]]/) fail("control character in metadata")
    else result = result (character == "\\" || character == "\"" ? "\\" : "") character
  }
  return result "\""
}
function combined_rows(previous, incoming, keyed,    values_by_key, keys_in_order, count, pass, rows, total, i, row, key, position, result) {
  count = 0
  for (pass = 1; pass <= 2; pass++) {
    total = split(pass == 1 ? previous : incoming, rows, /\n/)
    for (i = 1; i <= total; i++) {
      row = rows[i]
      if (!length(row)) continue
      position = index(row, " "); key = keyed && position ? substr(row, 1, position - 1) : row
      if (!(key in values_by_key)) keys_in_order[++count] = key
      values_by_key[key] = row
    }
  }
  result = ""
  for (i = 1; i <= count; i++) result = result values_by_key[keys_in_order[i]] "\n"
  return result
}
function finalize_metadata(    previous, incoming, before, after, fields, count, i, key, old_node, new_node, node, value) {
  if (document_count != 2) fail("metadata merge requires two documents")
  previous = roots[1]; incoming = roots[2]
  before = children[previous, "metadata"]; after = children[incoming, "metadata"]
  if (kinds[before] != "object" || kinds[after] != "object") fail("deployment metadata is missing")
  if (values[children[incoming, "partial"]] != "true") return raw[incoming]
  count = split("state-backends managed-app-keys managed-bindings managed-volumes dependencies", fields, " ")
  for (i = 1; i <= count; i++) {
    key = fields[i]; old_node = children[before, key]; new_node = children[after, key]
    if ((old_node && kinds[old_node] != "string") || (new_node && kinds[new_node] != "string")) fail("invalid deployment metadata type")
    value = combined_rows(values[old_node], values[new_node], key == "state-backends")
    if (!new_node) {
      new_node = ++node_count; children[after, key] = new_node
      key_json[after, key] = quote_json(key); order[after, ++sizes[after]] = key; kinds[new_node] = "string"
    }
    values[new_node] = value; raw[new_node] = metadata_string(value)
  }
  raw[after] = object_text(after)
  return object_text(incoming)
}
function service_names(    services, result, i, key) {
  if (document_count != 1) fail("service lookup requires one document")
  services = children[roots[1], "services"]
  if (kinds[services] != "object") fail("Compose services are missing")
  result = ""
  for (i = 1; i <= sizes[services]; i++) {
    key = order[services, i]
    if (key !~ /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/) fail("invalid Compose service name")
    result = result key "\n"
  }
  return result
}
function update_proxy(    root, services, selected, volumes, i, item, matches, result) {
  if (document_count != 1 || (service != "web" && service != "gateway") || !mount) fail("invalid proxy update")
  root = roots[1]; services = children[root, "services"]; selected = children[services, service]; volumes = children[selected, "volumes"]
  if (kinds[volumes] != "array") fail("proxy config mount is missing")
  result = "["; matches = 0
  for (i = 1; i <= sizes[volumes]; i++) {
    item = items[volumes, i]
    if (kinds[item] == "string" && values[item] ~ /\/etc\/nginx\/conf[.]d\/default[.]conf(:[a-z,]+)?$/) { raw[item] = quote_json(mount); matches++ }
    result = result (i > 1 ? "," : "") raw[item]
  }
  if (matches != 1) fail("proxy must have one config mount")
  raw[volumes] = result "]"
  raw[selected] = object_text(selected); raw[services] = object_text(services)
  return object_text(root)
}
function proxy_source(    services, selected, volumes, i, item, at, matches, result) {
  if (document_count != 1 || (service != "web" && service != "gateway")) fail("invalid proxy lookup")
  services = children[roots[1], "services"]; selected = children[services, service]; volumes = children[selected, "volumes"]
  if (kinds[volumes] != "array") fail("proxy config mount is missing")
  for (i = 1; i <= sizes[volumes]; i++) {
    item = items[volumes, i]
    if (kinds[item] == "string" && values[item] ~ /:\/etc\/nginx\/conf[.]d\/default[.]conf(:[a-z,]+)?$/) {
      at = index(values[item], ":/etc/nginx/conf.d/default.conf")
      result = substr(values[item], 1, at - 1); matches++
    }
  }
  if (matches != 1 || result ~ /[[:cntrl:]]/) fail("proxy must have one config mount")
  return result
}
function read_field(    node, count, parts, i, text) {
  if (document_count != 1) fail("field read requires one document")
  node = roots[1]; count = split(field, parts, /\./)
  for (i = 1; i <= count; i++) node = children[node, parts[i]]
  if (!node || kinds[node] == "null") {
    if (required == "1") fail("missing required field: " field)
    return fallback
  }
  if (expected == "json") return raw[node]
  if (kinds[node] != expected) fail("wrong type for " field)
  text = values[node]
  if (action == "runtime") gsub(/[[:cntrl:]]/, "", text)
  else if (multiline == "1") gsub(/\n/, "", text)
  if (text ~ /[[:cntrl:]]/) fail("control character in " field)
  return values[node]
}
{
  if (FILENAME != filename) {
    if (filename != "") parse_document()
    filename = FILENAME; input = ""
  }
  input = input $0 "\n"
  if (length(input) > (action == "runtime" ? 16777216 : 1048576)) fail("document exceeds its size limit")
}
END {
  if (failed) exit 2
  parse_document()
  if (action == "merge") print merge_compose()
  else if (action == "metadata") print finalize_metadata()
  else if (action == "services") printf "%s", service_names()
  else if (action == "proxy") print update_proxy()
  else if (action == "proxy-source") print proxy_source()
  else if (action == "" || action == "read" || action == "runtime") print read_field()
  else fail("unknown action")
}
`
}
