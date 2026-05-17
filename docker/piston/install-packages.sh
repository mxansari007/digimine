#!/bin/sh
# Install Piston language packages via the local API

PISTON_URL="http://localhost:2000"
MAX_RETRIES=30
RETRY_DELAY=2

echo "Waiting for Piston API to be ready..."
for i in $(seq 1 $MAX_RETRIES); do
    if curl -sf "$PISTON_URL/api/v2/runtimes" > /dev/null 2>&1; then
        echo "Piston API is ready."
        break
    fi
    if [ "$i" -eq $MAX_RETRIES ]; then
        echo "Piston API did not start in time."
        exit 1
    fi
    sleep "$RETRY_DELAY"
done

is_installed() {
    LANG="$1"
    RUNTIMES=$(curl -sf "$PISTON_URL/api/v2/runtimes" 2>/dev/null)
    if [ -z "$RUNTIMES" ]; then
        return 1
    fi
    # Handle both "language":"python" and "language" : "python" (with spaces)
    echo "$RUNTIMES" | grep -qi "\"language\"[[:space:]]*:[[:space:]]*\"$LANG\""
}

install_package() {
    LANG="$1"
    
    if is_installed "$LANG"; then
        echo "$LANG is already installed. Skipping."
        return 0
    fi
    
    echo "Installing $LANG..."
    # Capture HTTP code and response body separately (don't use -f)
    HTTP_CODE=$(curl -s -o /tmp/install_${LANG}.json -w "%{http_code}" -m 300 \
        -X POST "$PISTON_URL/api/v2/packages" \
        -H "Content-Type: application/json" \
        -d "{\"language\":\"$LANG\",\"version\":\"*\"}" 2>/dev/null)
    
    RESPONSE=$(cat /tmp/install_${LANG}.json 2>/dev/null || echo "")
    rm -f /tmp/install_${LANG}.json
    
    # Treat 200 OK or "already installed" message as success
    if [ "$HTTP_CODE" = "200" ] || echo "$RESPONSE" | grep -qi "already installed"; then
        echo "$LANG installed successfully."
        return 0
    fi
    
    echo "Warning: Failed to install $LANG (HTTP $HTTP_CODE). Response: $RESPONSE"
    return 1
}

FAILED=0
install_package "python" || FAILED=1
install_package "node" || FAILED=1        # JavaScript / Node.js
install_package "gcc" || FAILED=1         # C / C++
install_package "openjdk" || FAILED=1     # Java

if [ $FAILED -eq 1 ]; then
    echo "WARNING: Some packages failed to install. Already-installed packages were skipped."
    echo "You can manually retry failed packages later."
fi

echo "Package installation step complete."
