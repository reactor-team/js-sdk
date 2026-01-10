#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if .env file exists
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${RED}Error: .env file not found in $SCRIPT_DIR${NC}"
    echo "Please create a .env file with NPM_TOKEN=your_token_here"
    exit 1
fi

# Load environment variables from .env file
export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)

# Check if NPM_TOKEN is set
if [ -z "$NPM_TOKEN" ]; then
    echo -e "${RED}Error: NPM_TOKEN not found in .env file${NC}"
    echo "Please add NPM_TOKEN=your_token_here to your .env file"
    exit 1
fi

# Change to the frontend-sdk directory
cd "$SCRIPT_DIR"

echo -e "${YELLOW}Publishing package with public access...${NC}"

# Build the package first
echo -e "${YELLOW}Building package...${NC}"
pnpm run build

# Publish with public access
echo -e "${YELLOW}Publishing to npm...${NC}"
pnpm publish --access public --no-git-checks

echo -e "${GREEN}✓ Package published successfully!${NC}"
