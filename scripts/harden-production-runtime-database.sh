#!/bin/sh
set -eu

echo 'ERROR: This legacy runtime hardening path is retired.' >&2
echo 'Use the protected Production Database Role Bootstrap workflow in HARDEN mode.' >&2
echo 'The retired path must never grant broad runtime privileges directly.' >&2
exit 64
