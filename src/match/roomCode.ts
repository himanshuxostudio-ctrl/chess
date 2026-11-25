import { ROOM_ID_RE } from '../../shared/protocol';

/** Extract a room id from a pasted invitation link or bare code. */
export function parseRoom(input: string): string | null {
  const m = input.trim().toUpperCase().match(/([A-HJ-NP-Z2-9]{10})\/?$/);
  return m && ROOM_ID_RE.test(m[1]) ? m[1] : null;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
