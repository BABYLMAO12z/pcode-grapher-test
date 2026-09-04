package com.pcodegrapher;

import java.util.List;
import java.util.Map;

/** Tiny JSON encoder (no deps) — đủ cho bridge, tránh phụ thuộc Gson. */
final class Json {
    private Json() {}

    static String encode(Object o) {
        StringBuilder sb = new StringBuilder();
        write(sb, o);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void write(StringBuilder sb, Object o) {
        if (o == null) { sb.append("null"); return; }
        if (o instanceof String) { string(sb, (String) o); return; }
        if (o instanceof Boolean) { sb.append(((Boolean) o) ? "true" : "false"); return; }
        if (o instanceof Number) { sb.append(o); return; }
        if (o instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                string(sb, e.getKey());
                sb.append(':');
                write(sb, e.getValue());
            }
            sb.append('}');
            return;
        }
        if (o instanceof List) {
            sb.append('[');
            boolean first = true;
            for (Object item : (List<?>) o) {
                if (!first) sb.append(',');
                first = false;
                write(sb, item);
            }
            sb.append(']');
            return;
        }
        string(sb, o.toString());
    }

    private static void string(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append('"');
    }
}
