/**
 * FROZEN (v1). Literal unit vectors for 12 and 16 directions — Math.sin/cos are not
 * required to be correctly rounded, so generators must never call them.
 */
export const DIR12: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.8660254037844387, 0.5], [0.5, 0.8660254037844386], [0, 1],
  [-0.5, 0.8660254037844387], [-0.8660254037844387, 0.5], [-1, 0], [-0.8660254037844386, -0.5],
  [-0.5, -0.8660254037844387], [0, -1], [0.5, -0.8660254037844385], [0.8660254037844384, -0.5],
];
export const DIR8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.7071067811865476, 0.7071067811865476], [0, 1], [-0.7071067811865476, 0.7071067811865476],
  [-1, 0], [-0.7071067811865476, -0.7071067811865476], [0, -1], [0.7071067811865476, -0.7071067811865476],
];
