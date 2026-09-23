/**
 * What the scanner says when a lookup FAILS (checklist b5-07).
 *
 * Not to be confused with a miss: `found: false` is a successful answer and
 * opens the report sheet. These strings are only for an ApiFailure, and the
 * two must never borrow each other's words (ERROR_LOG 063/065).
 *
 * Most of the copy is the search list's, reused verbatim so one kind of
 * trouble reads the same wherever the user meets it. Three kinds are
 * overridden because the search wording is about typing: "searching a bit
 * fast", "use a plain food name", "the food search endpoint". None of that is
 * true with a camera in your hand.
 */

import { FAILURE_COPY } from './SearchStateMessage';
import type { ApiFailure } from '../../api/core/request';

type Copy = { title: string; body: string };

const SCANNER_OVERRIDES: Partial<Record<ApiFailure['kind'], Copy>> = {
  throttled: { title: 'You are scanning a bit fast', body: 'Give it a moment and scan again.' },
  bad_request: { title: 'That code could not be read', body: 'Try the barcode again, straight on and in good light.' },
  not_found: { title: 'Scanning is unavailable', body: 'The barcode service could not be reached. Try again later.' },
};

export const barcodeFailureCopy = (failure: ApiFailure): Copy => {
  const override = SCANNER_OVERRIDES[failure.kind];
  if (override) return override;
  const shared = FAILURE_COPY[failure.kind];
  return { title: shared.title, body: shared.body };
};
