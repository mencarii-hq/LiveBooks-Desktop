import type { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';

/**
 * Incrementally parse a top-level JSON array from a byte stream, yielding one
 * parsed element at a time. Used to index multi-hundred-MB per-entity files
 * from the QBD export ZIP without materializing the whole array in RAM.
 *
 * Individual elements (single Ret records) are small, so each element is
 * buffered as text and passed to JSON.parse once complete.
 */
export async function* iterateJsonArrayItems(
  stream: Readable
): AsyncGenerator<unknown> {
  const decoder = new StringDecoder('utf8');

  let inArray = false;
  let depth = 0; // nesting depth relative to the top-level array
  let inString = false;
  let escaped = false;
  let item = '';

  const flush = (): unknown | typeof NO_ITEM => {
    const text = item.trim();
    item = '';
    if (!text) {
      return NO_ITEM;
    }
    return JSON.parse(text) as unknown;
  };

  for await (const chunk of stream) {
    const text = decoder.write(chunk as Buffer);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        item += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (!inArray) {
        if (ch === '[') {
          inArray = true;
        } else if (!/\s/.test(ch)) {
          throw new Error(`Expected top-level JSON array, found '${ch}'`);
        }
        continue;
      }

      switch (ch) {
        case '"':
          inString = true;
          item += ch;
          break;
        case '{':
        case '[':
          depth += 1;
          item += ch;
          break;
        case '}':
          depth -= 1;
          item += ch;
          break;
        case ']':
          if (depth === 0) {
            // End of the top-level array.
            const last = flush();
            if (last !== NO_ITEM) {
              yield last;
            }
            return;
          }
          depth -= 1;
          item += ch;
          break;
        case ',':
          if (depth === 0) {
            const done = flush();
            if (done !== NO_ITEM) {
              yield done;
            }
          } else {
            item += ch;
          }
          break;
        default:
          item += ch;
      }
    }
  }

  const trailing = item.trim();
  if (inArray || trailing) {
    throw new Error('Unexpected end of JSON array stream');
  }
}

const NO_ITEM = Symbol('no-item');
