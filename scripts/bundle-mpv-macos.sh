#!/bin/bash

# Bundle mpv for macOS
# This script copies mpv and its dependencies to the Tauri app bundle

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$PROJECT_DIR/src-tauri/binaries"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TARGET="aarch64-apple-darwin"
    HOMEBREW_PREFIX="/opt/homebrew"
else
    TARGET="x86_64-apple-darwin"
    HOMEBREW_PREFIX="/usr/local"
fi

echo "Architecture: $ARCH ($TARGET)"
echo "Homebrew prefix: $HOMEBREW_PREFIX"

# Create binaries directory
mkdir -p "$BINARIES_DIR"

# Find mpv path
MPV_PATH=$(which mpv)
if [ -z "$MPV_PATH" ]; then
    echo "Error: mpv not found. Please install mpv first:"
    echo "  brew install mpv"
    exit 1
fi

echo "Found mpv at: $MPV_PATH"

# Copy mpv binary with target suffix (Tauri convention)
cp "$MPV_PATH" "$BINARIES_DIR/mpv-$TARGET"
chmod +x "$BINARIES_DIR/mpv-$TARGET"

echo "Copied mpv to: $BINARIES_DIR/mpv-$TARGET"

# Get list of dylibs that mpv depends on
echo "Collecting dependencies..."

DYLIBS=$(otool -L "$MPV_PATH" | grep "$HOMEBREW_PREFIX" | awk '{print $1}')

# Create libs directory
LIBS_DIR="$BINARIES_DIR/libs"
mkdir -p "$LIBS_DIR"

# Copy each dylib
for DYLIB in $DYLIBS; do
    if [ -f "$DYLIB" ]; then
        DYLIB_NAME=$(basename "$DYLIB")
        cp "$DYLIB" "$LIBS_DIR/$DYLIB_NAME"
        echo "  Copied: $DYLIB_NAME"
    fi
done

# Also copy ffmpeg libraries that mpv needs
FFMPEG_LIBS=$(find "$HOMEBREW_PREFIX/lib" -name "libav*.dylib" -o -name "libsw*.dylib" 2>/dev/null | head -20)
for LIB in $FFMPEG_LIBS; do
    if [ -f "$LIB" ] && [ ! -L "$LIB" ]; then
        LIB_NAME=$(basename "$LIB")
        if [ ! -f "$LIBS_DIR/$LIB_NAME" ]; then
            cp "$LIB" "$LIBS_DIR/$LIB_NAME"
            echo "  Copied: $LIB_NAME"
        fi
    fi
done

echo ""
echo "Bundle complete!"
echo "Files in $BINARIES_DIR:"
ls -la "$BINARIES_DIR"
echo ""
echo "Libraries in $LIBS_DIR:"
ls -la "$LIBS_DIR" | head -20
echo "..."

