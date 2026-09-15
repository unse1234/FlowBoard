// Control, zero-width and bidirectional-formatting characters, as code point
// ranges. None belong in a label, and the bidi overrides can make rendered text
// read differently from what it actually contains.
const UNSAFE_TEXT_CODE_POINTS = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];

// Newlines and tabs carry meaning in a description; other control characters do not.
const PROMPT_CONTROL_CODE_POINTS = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x007f],
];

/**
 * A single line of display text: unsafe characters removed, whitespace
 * collapsed, and cut to `maxLength` characters with an ellipsis. Anything that
 * is not a string becomes "".
 */
function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";

  // No label survives past maxLength code points, and each is at most two
  // UTF-16 units, so anything beyond this is never needed.
  const text = Array.from(value.slice(0, maxLength * 4), (character) =>
    isInRanges(character, UNSAFE_TEXT_CODE_POINTS) ? " " : character,
  )
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  // Counted in code points, so an emoji is never split in half.
  const characters = Array.from(text);
  if (characters.length <= maxLength) return text;

  return characters.slice(0, maxLength - 1).join("").trimEnd() + "…";
}

/** Remove control characters from free text while keeping its line breaks and tabs. */
function stripControlCharacters(value) {
  return Array.from(value)
    .filter((character) => !isInRanges(character, PROMPT_CONTROL_CODE_POINTS))
    .join("");
}

function isInRanges(character, ranges) {
  const codePoint = character.codePointAt(0);

  return ranges.some(([from, to]) => codePoint >= from && codePoint <= to);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  isPlainObject,
  sanitizeText,
  stripControlCharacters,
};
