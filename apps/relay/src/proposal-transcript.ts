const CONTROL_ONLY_PATTERNS = [
  /^(?:reject|no|nope|try again)\.?$/i,
  /^(?:confirm|approved?|yes|yeah|yep)\.?$/i,
  /^(?:no(?:[,.]|\s)+)?(?:that'?s all|that is all|that'?s it|nothing else|done|finished|all good)\.?$/i,
  /^(?:goodbye|bye|hang up)\.?$/i
];

function normalizeUtterance(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isControlOnlyUtterance(value: string) {
  const normalized = normalizeUtterance(value);
  if (!normalized) {
    return true;
  }

  return CONTROL_ONLY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildProposalTranscript(callerNotes: string[]) {
  const normalizedNotes = callerNotes
    .map((note) => normalizeUtterance(note))
    .filter(Boolean);

  const substantiveNotes = normalizedNotes.filter((note) => !isControlOnlyUtterance(note));
  const notesForProposal = substantiveNotes.length > 0 ? substantiveNotes : normalizedNotes;

  return notesForProposal.join("\n").trim();
}
