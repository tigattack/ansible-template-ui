#!/bin/sh
set -eu

export ANSIBLE_STDOUT_CALLBACK=json
export ANSIBLE_COMMAND_WARNINGS=0
export ANSIBLE_RETRY_FILES_ENABLED=0

template_file=$(mktemp)
variables_file=$(mktemp)
output_file=$(mktemp)

echo "$TEMPLATE" | base64 -d > "$template_file"
echo "$VARIABLES" | base64 -d > "$variables_file"

# Install ansible-galaxy collections if specified
if [ -n "${ANSIBLE_GALAXY_COLLECTIONS:-}" ]; then
  # Word-split the space-separated list into positional parameters so each
  # collection name is passed as a separate argument to ansible-galaxy.
  # shellcheck disable=SC2086
  set -- $ANSIBLE_GALAXY_COLLECTIONS
  if ! timeout -s KILL 120 ansible-galaxy collection install "$@" --force; then
    echo "Failed to install galaxy collections: $ANSIBLE_GALAXY_COLLECTIONS" >&2
    exit 1
  fi
fi

[ -d /plugins/filter ] && export ANSIBLE_FILTER_PLUGINS="${ANSIBLE_FILTER_PLUGINS:-/plugins/filter}"
[ -d /plugins/lookup ] && export ANSIBLE_LOOKUP_PLUGINS="${ANSIBLE_LOOKUP_PLUGINS:-/plugins/lookup}"
[ -d /plugins/test ]   && export ANSIBLE_TEST_PLUGINS="${ANSIBLE_TEST_PLUGINS:-/plugins/test}"

timeout -s KILL 5 ansible-playbook \
  -e "@$variables_file" \
  -e "template_src=$template_file" \
  -e "template_dest=$output_file" \
  playbook.yml
