import { intro, outro, text, confirm, spinner } from "@clack/prompts";
import { isValidCoreRepo } from "../utils/git.js";
import { fileExists, updateEnvFile } from "../utils/file.js";
import { checkPostgresHealth, executeDockerCommand } from "../utils/docker.js";
import { printCoreBrainLogo } from "../utils/ascii.js";
import { setupEnvFile } from "../utils/env.js";
import { execSync } from "child_process";
import path from "path";

export async function initCommand() {
  // Display the CORE brain logo
  printCoreBrainLogo();

  intro("🚀 Core Development Environment Setup");

  // Step 1: Validate repository
  if (!isValidCoreRepo()) {
    outro(
      "L Error: This command must be run in the https://github.com/redplanethq/core repository"
    );
    process.exit(1);
  }

  const rootDir = process.cwd();
  const triggerDir = path.join(rootDir, "trigger");

  try {
    // Step 2: Setup .env file in root
    const s1 = spinner();
    s1.start("Setting up .env file in root folder...");

    const envPath = path.join(rootDir, ".env");
    const envExists = await fileExists(envPath);

    try {
      await setupEnvFile(rootDir, "root");
      if (envExists) {
        s1.stop("✅ .env file already exists in root");
      } else {
        s1.stop("✅ Copied .env.example to .env");
      }
    } catch (error: any) {
      s1.stop(error.message);
      process.exit(1);
    }

    // Step 3: Docker compose up -d in root
    const s2 = spinner();
    s2.start("Starting Docker containers in root...");

    try {
      await executeDockerCommand("docker compose up -d", rootDir);
      s2.stop("Docker containers started");
    } catch (error: any) {
      s2.stop("L Failed to start Docker containers");
      throw error;
    }

    // Step 4: Check if postgres is running
    const s3 = spinner();
    s3.start("Checking PostgreSQL connection...");

    let retries = 0;
    const maxRetries = 30;

    while (retries < maxRetries) {
      if (await checkPostgresHealth()) {
        s3.stop("PostgreSQL is running on localhost:5432");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      retries++;
    }

    if (retries >= maxRetries) {
      s3.stop("L PostgreSQL not accessible on localhost:5432");
      outro("Please check your Docker setup and try again");
      process.exit(1);
    }

    // Step 5: Setup .env file in trigger
    const s4 = spinner();
    s4.start("Setting up .env file in trigger folder...");

    const triggerEnvPath = path.join(triggerDir, ".env");
    const triggerEnvExists = await fileExists(triggerEnvPath);

    try {
      await setupEnvFile(triggerDir, "trigger");
      if (triggerEnvExists) {
        s4.stop("✅ .env file already exists in trigger");
      } else {
        s4.stop("✅ Copied trigger .env.example to trigger/.env");
      }
    } catch (error: any) {
      s4.stop(error.message);
      process.exit(1);
    }

    // Step 6: Docker compose up for trigger
    const s5 = spinner();
    s5.start("Starting Trigger.dev containers...");

    try {
      await executeDockerCommand("docker compose up -d", triggerDir);
      s5.stop("Trigger.dev containers started");
    } catch (error: any) {
      s5.stop("L Failed to start Trigger.dev containers");
      throw error;
    }

    // Step 7: Show login instructions
    outro("< Docker containers are now running!");
    console.log("\n= Next steps:");
    console.log("1. Open http://localhost:8030 in your browser");
    console.log(
      "2. Login to Trigger.dev (check container logs with: docker logs trigger-webapp --tail 50)"
    );
    console.log("3. Press Enter when ready to continue...");

    await confirm({
      message: "Have you logged in to Trigger.dev and ready to continue?",
    });

    // Step 8: Get project details
    console.log("\n= In Trigger.dev (http://localhost:8030):");
    console.log("1. Create a new organization and project");
    console.log("2. Go to project settings");
    console.log("3. Copy the Project ID and Secret Key");

    await confirm({
      message: "Press Enter to continue after creating org and project...",
    });

    // Step 9: Get project ID and secret
    const projectId = await text({
      message: "Enter your Trigger.dev Project ID:",
      validate: (value) => {
        if (!value || value.length === 0) {
          return "Project ID is required";
        }
        return;
      },
    });

    const secretKey = await text({
      message: "Enter your Trigger.dev Secret Key for production:",
      validate: (value) => {
        if (!value || value.length === 0) {
          return "Secret Key is required";
        }
        return;
      },
    });

    // Step 10: Update .env with project details
    const s6 = spinner();
    s6.start("Updating .env with Trigger.dev configuration...");

    try {
      await updateEnvFile(envPath, "TRIGGER_PROJECT_ID", projectId as string);
      await updateEnvFile(envPath, "TRIGGER_SECRET_KEY", secretKey as string);
      s6.stop("Updated .env with Trigger.dev configuration");
    } catch (error: any) {
      s6.stop("L Failed to update .env file");
      throw error;
    }

    // Step 11: Restart docker-compose in root
    const s7 = spinner();
    s7.start("Restarting Docker containers with new configuration...");

    try {
      await executeDockerCommand("docker compose down && docker compose up -d", rootDir);
      s7.stop("Docker containers restarted");
    } catch (error: any) {
      s7.stop("L Failed to restart Docker containers");
      throw error;
    }

    // Step 12: Show docker login instructions
    console.log("\n=3 Docker Registry Login:");
    console.log("Run the following command to login to Docker registry:");

    try {
      // Read env file to get docker registry details
      const envContent = await import("fs").then((fs) => fs.promises.readFile(envPath, "utf8"));
      const envLines = envContent.split("\n");

      const getEnvValue = (key: string) => {
        const line = envLines.find((l) => l.startsWith(`${key}=`));
        return line ? line.split("=")[1] : "";
      };

      const dockerRegistryUrl = getEnvValue("DOCKER_REGISTRY_URL");
      const dockerRegistryUsername = getEnvValue("DOCKER_REGISTRY_USERNAME");
      const dockerRegistryPassword = getEnvValue("DOCKER_REGISTRY_PASSWORD");

      console.log(
        `\ndocker login ${dockerRegistryUrl} -u ${dockerRegistryUsername} -p ${dockerRegistryPassword}`
      );
    } catch (error) {
      console.log("docker login <REGISTRY_URL> -u <USERNAME> -p <PASSWORD>");
    }

    await confirm({
      message: "Press Enter after completing Docker login...",
    });

    // Step 13: Final instructions
    outro("< Setup Complete!");
    console.log("\n< Your services are now running:");
    console.log('" Core Application: http://localhost:3033');
    console.log('" Trigger.dev: http://localhost:8030');
    console.log('" PostgreSQL: localhost:5432');
    console.log("\n( You can now start developing with Core!");
  } catch (error: any) {
    outro(`L Setup failed: ${error.message}`);
    process.exit(1);
  }
}
