#!/bin/bash

# Build script for swift-coder MCP server
rm -rf build

# Build the Docker image
docker build -t swift-coder .

echo "Docker image built successfully!"
echo "Update your Claude config to use the Docker container."

rm -rf build
