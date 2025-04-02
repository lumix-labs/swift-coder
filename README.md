# Swift-Coder

A ready-to-use MCP (Machine Control Protocol) server designed to enhance your AI development workflow with Claude. Swift-Coder enables experienced software engineers to leverage the power of AI without the steep learning curve or high costs typically associated with specialized AI coding tools.

## Overview

Swift-Coder provides a lightweight, customizable environment that connects Claude's AI capabilities directly to your local development environment. For just $20 per month (the cost of a Claude membership), you get a powerful AI coding assistant that adapts to your workflow rather than forcing you to adapt to someone else's system.

### Key Features

- **Cost-effective**: Only requires a standard Claude membership ($20/month)
- **Privacy-focused**: All code and data remain on your local machine
- **Customizable**: Adapt to your existing workflow and repositories
- **Docker-based**: Simple setup with minimal dependencies

## Local Setup Instructions

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Claude membership](https://claude.ai/)
- Git

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/swift-coder.git
   cd swift-coder/mcp-server
   ```

2. Build the Docker image:
   ```bash
   ./build.sh
   ```
   This will create a Docker image named `swift-coder` that you can see in Docker Desktop.

## Connecting Claude to Swift-Coder

1. Open Claude Desktop application
2. Go to Settings → Developer → Edit Config
3. Add the following configuration block:

   ```json
   {
    "mcpServers": {
     "swift-coder": {
       "command": "docker",
       "args": [
         "run",
         "-i",
         "--rm",
         "-v",
         "/path/to/your/repo1:/repo1",
         "-v",
         "/path/to/your/repo2:/repo2",
         "-w",
         "/",
         "swift-coder"
       ]
     }
    }
   }
   ```

4. Replace the paths in the `-v` arguments with the absolute paths to your local repositories:
   - The format is: `/your/local/path:/mounted/path`
   - For simplicity, the right side (mounted path) should be a simple name at the root level
   - Example:
     ```
     "-v",
     "/Users/username/projects/my-app:/my-app",
     ```

5. Save and restart Claude

Now Claude is connected to your MCP server and can access your local repositories!

## Usage Examples

### Check Available Repositories

Ask Claude:
```
What repositories do you have access to?
```

### Analyze Code Files

Ask Claude to comment on specific files:
```
Can you analyze the file at /repo1/src/main.js and suggest improvements?
```

### Make Code Changes

Ask Claude to modify or create files in your repositories:
```
Create a new React component for a login form in /repo1/src/components/LoginForm.jsx
```

## Important Notes

- File paths must be specified relative to how they're mounted in the Docker container
- All repositories are accessible at the root level (e.g., `/repo1`, `/swift-coder`)
- For security, everything stays on your local machine
- Remember that the path on the right side of each `-v` argument is how Claude will reference the files

## Troubleshooting

If you experience issues:

1. Make sure Docker Desktop is running
2. Verify that the Docker image was built successfully
3. Check that the paths in your Claude configuration are correct and absolute
4. Ensure Claude's configuration has been saved properly

## Contact & Support

If you have questions or run into issues while setting up Swift-Coder, please:

- Open an [issue on GitHub](https://github.com/lumix-labs/swift-coder/issues)
- Contact me on Twitter: [@ashwani_48](https://twitter.com/ashwani_48)
- Contact me on LinkedIn: [@karoriwal](https://www.linkedin.com/in/karoriwal/)

Happy coding!
