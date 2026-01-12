# Create Reactor App

🧩 **Create Reactor App** is a CLI tool that helps you quickly bootstrap a new application using the Reactor SDK. Get started with interactive AI applications in seconds!

## Quick Start

```bash
npx create-reactor-app my-app
```

Or with pnpm:

```bash
pnpm dlx create-reactor-app my-app
```

## Usage

### Interactive Mode

Simply run the command without arguments to be prompted for project details:

```bash
npx create-reactor-app
```

You'll be asked to:

1. Enter your project name
2. Select a template from available options

### Command Line Arguments

You can also provide arguments directly:

```bash
npx create-reactor-app [project-name] [template] [options]
```

**Options:**

| Option          | Description                                |
| --------------- | ------------------------------------------ |
| `--token`, `-t` | GitHub token for private repository access |
| `--help`, `-h`  | Show help message                          |

**Examples:**

```bash
# Create a project with longlive template
npx create-reactor-app my-game longlive

# Create a project with matrix template
npx create-reactor-app my-matrix-app matrix-2

# Create a project with a GitHub token (for private repos)
npx create-reactor-app my-app longlive --token ghp_xxxxxxxxxxxx
```

### Private Repository Access

If the repository is private, you'll be prompted to enter a GitHub token when:

- Fetching available templates fails
- Cloning the repository fails

You can also pass the token directly via the `--token` (or `-t`) argument to skip the prompt.

### Available Templates

The CLI automatically fetches the latest templates from the repository.

## Getting Started After Creation

After creating your project:

```bash
cd your-project-name
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see your application running. Make sure to setup your API keys first!

## Examples Repository

All templates are sourced from the official examples in the [Reactor SDK repository](https://github.com/reactor-team/js-sdk). You can browse the examples directory to see the full source code and understand how each template works.

## Documentation

For comprehensive guides, API references, and tutorials, visit the official Reactor documentation:

📚 **[Reactor Documentation](https://reactor-technologies.readme.io/docs/overview)**

## Requirements

- Node.js 16 or later
- pnpm (recommended) or npm

## Local Development

To test or develop the CLI locally:

```bash
# Navigate to the create-app package
cd packages/create-app

# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Link it globally
pnpm link --global
```

Now you can use `create-reactor-app` anywhere on your system:

```bash
create-reactor-app my-app
```

To unlink when you're done:

```bash
pnpm unlink --global
```

## License

ISC License - Copyright (c) Reactor Technologies, Inc.

## Support

- 📖 [Documentation](https://reactor-technologies.readme.io/docs/overview)
- 💻 [Examples Repository](https://github.com/reactor-team/js-sdk)
- 🐛 [Report Issues](https://github.com/reactor-team/js-sdk/issues)

---

**Happy building with Reactor! 🚀**
