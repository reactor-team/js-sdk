#!/usr/bin/env node
import inquirer from "inquirer";
import { execSync } from "child_process";
import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import chalk from "chalk";

const REPO_OWNER = "reactor-team";
const REPO_NAME = "js-sdk";
const REPO_URL = `github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const EXAMPLES_PATH = "examples";

// Aliases for cases where a model's public name differs from its template
// folder in the repo. Leave empty when names map 1:1 to folders.
const MODEL_MAP: Record<string, string> = {};

function resolveTemplateFolder(name: string): string {
  return MODEL_MAP[name] ?? name;
}

function formatAvailableModels(repoTemplates: string[]): string {
  const lines: string[] = [];

  // Section 1: explicit name → folder aliases, with the resolved folder
  // shown in a lighter, italic style.
  const mappings = Object.entries(MODEL_MAP).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  for (const [name, folder] of mappings) {
    if (repoTemplates.includes(folder)) {
      lines.push(`  ${name}${chalk.dim.italic(` → ${folder}`)}`);
    }
  }

  // Section 2: remaining folders that aren't already covered by an alias.
  const mappedTargets = new Set(Object.values(MODEL_MAP));
  const remaining = repoTemplates
    .filter((folder) => !mappedTargets.has(folder))
    .sort();
  for (const folder of remaining) {
    lines.push(`  ${folder}`);
  }

  if (lines.length === 0) {
    lines.push("  (none)");
  }

  return lines.join("\n");
}

function getAuthenticatedRepoUrl(token: string): string {
  return `https://${token}@${REPO_URL}`;
}

async function fetchTemplates(token?: string): Promise<string[] | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${EXAMPLES_PATH}`,
      { headers }
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { name: string; type: string }[];
    return data.filter((item) => item.type === "dir").map((item) => item.name);
  } catch {
    return null;
  }
}

async function promptForToken(): Promise<string | undefined> {
  try {
    const { ghToken } = await inquirer.prompt([
      {
        type: "password",
        name: "ghToken",
        message: "Enter your GitHub token (leave empty to cancel):",
        mask: "*",
      },
    ]);
    return ghToken || undefined;
  } catch (error: unknown) {
    const err = error as {
      isTtyError?: boolean;
      name?: string;
      message?: string;
    };
    if (
      err.isTtyError ||
      err.name === "ExitPromptError" ||
      err.message?.includes("User force closed the prompt") ||
      err.message?.includes("Prompt was canceled")
    ) {
      console.log(chalk.yellow("\n\n❌ Installation cancelled by user."));
      process.exit(0);
    }
    throw error;
  }
}

function parseArgs(args: string[]): {
  projectName?: string;
  model?: string;
  token?: string;
  help: boolean;
} {
  const result: {
    projectName?: string;
    model?: string;
    token?: string;
    help: boolean;
  } = { help: false };
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--token" || arg === "-t") {
      result.token = args[++i];
    } else if (arg.startsWith("--token=")) {
      result.token = arg.split("=")[1];
    } else if (arg === "--model" || arg === "-m") {
      result.model = args[++i];
    } else if (arg.startsWith("--model=")) {
      result.model = arg.slice("--model=".length);
    } else if (!arg.startsWith("-")) {
      positionalArgs.push(arg);
    }
  }

  result.projectName = positionalArgs[0];

  return result;
}

function showUsage(): void {
  console.log(chalk.cyan("\n⚛️ Create Reactor App\n"));
  console.log(chalk.white("Usage:"));
  console.log(
    chalk.white(
      "  create-reactor-app [project-name] --model=<name> [options]\n"
    )
  );
  console.log(chalk.white("Arguments:"));
  console.log(
    chalk.white(
      "  project-name  Name of the project to create (prompted if omitted)\n"
    )
  );
  console.log(chalk.white("Options:"));
  console.log(
    chalk.white("  --model, -m   Model to scaffold a project for (required)")
  );
  console.log(
    chalk.white("  --token, -t   GitHub token for private repository access")
  );
  console.log(chalk.white("  --help, -h    Show this help message\n"));
  console.log(
    chalk.white("Run without --model to see the list of available models.\n")
  );
  console.log(chalk.white("Examples:"));
  console.log(chalk.white("  create-reactor-app my-app --model=helios"));
  console.log(chalk.white("  create-reactor-app --model=lingbot my-app"));
  console.log(chalk.white("  create-reactor-app --model=helios\n"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const {
    projectName: argProjectName,
    model: argModel,
    token: argToken,
    help,
  } = parseArgs(args);

  // Show help if requested
  if (help) {
    showUsage();
    process.exit(0);
  }

  console.log(chalk.cyan("\n⚛️ Create Reactor App\n"));

  let token = argToken;

  // Try to fetch templates, prompt for token if needed
  let templates = await fetchTemplates(token);

  if (!templates && !token) {
    console.log(
      chalk.yellow(
        `⚠️  Could not fetch templates from GitHub (${REPO_URL}). Repository may be private.`
      )
    );

    token = await promptForToken();

    if (token) {
      console.log(chalk.green("\nRetrying with authentication...\n"));
      templates = await fetchTemplates(token);
    }
  }

  if (!templates) {
    console.error(
      chalk.red(
        "\n❌ Failed to fetch templates from GitHub. Please check your token and try again."
      )
    );
    process.exit(1);
  }

  // Require --model; if missing, print available models and exit
  if (!argModel) {
    console.error(chalk.red("\n❌ No model specified. Use --model=<name>.\n"));
    console.log(chalk.white("Available models:"));
    console.log(formatAvailableModels(templates));
    console.log();
    process.exit(1);
  }

  // Resolve folder via mapping (fallback: model name itself)
  const template = resolveTemplateFolder(argModel);

  // Validate the resolved folder exists in the repo
  if (!templates.includes(template)) {
    const resolvedHint =
      template !== argModel ? ` (resolved to folder "${template}")` : "";
    console.error(
      chalk.red(`\n❌ Model "${argModel}" not found${resolvedHint}.\n`)
    );
    console.log(chalk.white("Available models:"));
    console.log(formatAvailableModels(templates));
    console.log();
    process.exit(1);
  }

  // Prepare prompts, skipping those with provided arguments
  const prompts: any[] = [];

  if (!argProjectName) {
    prompts.push({
      type: "input",
      name: "projectName",
      message: "Enter your project name:",
      validate: (input: string) =>
        input ? true : "Project name cannot be empty.",
    });
  }

  // Get answers from prompts (if any are needed)
  let answers: any = {};
  if (prompts.length > 0) {
    try {
      answers = await inquirer.prompt(prompts);
    } catch (error: any) {
      // Handle Ctrl+C cancellation
      if (
        error.isTtyError ||
        error.name === "ExitPromptError" ||
        error.message?.includes("User force closed the prompt") ||
        error.message?.includes("Prompt was canceled")
      ) {
        console.log(chalk.yellow("\n\n❌ Installation cancelled by user."));
        process.exit(0);
      }
      throw error;
    }
  }

  // Use provided arguments or prompted answers
  const projectName = argProjectName || answers.projectName;
  const dest = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(dest)) {
    console.error(chalk.red(`Folder "${projectName}" already exists.`));
    process.exit(1);
  }

  const cloneSuffix = template !== argModel ? ` (folder: ${template})` : "";
  console.log(chalk.green(`\nCloning model "${argModel}"${cloneSuffix}...\n`));

  const git = simpleGit();

  // Helper function to clone with optional token
  async function tryClone(authToken?: string): Promise<boolean> {
    const repoUrl = authToken
      ? getAuthenticatedRepoUrl(authToken)
      : `https://${REPO_URL}`;
    try {
      await git.clone(repoUrl, projectName, ["--depth", "1"]);
      return true;
    } catch {
      return false;
    }
  }

  // Try to clone, prompt for token if it fails
  let cloneSuccess = await tryClone(token);

  if (!cloneSuccess && !token) {
    console.log(
      chalk.yellow(
        "\n⚠️  Repository not accessible. It may be private or require authentication."
      )
    );

    token = await promptForToken();

    if (token) {
      console.log(chalk.green("\nRetrying with authentication...\n"));
      cloneSuccess = await tryClone(token);
    }
  }

  if (!cloneSuccess) {
    console.error(
      chalk.red(
        "\n❌ Failed to clone repository. Please check your token and try again."
      )
    );
    process.exit(1);
  }

  const examplesDir = path.join(dest, EXAMPLES_PATH);
  const templateDir = path.join(examplesDir, template);

  if (!fs.existsSync(templateDir)) {
    console.error(chalk.red(`Template "${template}" not found.`));
    process.exit(1);
  }

  // Record which files belong to the template before moving
  const templateFiles = new Set(fs.readdirSync(templateDir));

  // Move template files up to dest
  for (const file of templateFiles) {
    fs.renameSync(path.join(templateDir, file), path.join(dest, file));
  }

  // Clean up: remove all cloned repo files that aren't part of the selected template
  for (const file of fs.readdirSync(dest)) {
    if (!templateFiles.has(file)) {
      fs.rmSync(path.join(dest, file), { recursive: true, force: true });
    }
  }

  console.log(chalk.yellow("\nInstalling dependencies...\n"));

  try {
    execSync("pnpm install", { cwd: dest, stdio: "inherit" });
  } catch {
    console.error(chalk.red(`\n❌ "pnpm install" failed in ${dest}.`));
    console.log(
      chalk.white(
        `\nThe project was scaffolded, but dependencies did not install.`
      )
    );
    console.log(chalk.white(`Review the error above, then retry manually:\n`));
    console.log(chalk.white(`  cd ${projectName}`));
    console.log(chalk.white(`  pnpm install\n`));
    process.exit(1);
  }

  console.log(
    chalk.green(
      `\n✅ Project "${projectName}" created successfully using model "${argModel}"!\n`
    )
  );
  console.log(chalk.cyan("Next steps:"));
  console.log(chalk.white(`  cd ${projectName}`));
  console.log(chalk.white(`  cp .env.example .env.local`));
  console.log(chalk.white(`  # Add your API keys to .env.local`));
  console.log(chalk.white(`  pnpm dev\n`));
  console.log(chalk.cyan("Learn more:"));
  console.log(chalk.white(`  Docs:    https://docs.reactor.inc/overview`));
  console.log(chalk.white(`  Discord: https://discord.gg/xSbBWECQRk\n`));
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
