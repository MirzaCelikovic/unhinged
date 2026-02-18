#!/bin/bash

# Check if SENTRY_AUTH_TOKEN is set
if [ -z "$SENTRY_AUTH_TOKEN" ]; then
  echo "SENTRY_AUTH_TOKEN is not set."
  echo -n "Enter your Sentry auth token (or press Enter to skip source map upload): "
  read -r token

  if [ -n "$token" ]; then
    export SENTRY_AUTH_TOKEN="$token"
  else
    export SENTRY_DISABLE_AUTO_UPLOAD=true
    echo "Skipping Sentry source map upload."
  fi
fi

eas build --platform ios --local
