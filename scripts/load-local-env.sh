#!/usr/bin/env bash
# Usage: eval "$(bash scripts/load-local-env.sh)"   (requires `supabase start`)
supabase status -o env | sed -n \
  -e 's/^API_URL=\(.*\)/export TV_URL=\1/p' \
  -e 's/^ANON_KEY=\(.*\)/export TV_ANON_KEY=\1/p' \
  -e 's/^SERVICE_ROLE_KEY=\(.*\)/export TV_SERVICE_KEY=\1/p'
