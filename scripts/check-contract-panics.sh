#!/usr/bin/env bash
# Fails if non-test Soroban contract code uses `.unwrap()` or `panic!` (#1562).
#
# Contract entrypoints must return a typed `#[contracterror]` instead, so
# clients get a stable error code rather than an opaque host trap.
# Test files (`*test*`) are skipped, and scanning of each source file stops at
# the first inline `#[cfg(test)] mod tests { ... }` block, which is allowed.
set -euo pipefail

cd "$(dirname "$0")/../backend/contracts"

status=0
while IFS= read -r file; do
  if awk -v f="$file" '
    pending && /^[[:space:]]*(pub[[:space:]]+)?mod[[:space:]].*\{/ { exit found }
    { pending = 0 }
    /^[[:space:]]*#\[cfg\(test\)\]/ { pending = 1; next }
    /^[[:space:]]*\/\// { next }
    /\.unwrap\(\)|panic!/ { printf "%s:%d: %s\n", f, NR, $0; found = 1 }
    END { exit found }
  ' "$file"; then :; else status=1; fi
done < <(find . -path '*/src/*.rs' ! -name '*test*' ! -path './test-utils/*' | sort)

if [ "$status" -ne 0 ]; then
  echo "error: use a #[contracterror] variant instead of .unwrap()/panic! in contract code" >&2
fi
exit "$status"
