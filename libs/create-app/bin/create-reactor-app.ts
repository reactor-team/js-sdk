#!/usr/bin/env node
import inquirer from "inquirer";
import { execSync } from "child_process";
import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import readline from "readline";

const REPO = "https://github.com/reactor-team/js-sdk.git";
const EXAMPLES_PATH = "examples";

async function getTemplates(): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/reactor-team/js-sdk/contents/${EXAMPLES_PATH}`,
    );
    const data = (await res.json()) as { name: string; type: string }[];
    return data.filter((item) => item.type === "dir").map((item) => item.name);
  } catch {
    console.log(
      chalk.yellow(
        "⚠️  Could not fetch from GitHub, using fallback templates.",
      ),
    );
    return ["longlive", "matrix-2"];
  }
}

function showUsage(): void {
  console.log(chalk.cyan("\n⚛️ Create Reactor App\n"));
  console.log(chalk.white("Usage:"));
  console.log(chalk.white("  create-reactor-app [project-name] [template]\n"));
  console.log(chalk.white("Arguments:"));
  console.log(chalk.white("  project-name  Name of the project to create"));
  console.log(
    chalk.white(
      "  template      Template to use (longlive, matrix-2, mk64, etc.)\n",
    ),
  );
  console.log(
    chalk.white(
      "If arguments are not provided, you will be prompted interactively.\n",
    ),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show help if requested
  if (args.includes("--help") || args.includes("-h")) {
    showUsage();
    process.exit(0);
  }

  // Handle Ctrl+C and ESC gracefully during interactive phase
  let isInteractivePhase = true;

  process.on("SIGINT", () => {
    if (isInteractivePhase) {
      console.log(chalk.yellow("\n\n❌ Installation cancelled by user."));
      process.exit(0);
    }
  });

  // Set up ESC key handling
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (key) => {
      if (isInteractivePhase && key === "\u001b") {
        // ESC key
        console.log(chalk.yellow("\n\n❌ Installation cancelled by user."));
        process.exit(0);
      }
    });
  }

  console.log(chalk.cyan("\n⚛️ Create Reactor App\n"));

  const templates = await getTemplates();

  // Parse command line arguments
  const [argProjectName, argTemplate] = args;

  // Validate template argument if provided
  if (argTemplate && !templates.includes(argTemplate)) {
    console.error(chalk.red(`Template "${argTemplate}" is not available.`));
    console.log(chalk.white("Available templates:"), templates.join(", "));
    process.exit(1);
  }

  // Prepare prompts, skipping those with provided arguments
  const prompts: any[] = [];

  if (!argProjectName) {
    prompts.push({
      type: "input",
      name: "projectName",
      message: "Enter your project name (ESC to cancel):",
      validate: (input: string) =>
        input ? true : "Project name cannot be empty.",
    });
  }

  if (!argTemplate) {
    prompts.push({
      type: "list",
      name: "template",
      message: "Select a template (ESC to cancel):",
      choices: templates,
    });
  }

  // Get answers from prompts (if any are needed)
  let answers = {};
  if (prompts.length > 0) {
    try {
      answers = await inquirer.prompt(prompts);
    } catch (error: any) {
      // Handle Ctrl+C or ESC cancellation
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
  const template = argTemplate || answers.template;
  const dest = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(dest)) {
    console.error(chalk.red(`Folder "${projectName}" already exists.`));
    process.exit(1);
  }

  // End interactive phase - now we're in installation phase
  isInteractivePhase = false;

  // Restore normal stdin mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  console.log(chalk.green(`\nCloning template "${template}"...\n`));

  const git = simpleGit();
  await git.clone(REPO, projectName, ["--depth", "1"]);

  const examplesDir = path.join(dest, EXAMPLES_PATH);
  const templateDir = path.join(examplesDir, template);

  if (!fs.existsSync(templateDir)) {
    console.error(chalk.red(`Template "${template}" not found.`));
    process.exit(1);
  }

  // Move files up
  for (const file of fs.readdirSync(templateDir)) {
    fs.renameSync(path.join(templateDir, file), path.join(dest, file));
  }

  fs.rmSync(examplesDir, { recursive: true, force: true });
  fs.rmSync(path.join(dest, ".git"), { recursive: true, force: true });

  console.log(chalk.yellow("\nInstalling dependencies...\n"));
  execSync("pnpm install", { cwd: dest, stdio: "inherit" });

  console.log(
    chalk.green(
      `\n✅ Project "${projectName}" created successfully using "${template}" template!\n`,
    ),
  );
  console.log(chalk.cyan("Next steps:"));
  console.log(chalk.white(`	cd ${projectName}`));
  console.log(chalk.white(`	cp .env.example .env`));
  console.log(chalk.white(`\nFor development scenarios:`));
  console.log(chalk.cyan(`	• Using an existing model:`));
  console.log(
    chalk.white(`	  - Edit .env and set your NEXT_PUBLIC_REACTOR_API_KEY`),
  );
  console.log(chalk.cyan(`\n	• Local development with custom model:`));
  console.log(
    chalk.white(
      `	  - Set local={true} in your ReactorProvider in app/page.tsx:`,
    ),
  );
  console.log(chalk.gray(`	    <ReactorProvider modelName="..." local={true}>`));
  console.log(chalk.white(`\n	pnpm dev\n`));
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
