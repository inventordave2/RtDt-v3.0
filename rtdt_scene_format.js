/* Shared RtDt scene document reader: JSON and a safe declarative YAML subset.
 * No executable tags, anchors, aliases, expressions, or JavaScript evaluation.
 * Both frontends feed the same JSON v1 scene model to the same constructor.
 */
var rtdt_scene_format = (function () {

    function strip_comment(source) {

        var quote = null, escaped = false;
        for (var i = 0; i < source.length; i++) {

            var c = source[i];
            if (escaped) { escaped = false; continue; }
            if (quote === '"' && c === '\\') { escaped = true; continue; }
            if (quote) { if (c === quote) quote = null; continue; }
            if (c === '"' || c === "'") { quote = c; continue; }
            if (c === '#' && (i === 0 || /\s/.test(source[i - 1])))
                return source.slice(0, i);
        }
        return source;
    }

    function split_items(value) {

        var out = [], start = 0, depth = 0, quote = null, escaped = false;
        for (var i = 0; i < value.length; i++) {

            var c = value[i];
            if (escaped) { escaped = false; continue; }
            if (quote === '"' && c === '\\') { escaped = true; continue; }
            if (quote) { if (c === quote) quote = null; continue; }
            if (c === '"' || c === "'") { quote = c; continue; }
            if (c === '[' || c === '{') depth++;
            if (c === ']' || c === '}') depth--;
            if (depth < 0) throw new Error('Unbalanced YAML collection');
            if (c === ',' && depth === 0) {

                out.push(value.slice(start, i).trim());
                start = i + 1;
            }
        }
        if (depth !== 0 || quote) throw new Error('Unclosed YAML collection');
        out.push(value.slice(start).trim());
        return out;
    }

    function colon_at(value) {

        var quote = null, escaped = false, depth = 0;
        for (var i = 0; i < value.length; i++) {

            var c = value[i];
            if (escaped) { escaped = false; continue; }
            if (quote === '"' && c === '\\') { escaped = true; continue; }
            if (quote) { if (c === quote) quote = null; continue; }
            if (c === '"' || c === "'") { quote = c; continue; }
            if (c === '[' || c === '{') depth++;
            if (c === ']' || c === '}') depth--;
            if (c === ':' && depth === 0 && (i === value.length - 1 ||
                /\s/.test(value[i + 1]))) return i;
        }
        return -1;
    }

    function scalar(raw) {

        var value = raw.trim();
        if (!value) return '';
        if (value === 'null' || value === '~') return null;
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value)) {

            var number = Number(value);
            if (!Number.isFinite(number)) throw new Error('Non-finite YAML number');
            return number;
        }
        if (value[0] === '"' && value[value.length - 1] === '"') return JSON.parse(value);
        if (value[0] === "'" && value[value.length - 1] === "'")
            return value.slice(1, -1).replace(/''/g, "'");
        if (value[0] === '[' && value[value.length - 1] === ']') {

            var items = split_items(value.slice(1, -1));
            return items.length === 1 && !items[0] ? [] : items.map(scalar);
        }
        if (value[0] === '{' && value[value.length - 1] === '}') {

            var object = {};
            var pairs = split_items(value.slice(1, -1));
            if (pairs.length === 1 && !pairs[0]) return object;
            pairs.forEach(function (item) {

                var colon = item.indexOf(':');
                if (colon < 1) throw new Error('Invalid YAML inline mapping');
                var key = item.slice(0, colon).trim().replace(/^["']|["']$/g, '');
                if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype' ||
                    Object.prototype.hasOwnProperty.call(object, key))
                    throw new Error('Unsafe or repeated YAML key: ' + key);
                object[key] = scalar(item.slice(colon + 1));
            });
            return object;
        }
        if (/^(?:!|&|\*|<<:)/.test(value) || /^(?:\||>)/.test(value))
            throw new Error('Unsupported YAML tag, alias, merge, or block scalar');
        return value;
    }

    function parse_yaml(source) {

        if (typeof source !== 'string' || source.length > 2000000)
            throw new Error('Invalid or oversized scene YAML document');
        var lines = [];
        source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(function (sourceLine, index) {

            if (/^\s*\t/.test(sourceLine)) throw new Error('YAML indentation must use spaces');
            var without = strip_comment(sourceLine).replace(/\s+$/, '');
            if (!without.trim() || without.trim() === '---' || without.trim() === '...') return;
            var spaces = /^ */.exec(without)[0].length;
            lines.push({indent:spaces, text:without.slice(spaces), number:index + 1});
        });
        if (!lines.length) throw new Error('Empty YAML scene document');
        var position = 0;
        function parse_block(indent) {

            if (position >= lines.length) return null;
            var isArray = lines[position].text === '-' || lines[position].text.indexOf('- ') === 0;
            var result = isArray ? [] : {};
            while (position < lines.length && lines[position].indent === indent) {

                var line = lines[position++];
                if (isArray) {

                    if (line.text !== '-' && line.text.indexOf('- ') !== 0)
                        throw new Error('Mixed YAML sequence/mapping at line ' + line.number);
                    var item = line.text === '-' ? '' : line.text.slice(2).trim();
                    var at = colon_at(item);
                    if (at > 0) {

                        var object = {};
                        var entryKey = item.slice(0, at).trim();
                        var entryValue = item.slice(at + 1).trim();
                        set_key(object, entryKey,
                            entryValue ? scalar(entryValue) : parse_child(indent, true));
                        if (position < lines.length && lines[position].indent > indent) {

                            var continuation = parse_block(lines[position].indent);
                            if (!continuation || Array.isArray(continuation))
                                throw new Error('Invalid YAML sequence mapping');
                            Object.keys(continuation).forEach(function (key) {

                                set_key(object,key,continuation[key]);
                            });
                        }
                        result.push(object);
                    } else result.push(item ? scalar(item) : parse_child(indent, false));
                } else {

                    var colon = colon_at(line.text);
                    if (colon < 1) throw new Error('Expected YAML mapping at line ' + line.number);
                    var key = line.text.slice(0, colon).trim();
                    var value = line.text.slice(colon + 1).trim();
                    set_key(result,key,value ? scalar(value) : parse_child(indent, true));
                }
            }
            return result;
        }
        function parse_child(parentIndent, emptyMapping) {

            if (position < lines.length && lines[position].indent > parentIndent)
                return parse_block(lines[position].indent);
            return emptyMapping ? {} : null;
        }
        function set_key(object, rawKey, value) {

            var key = rawKey.replace(/^["']|["']$/g, '');
            if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype' ||
                Object.prototype.hasOwnProperty.call(object,key))
                throw new Error('Unsafe or repeated YAML key: ' + key);
            object[key] = value;
        }
        var result = parse_block(lines[0].indent);
        if (position !== lines.length)
            throw new Error('Unexpected YAML indentation at line ' + lines[position].number);
        return result;
    }

    function parse(source) {

        if (typeof source !== 'string') return source;
        var trimmed = source.trim();
        if (trimmed[0] === '{' || trimmed[0] === '[') return JSON.parse(trimmed);
        return parse_yaml(source);
    }

    return {parse:parse, parse_yaml:parse_yaml};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_scene_format;
